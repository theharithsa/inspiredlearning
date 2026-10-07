import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
export const googleUser = (u: User | null | undefined) =>
  !!u &&
  !u.isAnonymous &&
  u.emailVerified &&
  u.providerData.some((p) => p.providerId === "google.com");
export function useUser() {
  const [u, set] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, set), []);
  return u;
}
export function useRows<T>(path: string | null) {
  const [state, set] = useState<{
    path: string | null;
    rows: (T & { id: string })[] | undefined;
    error: string;
  }>({ path, rows: undefined, error: "" });
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      collection(db, path),
      (s) =>
        set({
          path,
          rows: s.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as T & { id: string },
          ),
          error: "",
        }),
      () =>
        set({
          path,
          rows: [],
          error:
            "Could not load your records. Check your connection and sign in again.",
        }),
    );
  }, [path]);
  return state.path === path ? state : { path, rows: undefined, error: "" };
}
export function useRecord<T>(path: string | null) {
  const [state, set] = useState<{
    path: string | null;
    record: T | null | undefined;
  }>({ path, record: undefined });
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      doc(db, path),
      (s) => set({ path, record: s.exists() ? (s.data() as T) : null }),
      () => set({ path, record: null }),
    );
  }, [path]);
  return state.path === path ? state.record : undefined;
}
