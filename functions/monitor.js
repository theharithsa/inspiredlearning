import {
  context,
  trace,
  ROOT_CONTEXT,
  SpanStatusCode,
  metrics,
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
export const token = defineSecret("DYNATRACE_PLATFORM_TOKEN");
let sdk, processor, logProcessor, reader, count, duration;
function initialize() {
  if (sdk) return;
  const local = process.env.FUNCTIONS_EMULATOR === "true";
  const base = local
    ? "http://127.0.0.1:8799/api/v2/otlp"
    : "https://indiacs.live.dynatrace.com/api/v2/otlp";
  const credential = local ? "" : token.value();
  const config = (signal) => ({
    url: base + "/v1/" + signal,
    headers: credential
      ? {
          Authorization:
            (credential.startsWith("dt0c01.") ? "Api-Token " : "Bearer ") +
            credential,
        }
      : {},
    timeoutMillis: 5000,
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
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": "inspiredlearning-api",
      "service.namespace": "inspiredlearning",
      "service.version": "1.0.0",
      "deployment.environment.name": local ? "rehearsal" : "production",
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
export async function measured(
  name,
  actor,
  work,
  parent,
  requestedTransaction,
) {
  initialize();
  const start = performance.now();
  let parentContext = ROOT_CONTEXT;
  if (/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(parent || "")) {
    const [, traceId, spanId] = parent.split("-");
    if (!/^0+$/.test(traceId) && !/^0+$/.test(spanId))
      parentContext = trace.setSpanContext(ROOT_CONTEXT, {
        traceId,
        spanId,
        traceFlags: 1,
        isRemote: true,
      });
  }
  return context.with(parentContext, () =>
    trace.getTracer("inspiredlearning").startActiveSpan(name, async (span) => {
      const sc = span.spanContext();
      const transactionId =
        typeof requestedTransaction === "string" &&
        /^[0-9a-f-]{36}$/.test(requestedTransaction)
          ? requestedTransaction
          : randomUUID();
      const attrs = {
        "transaction.id": transactionId,
        "user.id": actor?.uid || "anonymous",
        ...(actor?.email ? { "user.email": actor.email } : {}),
        operation: name,
      };
      span.setAttributes(attrs);
      const correlation = {
        transactionId,
        traceId: sc.traceId,
        spanId: sc.spanId,
      };
      let outcome = "success";
      try {
        const result = await work(correlation);
        log("INFO", name + " completed", attrs);
        return result;
      } catch (error) {
        outcome = "failure";
        span.setStatus({ code: SpanStatusCode.ERROR });
        log("ERROR", name + " failed", {
          ...attrs,
          "error.type": error.code || "internal",
        });
        throw error;
      } finally {
        count.add(1, { operation: name, outcome });
        duration.record((performance.now() - start) / 1000, {
          operation: name,
          outcome,
        });
        span.end();
        await Promise.allSettled([
          processor.forceFlush(),
          logProcessor.forceFlush(),
          reader.forceFlush(),
        ]);
      }
    }),
  );
}
export function log(level, message, attributes = {}) {
  const sc = trace.getSpan(context.active())?.spanContext();
  const record = {
    ...attributes,
    ...(sc ? { trace_id: sc.traceId, span_id: sc.spanId } : {}),
  };
  console.log(
    JSON.stringify({
      level,
      message,
      "service.name": "inspiredlearning-api",
      ...record,
    }),
  );
  logs.getLogger("inspiredlearning").emit({
    body: message,
    severityNumber:
      level === "ERROR" ? SeverityNumber.ERROR : SeverityNumber.INFO,
    attributes: record,
    context: context.active(),
  });
}
