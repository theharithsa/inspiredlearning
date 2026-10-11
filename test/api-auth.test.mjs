import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithCredential,
  signInAnonymously,
} from "firebase/auth";
import { apiHandler } from "../functions/api-http.js";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
test("HTTP API verifies shared Google tokens with real Firebase Auth and rejects disabled/anonymous users", async () => {
  if (
    !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    !process.env.FIRESTORE_EMULATOR_HOST
  )
    throw Error("Use isolated demo-chaicart emulators.");
  const {
    initializeApp: initializeAdmin,
    deleteApp: deleteAdmin,
  } = require("firebase-admin/app");
  const { getAuth: adminAuth } = require("firebase-admin/auth");
  const { getFirestore } = require("firebase-admin/firestore");
  const admin = initializeAdmin(
    { projectId: "demo-chaicart" },
    "api-auth-test",
  );
  const web = initializeApp(
    { projectId: "demo-chaicart", apiKey: "fake-test-key" },
    "api-auth-test",
  );
  const auth = getAuth(web);
  connectAuthEmulator(
    auth,
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,
    { disableWarnings: true },
  );
  const email = "api-auth@example.invalid",
    now = Math.floor(Date.now() / 1000);
  const part = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const credential = `${part({ alg: "none", typ: "JWT" })}.${part({ iss: "https://accounts.google.com", aud: "demo-client", sub: email, email, email_verified: true, name: "Auth learner", iat: now, exp: now + 3600 })}.`;
  let server;
  try {
    const user = (
      await signInWithCredential(
        auth,
        GoogleAuthProvider.credential(credential),
      )
    ).user;
    await getFirestore(admin)
      .doc(`learningLearners/${user.uid}`)
      .set({ name: "Auth learner", email });
    const express = require("express"),
      app = express();
    app.use(express.json({ limit: "16kb" }));
    app.use(
      apiHandler({
        db: getFirestore(admin),
        auth: adminAuth(admin),
        rate() {},
        measured: async (_op, _actor, work) =>
          work({
            transactionId: "auth-token-test",
            traceId: "a".repeat(32),
            spanId: "b".repeat(16),
          }),
        audit: async () => {},
      }),
    );
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/v1/me`;
    const token = await user.getIdToken();
    const read = (token) =>
      fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const own = await read(token);
    assert.equal(own.status, 200);
    assert.equal((await own.json()).studentId, user.uid);
    await getFirestore(admin)
      .doc(`admins/${email}`)
      .set({ role: "facilitator" });
    const management = `http://127.0.0.1:${server.address().port}/api/v1/admin/api-tokens`;
    const createdResponse = await fetch(management, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "44444444-4444-4444-8444-444444444444",
      },
      body: JSON.stringify({
        name: "Auth emulator token",
        scopes: ["students:read", "students:profile:write"],
        studentIds: [user.uid],
        expiresInDays: 1,
      }),
    });
    assert.equal(
      createdResponse.status,
      200,
      await createdResponse.clone().text(),
    );
    const created = await createdResponse.json();
    assert.match(created.secret, /^ilapi_/);
    const withApiToken = await read(created.secret);
    assert.equal(withApiToken.status, 200);
    assert.equal((await withApiToken.json()).studentId, user.uid);
    const profileUrl = url.replace(/\/me$/, `/students/${user.uid}/profile`);
    const writeHeaders = {
      Authorization: `Bearer ${created.secret}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "77777777-7777-4777-8777-777777777777",
    };
    const writeBody = JSON.stringify({
      name: "Corrected via API",
      expectedVersion: 0,
      reason: "Verified profile correction",
    });
    const corrected = await fetch(profileUrl, {
      method: "PUT",
      headers: writeHeaders,
      body: writeBody,
    });
    assert.equal(corrected.status, 200, await corrected.clone().text());
    const repeated = await fetch(profileUrl, {
      method: "PUT",
      headers: writeHeaders,
      body: writeBody,
    });
    assert.deepEqual(await repeated.json(), await corrected.json());
    const deniedCollege = await fetch(url.replace(/\/me$/, "/colleges"), {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({
        collegeId: "auth-college",
        name: "College",
        status: "active",
        reason: "Setup",
      }),
    });
    assert.equal(deniedCollege.status, 403);
    const denied = await fetch(management, {
      headers: { Authorization: `Bearer ${created.secret}` },
    });
    assert.equal(denied.status, 403);
    const listed = await (
      await fetch(management, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    assert.equal(listed.items[0].secretHash, undefined);
    const revoked = await fetch(management + "/" + created.token.id, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(revoked.status, 200);
    assert.equal((await read(created.secret)).status, 401);

    assert.equal((await read("invalid-token")).status, 401);
    await adminAuth(admin).updateUser(user.uid, { disabled: true });
    assert.equal((await read(token)).status, 401);
    const anonymous = (await signInAnonymously(auth)).user;
    assert.equal((await read(await anonymous.getIdToken())).status, 401);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await deleteApp(web);
    await deleteAdmin(admin);
  }
});
