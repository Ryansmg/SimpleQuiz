const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Compile only the pure request contract; no MySQL connection or .env is loaded.
const output = path.resolve(".next/dailymath-tests/dailymath-contract.js");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  ts.transpileModule(fs.readFileSync("lib/dailymath-contract.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
);
const { bearerToken, parseProgress, readProgressBody } = require(output);
const account = "b".repeat(64);
const headers = { "x-dailymath-account": account };
const record = {
  post_id: 17505,
  state: "submitted",
  reply_id: 123,
  solved_on: "2026-09-18",
  updated_at_ms: 1000,
  first_submitted_at_ms: null,
};

test("student ID alone and malformed bearer tokens are rejected", () => {
  for (const authorization of [undefined, "Bearer invalid"]) {
    assert.throws(
      () =>
        bearerToken(
          new Request("https://example.test", {
            headers: {
              ...headers,
              ...(authorization ? { authorization } : {}),
            },
          }),
        ),
      { status: 401 },
    );
  }
});

test("well-formed bearer token is extracted for server-side database verification", () => {
  const token = "c".repeat(64);
  assert.equal(
    bearerToken(
      new Request("https://example.test", {
        headers: { authorization: `Bearer ${token}` },
      }),
    ),
    token,
  );
});

test("valid progress round trips without accepting extra owner fields", () => {
  assert.deepEqual(parseProgress([{ ...record, owner_key: "someone else" }]), [
    record,
  ]);
});

test("pending state, invalid dates, missing submission metadata and future timestamps are rejected", () => {
  for (const patch of [
    { state: "pending" },
    { solved_on: "2026-02-30" },
    { reply_id: null },
    { solved_on: null, first_submitted_at_ms: 900 },
    { updated_at_ms: Date.now() + 700000 },
    { post_id: "1 OR 1=1" },
  ]) {
    assert.throws(() => parseProgress([{ ...record, ...patch }]));
  }
});

test("confirmed submissions with unknown timing stay submitted without inventing a date", () => {
  const unknown = { ...record, solved_on: null, first_submitted_at_ms: null };
  assert.deepEqual(parseProgress([unknown]), [unknown]);
  assert.deepEqual(parseProgress([{ ...unknown, state: "draft" }]), [
    { ...unknown, state: "draft" },
  ]);
  assert.throws(() => parseProgress([{ ...unknown, reply_id: null }]));
});

test("duplicate records and oversized batches are rejected", () => {
  assert.throws(() => parseProgress([record, record]));
  assert.throws(() => parseProgress(Array(201).fill(record)));
});

test("draft after submission preserves its historical solved date", () => {
  const draft = { ...record, state: "draft" };
  assert.deepEqual(parseProgress([draft]), [draft]);
});

test("invalid JSON and oversized streaming bodies are rejected", async () => {
  const request = (body) =>
    new Request("https://example.test", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    });
  await assert.rejects(readProgressBody(request("{")), { status: 400 });
  await assert.rejects(readProgressBody(request("x".repeat(128 * 1024 + 1))), {
    status: 413,
  });
  assert.deepEqual(await readProgressBody(request(JSON.stringify([record]))), [
    record,
  ]);
});

const schoolOutput = path.resolve(".next/dailymath-tests/dailymath-school.js");
fs.writeFileSync(
  schoolOutput,
  ts.transpileModule(fs.readFileSync("lib/dailymath-school.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
);
const {
  verifiedAccountFromProfile,
  schoolSessionId,
  verifySchoolSession,
} = require(schoolOutput);
const profile =
  '<a href="/student/logout.do">로그아웃</a><table><tr><td class="bg-warning strong">학번</td><td>25001</td></tr></table>';

test("school profile determines account independently of client claims", () => {
  const expected = require("node:crypto")
    .createHash("sha256")
    .update("25001")
    .digest("hex");
  assert.equal(verifiedAccountFromProfile(profile), expected);
  assert.equal(
    verifiedAccountFromProfile(profile),
    verifiedAccountFromProfile(profile),
  );
});

test("login, ambiguous identities and user-authored text cannot identify a student", () => {
  for (const html of [
    '<form action="loginCommit.do"></form>',
    profile.replace("학번", "닉네임"),
    profile + profile,
    profile.replace('href="/student/logout.do"', 'href="/login.do"'),
    "<p>학번 25001</p>",
  ]) {
    assert.throws(() => verifiedAccountFromProfile(html), { status: 401 });
  }
});

test("session input cannot inject another cookie, header or URL", () => {
  for (const session_id of [
    "abc; other=value",
    "x\r\nCookie: bad",
    "https://evil.test/path",
    "x",
  ]) {
    assert.throws(() => schoolSessionId({ session_id }));
  }
});

test("verification uses only the fixed school URL and does not follow redirects", async () => {
  const session = "S".repeat(32);
  const result = await verifySchoolSession(session, async (url, options) => {
    assert.equal(url, "https://student.gs.hs.kr/student/mymenu/privateInfo.do");
    assert.equal(options.headers.Cookie, `JSESSIONID=${session}`);
    assert.equal(options.redirect, "manual");
    return new Response(profile);
  });
  assert.equal(result, verifiedAccountFromProfile(profile));
  await assert.rejects(
    verifySchoolSession(
      session,
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://evil.test" },
        }),
    ),
    { status: 401 },
  );
});

// Replace only Next's server-only marker in the isolated Node test output.
// The fake DB below never opens a network connection or loads environment files.
for (const name of ["dailymath", "dailymath-auth"]) {
  const compiled = ts
    .transpileModule(fs.readFileSync(`lib/${name}.ts`, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    })
    .outputText.replace('require("server-only");', "");
  fs.writeFileSync(path.resolve(`.next/dailymath-tests/${name}.js`), compiled);
}
const savedTokens = new Map();
process.env.MYSQL_URL = "mysql://unused-test-only";
globalThis.dailyMathAccountSchema = Promise.resolve();
globalThis.dailyMathPool = {
  execute: async (sql, values) => {
    if (sql.startsWith("INSERT INTO dailymath_sessions")) {
      savedTokens.set(values[0], {
        school_account: values[1],
        expires: values[2],
      });
    } else if (sql.startsWith("SELECT school_account")) {
      const row = savedTokens.get(values[0]);
      return [row && row.expires > values[1] ? [row] : []];
    } else if (sql.includes("WHERE token_hash = ?")) {
      savedTokens.delete(values[0]);
    } else if (sql.includes("WHERE expires_at_ms <= ?")) {
      for (const [key, row] of savedTokens)
        if (row.expires <= values[0]) savedTokens.delete(key);
    } else throw new Error("Unexpected SQL in authentication test");
    return [{ affectedRows: 1 }];
  },
};
const {
  issueDailyMathToken,
  authenticatedAccount,
  revokeDailyMathToken,
} = require(path.resolve(".next/dailymath-tests/dailymath-auth.js"));
const authRequest = (token, claimedAccount) =>
  new Request("https://example.test", {
    headers: {
      authorization: `Bearer ${token}`,
      ...(claimedAccount ? { "x-dailymath-account": claimedAccount } : {}),
    },
  });

test("two devices with verified school identity access the same account; claimed IDs are ignored", async () => {
  const first = await issueDailyMathToken(account);
  const second = await issueDailyMathToken(account);
  assert.notEqual(first.token, second.token);
  assert.equal(
    await authenticatedAccount(authRequest(first.token, "f".repeat(64))),
    account,
  );
  assert.equal(await authenticatedAccount(authRequest(second.token)), account);
  assert.equal(
    savedTokens.has(first.token),
    false,
    "raw bearer tokens must not be stored in the database",
  );
});

test("unissued, expired and revoked bearer tokens cannot access records", async () => {
  await assert.rejects(authenticatedAccount(authRequest("0".repeat(64))), {
    status: 401,
  });
  const auth = await issueDailyMathToken(account);
  await revokeDailyMathToken(authRequest(auth.token));
  await assert.rejects(authenticatedAccount(authRequest(auth.token)), {
    status: 401,
  });
  const expired = await issueDailyMathToken(account);
  const digest = require("node:crypto")
    .createHash("sha256")
    .update(expired.token)
    .digest("hex");
  savedTokens.get(digest).expires = 0;
  await assert.rejects(authenticatedAccount(authRequest(expired.token)), {
    status: 401,
  });
});


test("first submission timestamp is optional for old clients and validated for new clients", () => {
  const { first_submitted_at_ms, ...legacy } = record;
  assert.equal(parseProgress([legacy])[0].first_submitted_at_ms, null);
  assert.equal(parseProgress([{ ...record, first_submitted_at_ms: 900 }])[0].first_submitted_at_ms, 900);
  for (const stamp of [-1, "900", 1.5, Date.now() + 700000]) {
    assert.throws(() => parseProgress([{ ...record, first_submitted_at_ms: stamp }]));
  }
});
