import { reauthenticateWithPopup } from "firebase/auth";
import { auth, google } from "./firebase";
export async function ensureRecentAdminAuth() {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in with Google.");
  const token = await user.getIdTokenResult();
  if (auth.currentUser?.uid !== user.uid)
    throw new Error("Your signed-in account changed. Review the action again.");
  const age = Date.now() / 1000 - Number(token.claims.auth_time);
  if (!Number.isFinite(age) || age > 300 || age < -60) {
    await reauthenticateWithPopup(user, google);
    if (auth.currentUser?.uid !== user.uid)
      throw new Error(
        "Your signed-in account changed. Review the action again.",
      );
    await user.getIdToken(true);
  }
}
