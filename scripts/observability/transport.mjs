export async function boundedJson(response, limit = 100000) {
  const parts = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > limit) throw Error("Response bound exceeded");
    parts.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
export function telemetryOrigin(value, { local = false } = {}) {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    (u.port && !local) ||
    !(
      (u.protocol === "https:" && u.hostname.endsWith(".live.dynatrace.com")) ||
      (local && u.protocol === "http:" && u.hostname === "127.0.0.1")
    )
  )
    throw Error("Invalid telemetry origin");
  return u.origin;
}
export async function sendRecord(
  origin,
  token,
  payload,
  {
    native = false,
    local = false,
    fetcher = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  const base = telemetryOrigin(origin, { local });
  if (!token && !local)
    throw Error("Dedicated telemetry credential not configured");
  const bytes = JSON.stringify(payload);
  if (Buffer.byteLength(bytes) > 100000)
    throw Error("Telemetry record too large");
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await fetcher(
        base + (native ? "/api/v2/events/ingest" : "/api/v2/bizevents/ingest"),
        {
          method: "POST",
          headers: {
            "Content-Type": native
              ? "application/json"
              : "application/cloudevents+json",
            ...(token
              ? {
                  Authorization:
                    (token.startsWith("dt0c01.") ? "Api-Token " : "Bearer ") +
                    token,
                }
              : {}),
          },
          body: bytes,
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      if (attempt === 3)
        return {
          accepted: false,
          status: null,
          attempts: attempt,
          reason: "transport",
        };
    }
    if (response) {
      if (!native && response.status === 202)
        return {
          accepted: true,
          status: 202,
          attempts: attempt,
          tenantVisibility: "not-verified",
        };
      if (native && response.status === 201) {
        let body;
        try {
          body = await boundedJson(response);
        } catch {}
        const accepted =
          Number.isSafeInteger(body?.reportCount) &&
          body.reportCount > 0 &&
          Array.isArray(body.eventIngestResults) &&
          body.eventIngestResults.length === body.reportCount &&
          body.eventIngestResults.every((r) => r?.status === "OK");
        return {
          accepted,
          status: 201,
          attempts: attempt,
          reason: accepted ? undefined : "native-partial-or-invalid",
          tenantVisibility: "not-verified",
        };
      }
      if (response.status !== 429 && response.status < 500)
        return {
          accepted: false,
          status: response.status,
          attempts: attempt,
          reason: "permanent",
        };
    }
    if (attempt < 3) {
      const raw = response?.headers.get("retry-after");
      const seconds =
        raw && /^\d+$/.test(raw)
          ? Number(raw)
          : Math.max(0, (Date.parse(raw || "") - Date.now()) / 1000);
      await sleep(
        Math.min(
          10000,
          Math.max(
            250,
            Number.isFinite(seconds) ? seconds * 1000 : 250 * 2 ** attempt,
          ),
        ),
      );
    }
  }
  return {
    accepted: false,
    status: null,
    attempts: 3,
    reason: "transient-exhausted",
  };
}
