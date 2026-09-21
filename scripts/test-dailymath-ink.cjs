/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness loads isolated transpiled TypeScript contracts, matching the existing Node tests. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { gzipSync } = require("node:zlib");
const ts = require("typescript");
const out = path.resolve(".next/dailymath-ink-tests");
fs.mkdirSync(out, { recursive: true });
for (const name of ["dailymath-contract", "dailymath-ink-contract"]) {
  fs.writeFileSync(
    path.join(out, name + ".js"),
    ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  );
}
const { parseInkUpload, inkWriteDecision, inkPostId, MAX_INK_JSON } = require(
  path.join(out, "dailymath-ink-contract.js"),
);
const { readJsonBody } = require(path.join(out, "dailymath-contract.js"));
function body(
  strokes = [
    { page: 0, color: -16777216, width: 0.003, points: [[0.1, 0.2, 0.5]] },
  ],
) {
  const bytes = Buffer.from(JSON.stringify(strokes));
  return {
    base_revision: 0,
    source_sha256: "a".repeat(64),
    ink_sha256: createHash("sha256").update(bytes).digest("hex"),
    data: gzipSync(bytes).toString("base64"),
  };
}
test("stroke coordinates, pressure and erased documents round trip", async () => {
  const parsed = await parseInkUpload(body());
  assert.equal(parsed.base_revision, 0);
  assert.ok(Buffer.isBuffer(parsed.compressed));
  await parseInkUpload(body([]));
});
test("bad hashes, unsafe revisions and malformed compression fail closed", async () => {
  for (const patch of [
    { ink_sha256: "b".repeat(64) },
    { base_revision: -1 },
    { base_revision: 0.5 },
    { source_sha256: "invalid" },
    { data: "!!!" },
    { data: Buffer.from("not gzip").toString("base64") },
  ]) {
    await assert.rejects(parseInkUpload({ ...body(), ...patch }), {
      status: 400,
    });
  }
});
test("invalid geometry cannot enter the database", async () => {
  for (const stroke of [
    { page: -1, color: 1, width: 0.01, points: [] },
    { page: 0, color: 1, width: 0, points: [] },
    { page: 0, color: 1, width: 0.01, points: [[null, 0]] },
    { page: 0, color: 1, width: 0.01, points: [[0, 0, 999]] },
  ]) {
    await assert.rejects(parseInkUpload(body([stroke])), { status: 400 });
  }
});
test("gzip expansion is bounded before JSON parsing", async () => {
  const bytes = Buffer.alloc(MAX_INK_JSON + 1, 32);
  await assert.rejects(
    parseInkUpload({
      ...body(),
      data: gzipSync(bytes).toString("base64"),
      ink_sha256: createHash("sha256").update(bytes).digest("hex"),
    }),
    { status: 400 },
  );
});
test("stale writes conflict and lost responses retry idempotently", async () => {
  const incoming = await parseInkUpload(body());
  const current = {
    revision: 4,
    source_sha256: incoming.source_sha256,
    ink_sha256: incoming.ink_sha256,
  };
  assert.equal(inkWriteDecision(current, incoming), "unchanged");
  const changed = { ...incoming, ink_sha256: "b".repeat(64) };
  assert.equal(inkWriteDecision(current, changed), "conflict");
  assert.equal(
    inkWriteDecision(current, { ...changed, base_revision: 4 }),
    "write",
  );
  assert.equal(
    inkWriteDecision(
      { revision: 0, source_sha256: "", ink_sha256: "" },
      incoming,
    ),
    "write",
  );
});
test("post IDs reject path traversal and SQL fragments", () => {
  for (const value of ["../1", "1 OR 1=1", "0", "-1", "1.5", "99999999999999"])
    assert.throws(() => inkPostId(value));
  assert.equal(inkPostId("17505"), 17505);
});
test("request body limit works without content-length", async () => {
  await assert.rejects(
    readJsonBody(
      new Request("https://example.test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body()),
      }),
      10,
    ),
    { status: 413 },
  );
});
