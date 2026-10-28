import { isAdminApp } from "./surface";
import defaults from "../functions/runtime-defaults.json";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  GoogleAuthProvider,
} from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
export const emulators =
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_EMULATORS === "true" &&
  ["localhost", "127.0.0.1"].includes(location.hostname);
const required = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_APP_ID",
] as const;
if (!emulators && required.some((key) => !import.meta.env[key]))
  throw new Error(
    "Firebase configuration is incomplete. Contact the application operator.",
  );
const app = initializeApp(
  {
    apiKey: emulators ? "demo-key" : import.meta.env.VITE_FIREBASE_API_KEY,
    projectId: emulators
      ? defaults.emulatorProject
      : import.meta.env.VITE_FIREBASE_PROJECT_ID,
    authDomain: emulators
      ? "localhost"
      : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  },
  isAdminApp ? "inspiredlearning-admin" : "[DEFAULT]",
);
export const auth = getAuth(app),
  google = new GoogleAuthProvider();
// Approved 28 October 2026: per-tab admin session; learner persistence unchanged.
export const authReady = isAdminApp
  ? setPersistence(auth, browserSessionPersistence)
  : Promise.resolve();
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});
export const functions = getFunctions(app, defaults.region);
if (emulators) {
  connectAuthEmulator(auth, `http://127.0.0.1:${defaults.ports.auth}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, "127.0.0.1", defaults.ports.firestore);
  connectFunctionsEmulator(
    functions,
    "127.0.0.1",
    Number(
      import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || defaults.ports.functions,
    ),
  );
}

// Clear only this Firestore instance's legacy cache, before any listeners start.
export const cacheReady = emulators
  ? Promise.resolve()
  : clearIndexedDbPersistence(db);
