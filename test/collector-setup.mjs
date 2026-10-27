import http from "node:http";
// Playwright global setup owns this local synthetic receiver for the entire run.
// Per-file teardown must not create an outage for asynchronously delivered outbox events.
export default async function setup() {
  const events = [];
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/test/events") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(events));
      return;
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    if (req.url.includes("bizevents")) {
      try {
        if (events.length >= 20000) throw Error("Fixture event limit");
        events.push(JSON.parse(Buffer.concat(chunks).toString()));
        res.writeHead(202);
      } catch {
        res.writeHead(400);
      }
    } else res.writeHead(200, { "Content-Type": "application/x-protobuf" });
    res.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(8799, "127.0.0.1", resolve);
  });
  return async () => {
    await new Promise((resolve) => server.close(resolve));
  };
}
