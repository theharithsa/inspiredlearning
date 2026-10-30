import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { gunzipSync } from "node:zlib";
import protobuf from "protobufjs";
import { deliveryPipeline } from "../scripts/observability/pipeline.mjs";
test("delivery pipeline sends actual independent traces, metrics and logs with CI service identity", async () => {
  const received = new Map();
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    received.set(
      req.url,
      req.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw,
    );
    res.writeHead(200, { "Content-Type": "application/x-protobuf" });
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const pipeline = deliveryPipeline(
      `http://127.0.0.1:${server.address().port}`,
      "",
      { local: true },
    );
    const start = "2026-10-28T00:00:00Z",
      end = "2026-10-28T00:00:01Z";
    await pipeline.workflow(
      { run_started_at: start, updated_at: end },
      [
        {
          id: 1,
          conclusion: "success",
          started_at: start,
          completed_at: end,
          steps: [
            {
              number: 1,
              conclusion: "success",
              started_at: start,
              completed_at: end,
            },
          ],
        },
      ],
      {
        repository: "fixture/app",
        runId: 2,
        attempt: 1,
        sha: "a".repeat(40),
        outcome: "success",
      },
    );
    // A cancelled run with absent execution timestamps is a fact, not a duration.
    await pipeline.workflow(
      {},
      [{ id: 3, conclusion: "cancelled", steps: [] }],
      {
        repository: "fixture/app",
        runId: 3,
        attempt: 1,
        sha: "a".repeat(40),
        outcome: "cancelled",
      },
    );
    const result = await pipeline.close();
    for (const signal of ["traces", "metrics", "logs"]) {
      assert.ok(result.signals[signal].sdkSuccess > 0);
      assert.equal(result.signals[signal].sdkFailure, 0);
    }
    for (const signal of ["traces", "metrics", "logs"])
      assert.ok(received.get("/api/v2/otlp/v1/" + signal)?.length, signal);
    const wire = protobuf
      .parse(
        'syntax="proto3";message Request {repeated Scope resources=1;} message Scope {Resource resource=1;} message Resource {repeated Attr attrs=1;} message Attr {string key=1;Value value=2;} message Value {string text=1;}',
      )
      .root.lookupType("Request");
    for (const raw of received.values()) {
      const result = wire.decode(raw),
        attrs = result.resources.flatMap((r) => r.resource.attrs);
      assert.ok(
        attrs.some(
          (a) =>
            a.key === "service.name" &&
            a.value.text === "inspiredlearning-delivery",
        ),
      );
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
});
