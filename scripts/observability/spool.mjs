import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  lstat,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { sendRecord } from "./transport.mjs";
import { validateEvent, sourceTime } from "./events.mjs";
async function directory(folder) {
  const stat = await lstat(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error("Unsafe spool directory");
}
function canonical(event) {
  const copy = structuredClone(event);
  if (copy.data) {
    delete copy.data["sdlc.observed_at"];
    if (copy.data["sdlc.time.kind"] === "observation") delete copy.time;
  }
  function sort(v) {
    return v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
  }
  return JSON.stringify(sort(copy));
}
async function read(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 100000)
    throw Error("Unsafe spool record");
  const r = JSON.parse(await readFile(file, "utf8"));
  if (
    r.schema !== 1 ||
    typeof r.native !== "boolean" ||
    validateEvent(r.event, r.native) !== r.id ||
    !["pending", "accepted", "failed"].includes(r.status) ||
    !Number.isSafeInteger(r.attempts) ||
    r.attempts < 0 ||
    Object.keys(r).some(
      (k) =>
        ![
          "schema",
          "id",
          "native",
          "event",
          "status",
          "attempts",
          "lastStatus",
          "updatedAt",
          "tenantVisibility",
        ].includes(k),
    )
  )
    throw Error("Invalid spool state");
  if (r.updatedAt) sourceTime(r.updatedAt);
  if (path.basename(file) !== r.id + (r.native ? "-native" : "") + ".json")
    throw Error("Spool filename mismatch");
  return r;
}
export async function enqueue(folder, event, { native = false } = {}) {
  const id = validateEvent(event, native);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await directory(folder);
  const target = path.join(folder, id + (native ? "-native" : "") + ".json");
  try {
    const old = await read(target);
    if (canonical(old.event) !== canonical(event))
      throw Error("Spool identity collision");
    return target;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if ((await readdir(folder)).length >= 2000)
    throw Error("Spool capacity reached");
  const record = JSON.stringify({
    schema: 1,
    id,
    native,
    event,
    status: "pending",
    attempts: 0,
  });
  if (Buffer.byteLength(record) > 100000) throw Error("Spool record too large");
  await writeFile(target, record, { mode: 0o600, flag: "wx" });
  return target;
}
export async function drain(
  folder,
  origin,
  token,
  { retryFailed = false, ...options } = {},
) {
  let files;
  try {
    await directory(folder);
    files = (await readdir(folder))
      .filter((n) => /^[a-f0-9-]+(?:-native)?\.json$/.test(n))
      .sort();
  } catch (e) {
    if (e.code === "ENOENT") return { accepted: 0, pending: 0, failed: 0 };
    throw e;
  }
  if (files.length > 2000) throw Error("Spool capacity exceeded");
  const summary = { accepted: 0, pending: 0, failed: 0 };
  let sent = 0,
    stop = false;
  for (const name of files) {
    const file = path.join(folder, name),
      record = await read(file);
    if (
      record.status === "accepted" ||
      (record.status === "failed" && !retryFailed) ||
      stop ||
      sent >= 100
    ) {
      summary[record.status]++;
      continue;
    }
    sent++;
    const result = await sendRecord(origin, token, record.event, {
      native: record.native,
      ...options,
    });
    record.attempts += result.attempts;
    record.lastStatus = result.status;
    record.status = result.accepted
      ? "accepted"
      : ["permanent", "native-partial-or-invalid"].includes(result.reason)
        ? "failed"
        : "pending";
    record.updatedAt = new Date().toISOString();
    record.tenantVisibility = "not-verified";
    const temporary = file + "." + randomUUID() + ".tmp";
    await writeFile(temporary, JSON.stringify(record), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, file);
    summary[record.status]++;
    if (result.status === 401 || result.status === 403) stop = true;
  }
  return summary;
}
