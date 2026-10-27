import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  documentId,
  limit,
  type WhereFilterOp,
} from "firebase/firestore";
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
export function useRows<T>(
  path: string | null,
  filters: [string, WhereFilterOp, unknown][] = [],
  options: { pageSize?: number } = {},
) {
  const [windowSize, setWindowSize] = useState(options.pageSize || 50);
  const encoded = JSON.stringify(filters),
    key = path ? path + encoded + ":" + windowSize : null;
  const [state, set] = useState<{
    path: string | null;
    rows: (T & { id: string })[] | undefined;
    error: string;
    hasMore: boolean;
  }>({ path: key, rows: undefined, error: "", hasMore: false });
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      query(
        collection(db, path),
        ...(JSON.parse(encoded) as [string, WhereFilterOp, unknown][]).map(
          ([field, op, value]) => where(field, op, value),
        ),
        orderBy(documentId()),
        limit(windowSize + 1),
      ),
      (s) =>
        set({
          path: key,
          rows: s.docs
            .slice(0, windowSize)
            .map((d) => ({ ...d.data(), id: d.id }) as T & { id: string }),
          error: "",
          hasMore: s.size > windowSize,
        }),
      () =>
        set({
          path: key,
          rows: [],
          hasMore: false,
          error:
            "Could not load your records. Check your connection and sign in again.",
        }),
    );
  }, [path, encoded, key, windowSize]);
  return {
    ...(state.path === key
      ? state
      : { path: key, rows: undefined, error: "", hasMore: false }),
    loadMore: () => setWindowSize((n) => n + (options.pageSize || 50)),
  };
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
