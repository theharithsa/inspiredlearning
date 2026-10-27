import { defaults } from "./config.js";
import { errorOutcome, boundedFlush } from "./telemetry-policy.js";
import {
  context,
  trace,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  metrics,
  createContextKey,
} from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import {
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from "@opentelemetry/sdk-metrics";
import { defineSecret } from "firebase-functions/params";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
export const token = defineSecret("DYNATRACE_PLATFORM_TOKEN");
const local = () => process.env.FUNCTIONS_EMULATOR === "true";
// Override per environment in functions/.env (e.g. DYNATRACE_ENDPOINT=https://abc123.live.dynatrace.com).
export function dynatraceUrl(path) {
  const base = local()
    ? "http://127.0.0.1:8799"
    : (
        process.env.DYNATRACE_ENDPOINT || "https://indiacs.live.dynatrace.com"
      ).replace(/\/+$/, "");
  return base + path;
}
export function dynatraceHeaders() {
  const credential = local() ? "" : token.value();
  return credential
    ? {
        Authorization:
          (credential.startsWith("dt0c01.") ? "Api-Token " : "Bearer ") +
          credential,
      }
    : {};
}
const packageVersion = () => {
  try {
    return JSON.parse(readFileSync(new URL("./package.json", import.meta.url)))
      .version;
  } catch {
    return "unknown";
  }
};
let sdk, processor, logProcessor, reader, count, duration;
let flushInFlight = null,
  lastMetricFlush = 0;
export function initialize() {
  if (sdk) return;
  const config = (signal) => ({
    url: dynatraceUrl("/api/v2/otlp/v1/" + signal),
    headers: dynatraceHeaders(),
    timeoutMillis: 1000,
    compression: "gzip",
  });
  processor = new BatchSpanProcessor({
    exporter: new OTLPTraceExporter(config("traces")),
  });
  logProcessor = new BatchLogRecordProcessor({
    exporter: new OTLPLogExporter(config("logs")),
  });
  reader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      ...config("metrics"),
      temporalityPreference: AggregationTemporality.DELTA,
    }),
    exportIntervalMillis: 15000,
  });
  const revision = process.env.K_REVISION;
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": "inspiredlearning-api",
      "service.namespace": "inspiredlearning",
      "service.version": packageVersion(),
      "deployment.environment.name": local() ? "rehearsal" : "production",
      "cloud.provider": "gcp",
      "cloud.platform": "gcp_cloud_functions",
      "cloud.region": defaults.region,
      ...(process.env.K_SERVICE ? { "faas.name": process.env.K_SERVICE } : {}),
      ...(revision ? { "faas.version": revision } : {}),
      ...(process.env.GCLOUD_PROJECT
        ? { "cloud.account.id": process.env.GCLOUD_PROJECT }
        : {}),
    }),
    spanProcessors: [processor],
    logRecordProcessors: [logProcessor],
    metricReaders: [reader],
  });
  sdk.start();
  const meter = metrics.getMeter("inspiredlearning");
  count = meter.createCounter("inspiredlearning.operation.outcomes");
  duration = meter.createHistogram("inspiredlearning.operation.duration", {
    unit: "s",
  });
  meter
    .createObservableGauge("process.memory.usage", { unit: "By" })
    .addCallback((result) => result.observe(process.memoryUsage().rss));
  meter
    .createObservableGauge("nodejs.memory.heap.used", { unit: "By" })
    .addCallback((result) => result.observe(process.memoryUsage().heapUsed));
  meter
    .createObservableGauge("process.uptime", { unit: "s" })
    .addCallback((result) => result.observe(process.uptime()));
}
// W3C trace context: keep the caller's sampling decision instead of dropping unsampled parents.
function parentFrom(traceparent) {
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(
    typeof traceparent === "string" ? traceparent.trim().toLowerCase() : "",
  );
  if (!traceparent) return context.active();
  if (!m || /^0+$/.test(m[1]) || /^0+$/.test(m[2])) return ROOT_CONTEXT;
  return trace.setSpanContext(ROOT_CONTEXT, {
    traceId: m[1],
    spanId: m[2],
    traceFlags: parseInt(m[3], 16) & 1,
    isRemote: true,
  });
}
export async function measured(
  name,
  actor,
  work,
  parent,
  requestedTransaction,
  { kind = SpanKind.SERVER, attributes = {} } = {},
) {
  initialize();
  const start = performance.now();
  return context.with(parentFrom(parent), () =>
    trace
      .getTracer("inspiredlearning")
      .startActiveSpan(name, { kind }, async (span) => {
        const sc = span.spanContext();
        const transactionId =
          typeof requestedTransaction === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
            requestedTransaction,
          )
            ? requestedTransaction
            : randomUUID();
        const attrs = {
          "transaction.id": transactionId,
          "user.id": actor?.uid || "anonymous",
          ...(actor?.email ? { "user.email": actor.email } : {}),
          operation: name,
        };
        span.setAttributes({ ...attrs, ...attributes });
        const correlation = {
          transactionId,
          traceId: sc.traceId,
          spanId: sc.spanId,
        };
        let outcome = "success";
        try {
          const result = await work(correlation);
          return result;
        } catch (error) {
          const type = error?.code || "internal";
          outcome = errorOutcome(error);
          span.setAttribute("error.type", type);
          if (outcome === "failure") {
            span.recordException({ name: type, message: "Operation failed" });
            span.setStatus({ code: SpanStatusCode.ERROR, message: type });
          }
          log(
            outcome === "failure" ? "ERROR" : "WARN",
            name + (outcome === "failure" ? " failed" : " rejected"),
            { ...attrs, "error.type": type },
          );
          throw error;
        } finally {
          count.add(1, { operation: name, outcome });
          duration.record((performance.now() - start) / 1000, {
            operation: name,
            outcome,
          });
          span.end();
          if (!context.active().getValue(requestKey)) await flushTelemetry();
        }
      }),
  );
}
let warnedLogSink = false;
const severity = {
  ERROR: SeverityNumber.ERROR,
  WARN: SeverityNumber.WARN,
  INFO: SeverityNumber.INFO,
};
export function log(level, message, attributes = {}) {
  const sc = trace.getSpan(context.active())?.spanContext();
  const record = {
    ...attributes,
    ...(sc ? { trace_id: sc.traceId, span_id: sc.spanId } : {}),
  };
  const configuredSink = process.env.TELEMETRY_LOG_SINK || "both";
  const sink = ["both", "platform", "otlp"].includes(configuredSink)
    ? configuredSink
    : "both";
  if (sink !== configuredSink && !warnedLogSink) {
    warnedLogSink = true;
    console.warn(
      JSON.stringify({
        message: "Invalid telemetry log sink; using both sinks",
        operation: "telemetry.configuration",
      }),
    );
  }
  if (sink !== "otlp" || !sdk)
    console.log(
      JSON.stringify({
        level,
        message,
        "service.name": "inspiredlearning-api",
        ...record,
      }),
    );
  // log() can run before the first measured() call (e.g. rejected API authentication).
  if (!sdk || sink === "platform") return;
  logs.getLogger("inspiredlearning").emit({
    body: message,
    severityNumber: severity[level] || SeverityNumber.INFO,
    severityText: level,
    attributes: record,
    context: context.active(),
  });
}

const requestKey = createContextKey("inspiredlearning.http-request");
export async function flushTelemetry() {
  if (!sdk) return;
  if (!flushInFlight) {
    const includeMetrics = Date.now() - lastMetricFlush >= 15000;
    if (includeMetrics) lastMetricFlush = Date.now();
    flushInFlight = Promise.allSettled([
      processor.forceFlush(),
      logProcessor.forceFlush(),
      ...(includeMetrics ? [reader.forceFlush()] : []),
    ])
      .then((results) => {
        if (results.some((r) => r.status === "rejected"))
          throw new Error("Telemetry export failed");
      })
      .finally(() => {
        flushInFlight = null;
      });
  }
  const flushOutcome = await boundedFlush(() => flushInFlight);
  if (flushOutcome !== "flushed")
    console.warn(
      JSON.stringify({
        message: "Telemetry flush incomplete",
        outcome: flushOutcome,
        operation: "telemetry.flush",
      }),
    );
}
export async function dependency(
  name,
  attributes,
  work,
  kind = SpanKind.CLIENT,
) {
  return trace
    .getTracer("inspiredlearning.dependencies")
    .startActiveSpan(name, { kind, attributes }, async (span) => {
      try {
        return await work(span);
      } catch (error) {
        const type = String(error?.code || "internal").slice(0, 80);
        span.setAttribute("error.type", type);
        if (
          errorOutcome(error) === "failure" &&
          ![
            "auth/id-token-expired",
            "auth/id-token-revoked",
            "auth/argument-error",
          ].includes(type)
        )
          span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
}
export async function httpRequest(req, res, work, attributes = {}) {
  initialize();
  return context
    .with(parentFrom(req.get("traceparent")).setValue(requestKey, true), () =>
      dependency(
        "api.request",
        { "http.request.method": req.method, ...attributes },
        async (span) => {
          try {
            return await work();
          } finally {
            span.setAttribute(
              "http.response.status_code",
              res.statusCode || 200,
            );
            if (res.statusCode >= 500)
              span.setStatus({ code: SpanStatusCode.ERROR });
          }
        },
        SpanKind.SERVER,
      ),
    )
    .finally(flushTelemetry);
}
export function instrumentAuth(auth) {
  return new Proxy(auth, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      return (...args) =>
        ["verifyIdToken", "getUser"].includes(key)
          ? dependency(
              `firebase.auth.${key}`,
              {},
              () => value.apply(target, args),
              key === "getUser" ? SpanKind.CLIENT : SpanKind.INTERNAL,
            )
          : value.apply(target, args);
    },
  });
}
let outboxSample, outboxInstruments, deliveryLag, outboxObservedAt;
export function recordOutboxHealth(sample) {
  initialize();
  outboxSample = sample;
  outboxObservedAt = Date.now();
  if (outboxInstruments) return;
  outboxInstruments = true;
  const meter = metrics.getMeter("inspiredlearning.outbox");
  for (const [metric, field] of [
    ["pending", "pending"],
    ["failed", "failed"],
    ["pending_growing_15m", "pendingGrowing15Minutes"],
    ["oldest_pending_age", "oldestPendingAgeSeconds"],
  ])
    meter
      .createObservableGauge(`inspiredlearning.outbox.${metric}`, {
        unit:
          metric === "oldest_pending_age"
            ? "s"
            : metric === "pending_growing_15m"
              ? "1"
              : "{event}",
      })
      .addCallback((result) => {
        if (Date.now() - outboxObservedAt > 7 * 60_000) return;
        const value = outboxSample?.[field];
        if (value != null)
          result.observe(
            metric === "oldest_pending_age" && outboxSample.pending > 0
              ? value + (Date.now() - outboxObservedAt) / 1000
              : value,
          );
      });
}
export function recordDeliveryLag(seconds) {
  initialize();
  deliveryLag ||= metrics
    .getMeter("inspiredlearning.outbox")
    .createHistogram("inspiredlearning.outbox.delivery.lag", { unit: "s" });
  deliveryLag.record(seconds);
}
