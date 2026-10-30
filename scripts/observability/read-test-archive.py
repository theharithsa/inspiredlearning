"""Read data-only summaries in memory; never extract or execute artifact contents."""
import io, json, stat, sys, zipfile
allowed = set("unit integration auth swagger mcp browser security-browser hosting-cache-learner hosting-cache-admin tooling tooling-pubsub".split())
raw = sys.stdin.buffer.read(1000001)
if len(raw) > 1000000:
    raise ValueError("archive size")
result = {}
with zipfile.ZipFile(io.BytesIO(raw)) as archive:
    entries = archive.infolist()
    if len(entries) > 11 or sum(x.file_size for x in entries) > 1000000:
        raise ValueError("archive bounds")
    for entry in entries:
        name = entry.filename
        suite = name.removesuffix(".json")
        if name != suite + ".json" or suite not in allowed or suite in result or stat.S_ISLNK(entry.external_attr >> 16) or entry.file_size > 100000 or entry.flag_bits & 1:
            raise ValueError("untrusted entry")
        value = json.loads(archive.read(entry))
        # Project the schema, dropping arbitrary runner strings/assertions before JS.
        if not isinstance(value, dict):
            raise ValueError("invalid summary")
        result[suite] = {k: value[k] for k in ("schema", "runner", "complete", "success", "counts", "durationMs") if k in value}
print(json.dumps(result))
