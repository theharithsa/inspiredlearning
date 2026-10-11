import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
test("real stdio SDK client lists read tools and obtains the same authorized HTTP response", async () => {
  const expected = {
    studentId: "one",
    name: "Learner",
    email: "one@example.invalid",
    collegeId: null,
  };
  let calls = 0;
  const http = createServer((req, res) => {
    calls++;
    assert.equal(req.method, "GET");
    assert.equal(req.headers.authorization, "Bearer short-lived-test-token");
    if (req.url !== "/api/v1/me") {
      res.writeHead(403);
      res.end("{}");
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(expected));
  });
  http.listen(0, "127.0.0.1");
  await new Promise((r) => http.once("listening", r));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../index.js", import.meta.url))],
    env: {
      INSPIREDLEARNING_API_URL: `http://127.0.0.1:${http.address().port}/api/v1`,
      INSPIREDLEARNING_ID_TOKEN: "short-lived-test-token",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "read-api-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 11);
    assert.ok(listed.tools.every((t) => t.annotations.readOnlyHint));
    const result = await client.callTool({
      name: "get_student_details",
      arguments: {},
    });
    assert.deepEqual(result.structuredContent, expected);
    const denied = await client.callTool({
      name: "get_student_details",
      arguments: { studentId: "other" },
    });
    assert.equal(denied.isError, true);
    const invalid = await client.callTool({
      name: "get_certificates",
      arguments: { limit: 101 },
    });
    assert.equal(invalid.isError, true);
    assert.equal(calls, 2);
  } finally {
    await client.close();
    await new Promise((r) => http.close(r));
  }
});
