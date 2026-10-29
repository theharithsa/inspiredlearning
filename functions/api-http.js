import { adminAccess, requireAdminStepUp } from "./admin-session.js";
import { telemetryAdmin } from "./telemetry-admin.js";
import { verification } from "./actions.js";
import { reconcileCertificates } from "./certificate-repair.js";
import { domainWriteRoute, writeDomain } from "./api-domain-writes.js";
import { authenticateApiToken, manageTokens } from "./api-tokens.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { googleActor, readApi } from "./api.js";
import { log, httpRequest, instrumentAuth } from "./monitor.js";
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
  aborted: 409,
  "deadline-exceeded": 504,
  unavailable: 503,
};
// Collapse identifiers so span names and routes stay low-cardinality for Dynatrace service detection.
const routePatterns = Object.keys(spec.paths)
  .sort((a, b) => (a.match(/\{/g)?.length || 0) - (b.match(/\{/g)?.length || 0))
  .map((path) => ({
    path: "/api/v1" + path,
    pattern: new RegExp("^/api/v1" + path.replace(/\{[^}]+\}/g, "[^/]+") + "$"),
  }));
export const routeTemplate = (path) =>
  routePatterns.find((route) => route.pattern.test(path))?.path ||
  "/api/v1/{unmatched}";
const rejectAuth = (req, res, requestId, reason) => {
  log("WARN", "API authentication rejected", {
    "http.request.method": req.method,
    "http.route": routeTemplate(req.path),
    "request.id": requestId,
    reason,
  });
  return res.status(401).json({ error: { code: "unauthenticated" } });
};
export function apiHandler({ db, auth, rate, measured, audit }) {
  auth = instrumentAuth(auth);
  const handle = async (req, res) => {
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
    const repair =
      req.method === "POST" &&
      /^\/api\/v1\/workshops\/([A-Z0-9-]{4,16})\/certificates\/reconcile$/.exec(
        req.path,
      );
    const telemetry = req.path.startsWith("/api/v1/admin/telemetry/");
    const publicVerify =
      /^\/api\/v1\/public\/certificates\/([^/]+)\/verification$/.exec(req.path);
    const writeRoute = domainWriteRoute(req.method, req.path);
    const methods = management
      ? tokenId
        ? ["DELETE"]
        : ["GET", "POST"]
      : writeRoute || repair || (telemetry && req.method === "POST")
        ? [req.method]
        : ["GET"];
    if (!methods.includes(req.method))
      return res
        .status(405)
        .set("Allow", methods.join(", "))
        .json({ error: { code: "method-not-allowed" } });
    if (req.path === "/api/openapi.json") return res.json(spec);
    if (req.path === "/api/docs/swagger-init.js")
      return res
        .type("application/javascript")
        .send(
          'SwaggerUIBundle({url:"/api/openapi.json",dom_id:"#swagger-ui",persistAuthorization:false,validatorUrl:null});',
        );
    if (req.path === "/api/docs" || req.path === "/api/docs/")
      return res
        .type("html")
        .send(
          '<!doctype html><html><head><title>InspiredLearning API</title><link rel="stylesheet" href="/api/docs/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/api/docs/swagger-ui-bundle.js"></script><script src="/api/docs/swagger-init.js"></script></body></html>',
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
      await rate("api-ip:" + req.ip, publicVerify ? 60 : 120);
      if (publicVerify) {
        if (Object.keys(req.query).length)
          throw Object.assign(new Error("No query filters allowed."), {
            code: "invalid-argument",
          });
        return res.json(
          await measured(
            "certificate.verify",
            null,
            () => verification(db, publicVerify[1]),
            undefined,
            requestId,
            { kind: 0 },
          ),
        );
      }
      const header = req.get("Authorization") || "";
      if (!/^Bearer \S+$/.test(header))
        return rejectAuth(req, res, requestId, "missing-bearer");
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
          return rejectAuth(req, res, requestId, "invalid-id-token");
        }
        actor = googleActor(t.uid, t);
        authTime = t.auth_time;
      }
      await rate("api:" + actor.uid, 120);
      if (actor.apiTokenId) await rate("api-token:" + actor.apiTokenId, 60);
      if (
        ((management && req.method === "POST") ||
          writeRoute ||
          repair ||
          (telemetry && req.method === "POST")) &&
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
          : writeRoute || repair
            ? "api.write"
            : "api.read",
        actor,
        async (c) => {
          if (req.path === "/api/v1/admin/access")
            return adminAccess(db, actor, req.query, (op, fields) =>
              audit(actor, c, op, fields),
            );
          if (
            req.method !== "GET" &&
            !actor.apiTokenId &&
            (management || repair || telemetry || writeRoute)
          )
            await requireAdminStepUp(db, actor);
          if (telemetry)
            return telemetryAdmin(
              db,
              actor,
              req.method,
              req.path,
              req.body,
              req.query,
              c,
              req.get("Idempotency-Key"),
              audit,
            );
          if (repair) {
            if (Object.keys(req.query).length)
              throw Object.assign(new Error("No query parameters allowed."), {
                code: "invalid-argument",
              });
            return reconcileCertificates(db, actor, repair[1], req.body, c);
          }
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
        undefined,
        requestId,
        {
          kind: 0,
          attributes: {
            "http.request.method": req.method,
            "http.route": routeTemplate(req.path),
            "request.id": requestId,
            ...(actor.apiTokenId ? { "api.token.id": actor.apiTokenId } : {}),
          },
        },
      );
      return res.json(result);
    } catch (e) {
      if (e.code === "resource-exhausted" && e.details?.reason === "rate-limit")
        res.set("Retry-After", String(e.details.retryAfterSeconds));
      if (e.code === "unauthenticated")
        log("WARN", "API authentication rejected", {
          "http.request.method": req.method,
          "http.route": routeTemplate(req.path),
          "request.id": requestId,
          reason: "api-token",
        });
      return res.status(status[e.code] || 500).json({
        error: {
          code: status[e.code] ? e.code : "internal",
          message: status[e.code] ? e.message : "Request failed.",
        },
      });
    }
  };
  return (req, res) =>
    httpRequest(req, res, () => handle(req, res), {
      "http.route": routeTemplate(req.path),
    });
}
