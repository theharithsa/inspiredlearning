// Test-only Vite module. Not imported by production entrypoints.
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import { auth } from "../src/firebase";
if (
  !import.meta.env.DEV ||
  import.meta.env.VITE_USE_EMULATORS !== "true" ||
  auth.app.options.projectId !== "demo-chaicart"
)
  throw new Error("Browser rehearsal requires local Firebase emulators.");
export async function login(email: string) {
  const claims = {
    iss: "https://accounts.google.com",
    aud: "demo-client",
    sub: email,
    email,
    email_verified: true,
    name: email.split("@")[0],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const part = (v: unknown) =>
    btoa(JSON.stringify(v))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  const token = part({ alg: "none", typ: "JWT" }) + "." + part(claims) + ".";
  return (
    await signInWithCredential(auth, GoogleAuthProvider.credential(token))
  ).user.uid;
}
export async function anonymous() {
  return (await signInAnonymously(auth)).user.uid;
}
export async function logout() {
  await signOut(auth);
}
