import { domainWriteRoute, writeDomain } from "./api-domain-writes.js";
import { authenticateApiToken, manageTokens } from "./api-tokens.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { googleActor, readApi } from "./api.js";
const require = createRequire(import.meta.url);
const spec = JSON.parse(
  readFileSync(new URL("./openapi.json", import.meta.url)),
);
const status = {
  "invalid-argument": 400,
  unauthenticated: 401,
  "permission-denied": 403,
  "not-found": 404,
  "failed-precondition": 409,
  "resource-exhausted": 429,
  "already-exists": 409,
};
export function apiHandler({ db, auth, rate, measured, audit }) {
  return async (req, res) => {
    const requestedId = req.get("X-Request-Id");
    const requestId =
      typeof requestedId === "string" && /^[0-9a-f-]{36}$/.test(requestedId)
        ? requestedId
        : randomUUID();
    res.set("X-Request-Id", requestId);
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    const tokenBase = "/api/v1/admin/api-tokens";
    const management =
      req.path === tokenBase || req.path.startsWith(tokenBase + "/");
    const tokenId =
      req.path === tokenBase ? null : req.path.slice(tokenBase.length + 1);
    const writeRoute = domainWriteRoute(req.method, req.path);
    const methods = management
      ? tokenId
        ? ["DELETE"]
        : ["GET", "POST"]
      : writeRoute
        ? [req.method]
        : ["GET"];
    if (!methods.includes(req.method))
      return res
        .status(405)
        .set("Allow", methods.join(", "))
        .json({ error: { code: "method-not-allowed" } });
    if (req.path === "/api/openapi.json") return res.json(spec);
    if (req.path === "/api/docs" || req.path === "/api/docs/")
      return res
        .type("html")
        .send(
          '<!doctype html><html><head><title>InspiredLearning API</title><link rel="stylesheet" href="/api/docs/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/api/docs/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:"/api/openapi.json",dom_id:"#swagger-ui",persistAuthorization:false,validatorUrl:null});</script></body></html>',
        );
    if (
      ["/api/docs/swagger-ui.css", "/api/docs/swagger-ui-bundle.js"].includes(
        req.path,
      )
    )
      return res.sendFile(
        require.resolve("swagger-ui-dist/" + req.path.split("/").at(-1)),
      );
    try {
      rate("api-ip:" + req.ip, 120);
      const header = req.get("Authorization") || "";
      if (!/^Bearer \S+$/.test(header))
        return res.status(401).json({ error: { code: "unauthenticated" } });
      let actor, authTime;
      const bearer = header.slice(7);
      if (bearer.startsWith("ilapi_")) {
        if (management)
          return res.status(403).json({
            error: {
              code: "permission-denied",
              message: "Google sign-in is required to manage tokens.",
            },
          });
        actor = await authenticateApiToken(db, auth, bearer);
      } else {
        let t;
        try {
          t = await auth.verifyIdToken(bearer, true);
        } catch {
          return res.status(401).json({ error: { code: "unauthenticated" } });
        }
        actor = googleActor(t.uid, t);
        authTime = t.auth_time;
      }
      rate("api:" + actor.uid, 120);
      if (actor.apiTokenId) rate("api-token:" + actor.apiTokenId, 60);
      if (
        ((management && req.method === "POST") || writeRoute) &&
        (!req.is("application/json") ||
          JSON.stringify(req.body ?? null).length > 16384)
      )
        return res.status(400).json({
          error: {
            code: "invalid-argument",
            message: "Use a bounded JSON request.",
          },
        });
      const result = await measured(
        management
          ? "api.tokens." + req.method.toLowerCase()
          : writeRoute
            ? "api.write"
            : "api.read",
        actor,
        async (c) => {
          if (management)
            return manageTokens(
              db,
              actor,
              req.method,
              tokenId,
              req.body,
              req.query,
              c,
              { authTime, idempotencyKey: req.get("Idempotency-Key") },
            );
          if (writeRoute)
            return writeDomain(
              db,
              actor,
              req.method,
              req.path,
              req.body,
              req.query,
              c,
              req.get("Idempotency-Key"),
            );
          if (actor.apiTokenId)
            await audit(actor, c, "token.read", { tokenId: actor.apiTokenId });
          return readApi(db, actor, req.path, req.query, (operation, fields) =>
            audit(actor, c, operation, fields),
          );
        },
        req.get("traceparent"),
        requestId,
      );
      return res.json(result);
    } catch (e) {
      return res.status(status[e.code] || 500).json({
        error: {
          code: status[e.code] ? e.code : "internal",
          message: status[e.code] ? e.message : "Request failed.",
        },
      });
    }
  };
}
