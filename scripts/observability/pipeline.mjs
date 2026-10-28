import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../functions/package.json", import.meta.url),
);
export function deliveryPipeline(origin, credential, { local = false } = {}) {
  const url = new URL(origin);
  if (
    !(
      url.protocol === "https:" && url.hostname.endsWith(".live.dynatrace.com")
    ) &&
    !(local && url.protocol === "http:" && url.hostname === "127.0.0.1")
  )
    throw Error("Invalid delivery telemetry origin");
  const { NodeSDK } = require("@opentelemetry/sdk-node"),
    { resourceFromAttributes } = require("@opentelemetry/resources"),
    { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-proto"),
    { OTLPLogExporter } = require("@opentelemetry/exporter-logs-otlp-proto"),
    {
      OTLPMetricExporter,
    } = require("@opentelemetry/exporter-metrics-otlp-proto"),
    { BatchSpanProcessor } = require("@opentelemetry/sdk-trace"),
    { BatchLogRecordProcessor } = require("@opentelemetry/sdk-logs"),
    {
      PeriodicExportingMetricReader,
      AggregationTemporality,
    } = require("@opentelemetry/sdk-metrics"),
    { trace, context, metrics, SpanStatusCode } = require("@opentelemetry/api"),
    { logs } = require("@opentelemetry/api-logs");
  const headers = credential
    ? {
        Authorization:
          (credential.startsWith("dt0c01.") ? "Api-Token " : "Bearer ") +
          credential,
      }
    : {};
  const config = (signal) => ({
    url: url.origin + "/api/v2/otlp/v1/" + signal,
    headers,
    timeoutMillis: 10000,
    compression: "gzip",
  });
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": "inspiredlearning-delivery",
      "service.namespace": "inspiredlearning",
      "service.version": "2.0.0",
      "deployment.environment.name": "ci",
    }),
    spanProcessors: [
      new BatchSpanProcessor({
        exporter: new OTLPTraceExporter(config("traces")),
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter(config("logs")),
      }),
    ],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          ...config("metrics"),
          temporalityPreference: AggregationTemporality.DELTA,
        }),
        exportIntervalMillis: 60000,
      }),
    ],
  });
  sdk.start();
  const tracer = trace.getTracer("inspiredlearning.delivery"),
    meter = metrics.getMeter("inspiredlearning.delivery"),
    counter = meter.createCounter("inspiredlearning.delivery.executions"),
    duration = meter.createHistogram("inspiredlearning.delivery.duration", {
      unit: "s",
    });
  function span(name, attrs, start, end, parent) {
    const from = Date.parse(start),
      to = Date.parse(end);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from)
      return null;
    const s = tracer.startSpan(
      name,
      { startTime: from, attributes: attrs },
      parent || context.active(),
    );
    if (
      ["failure", "timed_out", "startup_failure"].includes(
        attrs["github.outcome"],
      )
    )
      s.setStatus({ code: SpanStatusCode.ERROR });
    s.end(to);
    counter.add(1, { phase: name, outcome: attrs["github.outcome"] });
    duration.record((to - from) / 1000, {
      phase: name,
      outcome: attrs["github.outcome"],
    });
    return s;
  }
  return {
    async workflow(run, jobs, identity) {
      const attrs = {
        "github.repository": identity.repository,
        "github.run.id": String(identity.runId),
        "github.run.attempt": identity.attempt,
        "vcs.revision": identity.sha,
        "github.outcome": identity.outcome,
      };
      const root = span(
        "ci.workflow",
        attrs,
        run.run_started_at,
        run.updated_at,
      );
      const rootContext = root
        ? trace.setSpan(context.active(), root)
        : context.active();
      for (const job of jobs) {
        const child = span(
          "ci.job",
          {
            ...attrs,
            "github.job.id": String(job.id),
            "github.outcome": job.conclusion,
          },
          job.started_at,
          job.completed_at,
          rootContext,
        );
        const parent = child ? trace.setSpan(rootContext, child) : rootContext;
        for (const step of job.steps)
          span(
            "ci.step",
            {
              ...attrs,
              "github.job.id": String(job.id),
              "github.step.number": step.number,
              "github.outcome": step.conclusion,
            },
            step.started_at,
            step.completed_at,
            parent,
          );
      }
      logs.getLogger("inspiredlearning.delivery").emit({
        body: "GitHub workflow completed",
        attributes: attrs,
        context: rootContext,
      });
    },
    async close() {
      await sdk.shutdown();
    },
  };
}
