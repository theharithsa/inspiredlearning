import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
export const emulators =
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_EMULATORS === "true" &&
  ["localhost", "127.0.0.1"].includes(location.hostname);
const app = initializeApp({
  apiKey: emulators ? "demo-key" : import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: emulators
    ? "demo-chaicart"
    : import.meta.env.VITE_FIREBASE_PROJECT_ID,
  authDomain: emulators
    ? "localhost"
    : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});
export const auth = getAuth(app),
  google = new GoogleAuthProvider();
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const functions = getFunctions(app, "asia-south1");
if (emulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9195", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8185);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
