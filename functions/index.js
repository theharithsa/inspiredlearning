import { SpanKind } from "@opentelemetry/api";
import { getAuth } from "firebase-admin/auth";
import { apiHandler } from "./api-http.js";
import { googleActor } from "./api.js";
import { eventRecord } from "./events.js";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import { execute, enroll, verification } from "./actions.js";
import { measured, token, log } from "./monitor.js";
import { validCertificate, validSid, validUid } from "./model.js";
import { certificatePdf } from "./pdf.js";
import { queue } from "./events.js";
initializeApp();
const db = getFirestore(),
  options = {
    region: "asia-south1",
    secrets: [token],
    maxInstances: 2,
    memory: "512MiB",
    timeoutSeconds: 540,
  };
const actorOf = (r) => {
  return googleActor(r.auth?.uid, r.auth?.token);
};
const buckets = new Map();
function rate(key, limit = 120) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > 60000) {
    b = { start: now, n: 0 };
    buckets.set(key, b);
  }
  if (++b.n > limit)
    throw new HttpsError(
      "resource-exhausted",
      "Please wait a minute and try again.",
    );
  if (buckets.size > 10000)
    for (const [k, v] of buckets) if (now - v.start > 60000) buckets.delete(k);
}
export const learningAction = onCall(options, async (r) => {
  const actor = actorOf(r);
  rate(actor.uid);
  if (
    !r.data ||
    typeof r.data !== "object" ||
    Array.isArray(r.data) ||
    JSON.stringify(r.data).length > 32768
  )
    throw new HttpsError("invalid-argument", "Invalid learning request.");
  if (
    ![
      "profile",
      "requestCorrection",
      "certificateVisibility",
      "access",
      "roster",
      "sync",
      "close",
      "attendance",
      "attendanceBatch",
      "finalize",
      "revoke",
      "requests",
      "reviewRequest",
      "lookup",
      "correctCertificate",
      "eraseLearner",
      "reactivate",
      "updateLearner",
      "restoreCompletion",
    ].includes(r.data.action)
  )
    throw new HttpsError("invalid-argument", "Unknown learning action.");
  return measured(
    "learning." + r.data.action,
    actor,
    (c) => execute(db, actor, r.data, c),
    r.rawRequest?.headers?.traceparent,
    r.data.transactionId,
  );
});
export const learningCertificate = onCall(options, async (r) => {
  const actor = actorOf(r);
  rate(actor.uid, 30);
  if (!validCertificate(r.data?.id))
    throw new HttpsError("invalid-argument", "Choose a valid certificate.");
  return measured(
    "certificate.download",
    actor,
    async (c) => {
      const ref = db.doc(`learningCertificates/${r.data.id}`),
        snap = await ref.get(),
        cert = snap.data();
      let administratorPreview = false;
      if (!cert)
        throw new HttpsError(
          "permission-denied",
          "This certificate is not available to your account.",
        );
      if (cert.uid !== actor.uid) {
        const administrator = await db.doc(`admins/${actor.email}`).get();
        administratorPreview =
          administrator.exists &&
          (administrator.data().role || "facilitator") === "facilitator";
        if (!administratorPreview)
          throw new HttpsError(
            "permission-denied",
            "This certificate is not available to your account.",
          );
        if (
          typeof r.data.reason !== "string" ||
          !r.data.reason.trim() ||
          r.data.reason.length > 500
        )
          throw new HttpsError(
            "invalid-argument",
            "Add a reason for administrator certificate preview.",
          );
      }
      if (cert.status !== "issued" && !administratorPreview)
        throw new HttpsError(
          "failed-precondition",
          "This certificate has been revoked or replaced.",
        );
      const [result, privacy] = await Promise.all([
        db.doc(`learningLearners/${cert.uid}/workshops/${cert.sid}`).get(),
        db.doc(`learningPrivacy/${cert.uid}`).get(),
      ]);
      const { privacyBlocked } = await import("./erasure.js");
      if (privacyBlocked(privacy.data(), cert.sid))
        throw new HttpsError(
          "failed-precondition",
          "This learner requested removal.",
        );
      const current =
        result.data()?.status === "completed" &&
        (cert.kind === "award" ? cert.parentCertificateId : cert.id) ===
          result.data()?.certificateId;
      if (!current && !administratorPreview)
        throw new HttpsError(
          "failed-precondition",
          "This certificate has been replaced. Download the current version.",
        );
      const bytes = await certificatePdf(
        current ? cert : { ...cert, status: "revoked" },
      );
      await db
        .collection("learningTelemetry")
        .add(
          (await import("./events.js")).eventRecord(
            administratorPreview
              ? "certificate.admin-preview.prepared"
              : "certificate.download.prepared",
            actor,
            c,
            {
              "certificate.id": cert.id,
              "workshop.session.id": cert.sid,
              "certificate.kind":
                cert.kind === "award" ? "award" : "participation",
            },
          ),
        );
      return {
        base64: bytes.toString("base64"),
        filename: `InspiredLearning-${cert.sid}-${cert.id.slice(0, 8)}.pdf`,
      };
    },
    r.rawRequest?.headers?.traceparent,
    r.data.transactionId,
  );
});
export const learningVerify = onCall(options, async (r) => {
  rate("verify:" + r.rawRequest.ip, 60);
  return measured(
    "certificate.verify",
    null,
    () => verification(db, r.data?.id),
    r.rawRequest?.headers?.traceparent,
    r.data?.transactionId,
  );
});
export const learningTelemetry = onCall(options, async (r) => {
  const actor = actorOf(r);
  rate("telemetry:" + actor.uid, 100);
  const allowed = new Set([
    "ui.click",
    "page.view",
    "auth.signed-in",
    "auth.signed-out",
    "certificate.download",
    "discord.opened",
    "workshop.viewed",
    "profile.saved",
  ]);
  if (!allowed.has(r.data?.name))
    throw new HttpsError("invalid-argument", "Unknown telemetry event.");
  return measured(
    "browser." + r.data.name,
    actor,
    async () => {
      log("INFO", "Learner interaction", {
        "event.name": r.data.name,
        "event.authority": "client-observed",
        ...(validSid(r.data.sid) ? { "workshop.session.id": r.data.sid } : {}),
      });
      return { accepted: true };
    },
    r.rawRequest?.headers?.traceparent,
    r.data.transactionId,
  );
});
export const recordLearningEnrollment = onDocumentCreated(
  { ...options, document: "sessions/{sid}/students/{uid}", retry: true },
  async (e) => {
    if (!validSid(e.params.sid) || !validUid(e.params.uid)) return;
    const session = await db.doc(`sessions/${e.params.sid}`).get();
    if (!session.exists || session.data().deleting) return;
    return measured(
      "enrollment.record",
      { uid: e.params.uid },
      (c) =>
        enroll(
          db,
          e.params.sid,
          e.params.uid,
          e.data.data(),
          session.data(),
          c,
          { uid: e.params.uid },
        ),
      undefined,
      undefined,
      { kind: SpanKind.CONSUMER },
    );
  },
);
export const cancelLearningEnrollment = onDocumentDeleted(
  { ...options, document: "sessions/{sid}", retry: true },
  async (e) => {
    if (!validSid(e.params.sid)) return;
    return measured(
      "enrollment.cancel",
      { uid: "system" },
      async (c) => {
        const index = await db.doc(`learningEnrollments/${e.params.sid}`).get();
        for (const uid of index.data()?.uids || []) {
          await db.runTransaction(async (tx) => {
            const ref = db.doc(
                `learningLearners/${uid}/workshops/${e.params.sid}`,
              ),
              s = await tx.get(ref);
            if (
              ["registered", "completion-pending"].includes(s.data()?.status)
            ) {
              tx.update(ref, {
                status: "cancelled",
                updatedAt: FieldValue.serverTimestamp(),
              });
              queue(tx, db, "enrollment.cancelled", { uid: "system" }, c, {
                "learner.id": uid,
                "workshop.session.id": e.params.sid,
              });
            }
          });
        }
      },
      undefined,
      undefined,
      { kind: SpanKind.CONSUMER },
    );
  },
);

export { deliverLearningEvent, retryLearningEvents } from "./events.js";

export const learningApi = onRequest(
  options,
  apiHandler({
    db,
    auth: getAuth(),
    rate,
    measured,
    audit: (actor, c, operation, fields) =>
      db.collection("learningTelemetry").add(
        eventRecord("api." + operation, actor, c, {
          "learner.id": fields.studentId || null,
          ...(actor.apiTokenId ? { "api.token.id": actor.apiTokenId } : {}),
        }),
      ),
  }),
);
