import { requireRecentAuth } from "./admin-session.js";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { Timestamp, FieldPath } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { requireAdmin } from "./admin.js";
import { validUid, validSid } from "./model.js";
import { pageOptions, iso } from "./api.js";
import { queue } from "./events.js";
import { API_PERMISSIONS } from "./api-token-policy.js";
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
const uuid = (s) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const hash = (s) => createHash("sha256").update(s).digest("hex");
const metadata = (id, r) => ({
  id,
  name: r.name,
  scopes: r.scopes,
  studentIds: r.studentIds,
  workshopIds: r.workshopIds,
  createdAt: iso(r.createdAt),
  expiresAt: iso(r.expiresAt),
  revokedAt: iso(r.revokedAt),
  status: r.revokedAt
    ? "revoked"
    : r.expiresAt.toMillis() <= Date.now()
      ? "expired"
      : "active",
});
export function tokenInput(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) =>
        ![
          "name",
          "scopes",
          "studentIds",
          "workshopIds",
          "expiresInDays",
        ].includes(k),
    )
  )
    fail("invalid-argument", "Invalid token settings.");
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.trim().length > 80
  )
    fail("invalid-argument", "Name the integration using 1–80 characters.");
  if (
    !Array.isArray(body.scopes) ||
    !body.scopes.length ||
    body.scopes.length > API_PERMISSIONS.length ||
    body.scopes.some((s) => !API_PERMISSIONS.some((p) => p.scope === s))
  )
    fail("invalid-argument", "Choose supported read permissions.");
  const ids = (value, valid) => {
    if (value === undefined) return [];
    if (
      !Array.isArray(value) ||
      value.length > 50 ||
      value.some((s) => !valid(s))
    )
      fail("invalid-argument", "Use up to 50 valid resource IDs.");
    return [...new Set(value)].sort();
  };
  const expiresInDays = body.expiresInDays ?? 7;
  if (![1, 7, 30].includes(expiresInDays))
    fail("invalid-argument", "Expiry must be 1, 7 or 30 days.");
  return {
    name: body.name.trim(),
    scopes: [...new Set(body.scopes)].sort(),
    studentIds: ids(body.studentIds, validUid),
    workshopIds: ids(body.workshopIds, validSid),
    expiresInDays,
  };
}
export async function manageTokens(
  db,
  actor,
  method,
  tokenId,
  body,
  query,
  c,
  options = {},
) {
  if (actor.apiTokenId)
    fail("permission-denied", "Google sign-in is required to manage tokens.");
  // Authorization precedes both lookups and mutations; transactions recheck it.
  await requireAdmin({ get: (ref) => ref.get() }, db, actor);
  if (method === "GET" && !tokenId) {
    const p = pageOptions(query, `${actor.uid}:api-tokens`);
    let q = db
      .collection("learningApiTokens")
      .where("ownerUid", "==", actor.uid)
      .orderBy(FieldPath.documentId());
    if (p.after) q = q.startAfter(p.after);
    const rows = await q.limit(p.limit + 1).get(),
      docs = rows.docs.slice(0, p.limit);
    await db.runTransaction(async (tx) => {
      await requireAdmin(tx, db, actor);
      queue(tx, db, "api-token.listed", actor, c);
    });
    return {
      items: docs.map((d) => metadata(d.id, d.data())),
      nextCursor: rows.size > p.limit ? p.cursor(docs.at(-1).id) : null,
      asOf: new Date().toISOString(),
      permissions: API_PERMISSIONS,
    };
  }
  if (Object.keys(query).length)
    fail("invalid-argument", "Token changes have no query parameters.");
  if (method === "POST" && !tokenId) {
    requireRecentAuth(options.authTime);
    if (!uuid(options.idempotencyKey))
      fail("invalid-argument", "A UUID Idempotency-Key header is required.");
    const input = tokenInput(body),
      id = options.idempotencyKey;
    const secret = `ilapi_${id}_${randomBytes(32).toString("base64url")}`,
      requestHash = hash(JSON.stringify(input));
    const expiresAt = Timestamp.fromMillis(
      Date.now() + input.expiresInDays * 86400000,
    );
    return db.runTransaction(async (tx) => {
      await requireAdmin(tx, db, actor);
      const ref = db.doc(`learningApiTokens/${id}`),
        ownerRef = db.doc(`learningApiTokenOwners/${actor.uid}`);
      const [existing, owner] = await Promise.all([
        tx.get(ref),
        tx.get(ownerRef),
      ]);
      if (existing.exists) {
        const r = existing.data();
        if (r.ownerUid !== actor.uid || r.requestHash !== requestHash)
          fail(
            "already-exists",
            "This creation request has already been used.",
          );
        return { token: metadata(id, r), secret: null, alreadyCreated: true };
      }
      const slots = (owner.data()?.slots || []).filter(
        (s) => s.expiresAtMs > Date.now(),
      );
      if (slots.length >= 25)
        fail(
          "resource-exhausted",
          "Revoke an active token before creating another (maximum 25).",
        );
      const record = {
        ...input,
        ownerUid: actor.uid,
        ownerEmail: actor.email,
        secretHash: hash(secret),
        requestHash,
        createdAt: Timestamp.now(),
        expiresAt,
        revokedAt: null,
      };
      tx.create(ref, record);
      tx.set(ownerRef, {
        slots: [...slots, { id, expiresAtMs: expiresAt.toMillis() }],
      });
      queue(tx, db, "api-token.created", actor, c, {
        "api.token.id": id,
        "api.token.scopes": input.scopes,
      });
      return { token: metadata(id, record), secret, alreadyCreated: false };
    });
  }
  if (method === "DELETE" && uuid(tokenId)) {
    return db.runTransaction(async (tx) => {
      await requireAdmin(tx, db, actor);
      const ref = db.doc(`learningApiTokens/${tokenId}`),
        ownerRef = db.doc(`learningApiTokenOwners/${actor.uid}`);
      const [snap, owner] = await Promise.all([tx.get(ref), tx.get(ownerRef)]);
      if (!snap.exists || snap.data().ownerUid !== actor.uid)
        fail("not-found", "Token unavailable.");
      if (!snap.data().revokedAt) {
        tx.update(ref, { revokedAt: Timestamp.now() });
        tx.set(ownerRef, {
          slots: (owner.data()?.slots || []).filter((s) => s.id !== tokenId),
        });
        queue(tx, db, "api-token.revoked", actor, c, {
          "api.token.id": tokenId,
        });
      }
      return { revoked: true, id: tokenId };
    });
  }
  fail("invalid-argument", "Unsupported token operation.");
}
export async function authenticateApiToken(db, auth, bearer) {
  const match = /^ilapi_([0-9a-f-]{36})_([A-Za-z0-9_-]{43})$/.exec(bearer);
  if (!match || !uuid(match[1]))
    fail("unauthenticated", "API token unavailable.");
  const snap = await db.doc(`learningApiTokens/${match[1]}`).get(),
    r = snap.data();
  if (
    !r ||
    r.revokedAt ||
    !r.expiresAt?.toMillis ||
    r.expiresAt.toMillis() <= Date.now() ||
    !/^[0-9a-f]{64}$/.test(r.secretHash || "") ||
    !timingSafeEqual(
      Buffer.from(r.secretHash, "hex"),
      Buffer.from(hash(bearer), "hex"),
    )
  )
    fail("unauthenticated", "API token unavailable.");
  let user;
  try {
    user = await auth.getUser(r.ownerUid);
  } catch {
    fail("unauthenticated", "API token unavailable.");
  }
  if (
    user.disabled ||
    !user.emailVerified ||
    user.email !== r.ownerEmail ||
    !user.providerData?.some((p) => p.providerId === "google.com")
  )
    fail("unauthenticated", "API token unavailable.");
  const actor = {
    uid: r.ownerUid,
    email: user.email,
    apiTokenId: snap.id,
    apiScopes: r.scopes,
    apiStudentIds: r.studentIds || [],
    apiWorkshopIds: r.workshopIds || [],
  };
  try {
    await requireAdmin({ get: (ref) => ref.get() }, db, actor);
  } catch {
    fail("unauthenticated", "API token unavailable.");
  }
  return actor;
}
