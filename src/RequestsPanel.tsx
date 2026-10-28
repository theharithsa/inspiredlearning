import Tabs from "./ui/Tabs";
import Loading from "./ui/Loading";
import Button from "./ui/Button";
import Field from "./ui/Field";
import { confirmAction } from "./ui/Confirm";
import type { LearnerRequest as Request } from "./types";
import { useEffect, useRef, useState, useId } from "react";
import {
  collection,
  documentId,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { action, errorMessage } from "./observability";
import { Message } from "./components";
export default function RequestsPanel({
  onOpen,
  reason,
  refresh,
  onDone,
}: {
  onOpen: (uid: string) => void;
  reason: string;
  refresh: number;
  onDone: () => void;
}) {
  const panelId = useId();
  const [history, setHistory] = useState(false),
    [rows, setRows] = useState<Request[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [loadedKey, setLoadedKey] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [removal, setRemoval] = useState<Request | null>(null),
    [confirmUid, setConfirmUid] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const removalForm = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (removal) removalForm.current?.focus();
  }, [removal]);
  const key = history + ":" + refresh + ":" + pageSize,
    loading = loadedKey !== key;
  useEffect(() => {
    let active = true;
    const unsubscribe = onSnapshot(
      query(
        collection(db, "learningRequests"),
        where(
          "status",
          "in",
          history
            ? ["resolved", "rejected", "reviewed", "superseded"]
            : ["open", "processing"],
        ),
        orderBy(documentId()),
        limit(pageSize + 1),
      ),
      (snapshot) => {
        if (!active) return;
        setRows(
          snapshot.docs
            .slice(0, pageSize)
            .map((doc) => ({ ...doc.data(), id: doc.id }) as Request),
        );
        setCursor(
          snapshot.size > pageSize ? snapshot.docs[pageSize - 1].id : null,
        );
        setError("");
        setLoadedKey(key);
      },
      () => {
        if (!active) return;
        setRows([]);
        setCursor(null);
        setError(
          "Could not load requests. Check your connection and administrator access.",
        );
        setLoadedKey(key);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [history, key, pageSize]);
  async function run(work: () => Promise<{ message?: string }>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await work();
      setNotice(r.message || "Request updated.");
      setRemoval(null);
      setConfirmUid("");
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      <h3>Student requests</h3>
      <Tabs
        labels={["Pending requests", "Request history"]}
        panelId={panelId}
        value={history ? 1 : 0}
        onChange={(index) => {
          setHistory(index === 1);
          setPageSize(50);
          setRemoval(null);
          setError("");
          setNotice("");
        }}
      />
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={panelId + "-tab-" + (history ? 1 : 0)}
        className="stack"
      >
        {error && <Message error>{error}</Message>}
        {notice && <Message>{notice}</Message>}
        {loading ? (
          <Loading>Loading requests…</Loading>
        ) : !rows.length ? (
          <p className="muted">
            {history ? "No reviewed requests." : "No pending requests."}
          </p>
        ) : (
          rows.map((r) => (
            <article className="panel" key={r.id}>
              <strong>
                {r.email || "Learner " + r.uid} · {r.kind}
              </strong>
              <p>{r.reason || r.resolution}</p>
              <p className="small">
                Status: {r.status} · Account reference: {r.uid}
              </p>
              {r.reason && r.resolution && <p>{r.resolution}</p>}
              <div className="staff-actions">
                <Button
                  className="text-button"
                  disabled={busy}
                  busy={!!busy}
                  onClick={() => onOpen(r.uid)}
                >
                  Open learner records
                </Button>
                {r.status === "open" ? (
                  <>
                    {r.kind === "erasure" ? (
                      <Button
                        className="button secondary"
                        disabled={busy || !reason.trim()}
                        busy={!!busy}
                        onClick={async () => {
                          setRemoval(r);
                          setConfirmUid("");
                        }}
                      >
                        Approve removal
                      </Button>
                    ) : (
                      <Button
                        className="button secondary"
                        disabled={busy || !reason.trim()}
                        busy={!!busy}
                        onClick={async () => {
                          if (
                            await confirmAction(
                              "Have you applied the verified correction? Resolve this request and share your review note with the learner?",
                            )
                          )
                            void run(() =>
                              action("reviewRequest", {
                                requestId: r.id,
                                reason,
                                decision: "resolved",
                              }),
                            );
                        }}
                      >
                        Resolve correction
                      </Button>
                    )}
                    <Button
                      className="text-button danger"
                      disabled={busy || !reason.trim()}
                      busy={!!busy}
                      onClick={() =>
                        run(() =>
                          action("reviewRequest", {
                            requestId: r.id,
                            reason,
                            decision: "rejected",
                          }),
                        )
                      }
                    >
                      Decline request
                    </Button>
                  </>
                ) : r.status === "processing" && r.kind === "erasure" ? (
                  <Button
                    className="button secondary"
                    disabled={busy || !reason.trim()}
                    busy={!!busy}
                    onClick={async () => {
                      setRemoval(r);
                      setConfirmUid("");
                    }}
                  >
                    Retry removal
                  </Button>
                ) : r.status !== "processing" &&
                  r.status !== "superseded" &&
                  r.resolutionAction !== "erased" ? (
                  <Button
                    className="button secondary"
                    disabled={busy || !reason.trim()}
                    busy={!!busy}
                    onClick={() =>
                      run(() =>
                        action("reviewRequest", {
                          requestId: r.id,
                          reason,
                          decision: "reopen",
                        }),
                      )
                    }
                  >
                    Reopen request
                  </Button>
                ) : null}
              </div>
            </article>
          ))
        )}
        {cursor && (
          <Button
            className="button secondary"
            disabled={busy || loading}
            busy={!!busy}
            onClick={() => setPageSize((size) => size + 50)}
          >
            Load more requests
          </Button>
        )}
      </div>
      {removal && (
        <form
          ref={removalForm}
          tabIndex={-1}
          aria-label="Confirm learning record removal"
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() =>
              action("eraseLearner", {
                requestId: removal.id,
                uid: removal.uid,
                confirm: confirmUid,
                scope: "learning-records",
                reason,
              }),
            );
          }}
        >
          <h3>Remove InspiredLearning records?</h3>
          <p>
            This permanently removes this learner’s learning history, points
            ledger and certificates. Past workshop records cannot be imported
            again. Their shared Google sign-in and ChaiCart Live data stay
            available. A minimal removal marker and request status remain;
            existing monitoring data has separate retention controls. Downloaded
            certificate copies cannot be recalled.
          </p>
          <Field
            label="Type the learner account reference to confirm"
            value={confirmUid}
            onChange={(e) => setConfirmUid(e.target.value)}
          />
          <p className="small">{removal.uid}</p>
          <div className="staff-actions">
            <Button
              className="button danger"
              disabled={busy || confirmUid !== removal.uid || !reason.trim()}
              busy={!!busy}
            >
              Permanently remove learning records
            </Button>
            <Button
              type="button"
              className="button secondary"
              disabled={busy}
              busy={!!busy}
              onClick={() => setRemoval(null)}
            >
              Cancel removal
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
