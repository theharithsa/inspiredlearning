import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const { PubSub } = require("@google-cloud/pubsub");
test("pinned Firebase CLI Pub/Sub emulator accepts publish, pull and acknowledgement with the scoped override", async () => {
  assert.match(
    process.env.PUBSUB_EMULATOR_HOST || "",
    /^127\.0\.0\.1:\d+$/,
    "Use the isolated loopback emulator only",
  );
  const client = new PubSub({
    projectId: "demo-chaicart",
    enableOpenTelemetryTracing: true,
  });
  const id = "cli-compat-" + randomUUID();
  let topic, subscription;
  try {
    [topic] = await client.createTopic(id);
    [subscription] = await topic.createSubscription(id);
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Synthetic delivery timed out")),
        15000,
      );
      subscription.once("error", reject);
      subscription.once("message", (m) => {
        clearTimeout(timer);
        m.ack();
        resolve(m.data.toString());
      });
    });
    await topic.publishMessage({ data: Buffer.from("synthetic-compat") });
    assert.equal(await received, "synthetic-compat");
  } finally {
    if (subscription) {
      await subscription.close();
      await subscription.delete();
    }
    if (topic) await topic.delete();
    await client.close();
  }
});
