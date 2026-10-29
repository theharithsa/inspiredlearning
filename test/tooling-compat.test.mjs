import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";
import { once } from "node:events";
const require = createRequire(import.meta.url);
const pubsubRequire = createRequire(
  require.resolve("@google-cloud/pubsub/package.json"),
);
const api = pubsubRequire("@opentelemetry/api");
const core = pubsubRequire("@opentelemetry/core");
test("Pub/Sub uses the patched core and preserves real W3C message propagation", () => {
  const tracing = pubsubRequire("./build/src/telemetry-tracing.js");
  const spanContext = {
    traceId: "a".repeat(32),
    spanId: "b".repeat(16),
    traceFlags: 1,
  };
  tracing.setGloballyEnabled(true);
  try {
    const message = { data: Buffer.from("synthetic") };
    tracing.injectSpan(api.trace.wrapSpanContext(spanContext), message);
    assert.match(message.attributes.googclient_traceparent, /^00-aaaa/);
    delete message.parentSpan;
    const extracted = tracing.extractSpan(
      message,
      "projects/demo-chaicart/subscriptions/compat",
    );
    assert.equal(extracted.spanContext().traceId, spanContext.traceId);
  } finally {
    tracing.setGloballyEnabled(false);
  }
  const header = Array.from(
    { length: 1000 },
    (_, i) => `key${i}=value${i}`,
  ).join(",");
  const context = new core.W3CBaggagePropagator().extract(
    api.ROOT_CONTEXT,
    { baggage: header },
    { keys: Object.keys, get: (c, k) => c[k] },
  );
  assert.ok(
    (api.propagation.getBaggage(context)?.getAllEntries().length || 0) <= 180,
    "inbound baggage must be bounded",
  );
});
test("gaxios multipart upload retains a valid v4 boundary with the patched CommonJS uuid API", async () => {
  const { Gaxios } = require("gaxios");
  const nested = createRequire(require.resolve("gaxios/package.json"));
  const uuid = nested("uuid");
  assert.throws(
    () => uuid.v5("synthetic", uuid.v5.DNS, Buffer.alloc(1)),
    RangeError,
  );
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ type: req.headers["content-type"], body }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await new Gaxios().request({
      url: `http://127.0.0.1:${server.address().port}`,
      method: "POST",
      responseType: "json",
      multipart: [
        {
          headers: { "Content-Type": "text/plain" },
          content: "synthetic-payload",
        },
      ],
    });
    assert.match(
      response.data.type,
      /multipart\/related; boundary=[0-9a-f-]{36}/,
    );
    assert.match(response.data.body, /synthetic-payload/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
