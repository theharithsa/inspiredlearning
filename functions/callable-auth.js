import { HttpsError } from "firebase-functions/v2/https";
import { googleActor } from "./api.js";
// Callable middleware verifies signatures; verify current revocation/disabled state too.
export async function callableActor(request, auth) {
  googleActor(request.auth?.uid, request.auth?.token);
  const header = request.rawRequest?.headers?.authorization;
  if (typeof header !== "string" || !/^Bearer \S+$/.test(header))
    throw new HttpsError("unauthenticated", "Sign in with Google again.");
  let token;
  try {
    token = await auth.verifyIdToken(header.slice(7), true);
  } catch {
    throw new HttpsError("unauthenticated", "Sign in with Google again.");
  }
  if (token.uid !== request.auth.uid)
    throw new HttpsError("unauthenticated", "Sign in with Google again.");
  return googleActor(token.uid, token);
}
