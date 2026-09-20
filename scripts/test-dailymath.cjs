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

const transportOutput = path.resolve(
  ".next/dailymath-tests/dailymath-school-http.js",
);
fs.writeFileSync(
  transportOutput,
  ts.transpileModule(fs.readFileSync("lib/dailymath-school-http.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
);

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
        version: values[3],
      });
    } else if (sql.startsWith("SELECT school_account")) {
      const row = savedTokens.get(values[0]);
      assert.match(sql, /verification_version = \?/);
      return [
        row && row.expires > values[1] && row.version === values[2]
          ? [row]
          : [],
      ];
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
  assert.equal(
    parseProgress([{ ...record, first_submitted_at_ms: 900 }])[0]
      .first_submitted_at_ms,
    900,
  );
  for (const stamp of [-1, "900", 1.5, Date.now() + 700000]) {
    assert.throws(() =>
      parseProgress([{ ...record, first_submitted_at_ms: stamp }]),
    );
  }
});

test("previous unverified tokens are rejected without removing study records", async () => {
  const auth = await issueDailyMathToken(account);
  const digest = require("node:crypto")
    .createHash("sha256")
    .update(auth.token)
    .digest("hex");
  savedTokens.get(digest).version = 0;
  await assert.rejects(authenticatedAccount(authRequest(auth.token)), {
    status: 401,
  });
});

const autoOutput = path.resolve(
  ".next/dailymath-tests/dailymath-school-auto.js",
);
fs.writeFileSync(
  autoOutput,
  ts.transpileModule(fs.readFileSync("lib/dailymath-school-auto.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
);
const { automaticLoginProof, verifySchoolAutomaticLogin } = require(autoOutput);
const proof = "a".repeat(64);
const schoolSession = "S".repeat(32);
const sha256 = (value) =>
  require("node:crypto").createHash("sha256").update(value).digest("hex");

test("student ID, old school cookie and malformed proofs cannot request a token", () => {
  for (const body of [
    null,
    [],
    {},
    { student_id: "25001" },
    { session_id: schoolSession },
    { auto_login_proof: "secret" },
    { auto_login_proof: "a".repeat(65) },
    { auto_login_proof: 123 },
  ]) {
    assert.throws(() => automaticLoginProof(body), { status: 400 });
  }
  assert.equal(automaticLoginProof({ auto_login_proof: proof }), proof);
});

test("automatic login binds challenge, school session and self-profile before issuing identity", async () => {
  let step = 0;
  const rotated = "R".repeat(32);
  const result = await verifySchoolAutomaticLogin(
    proof,
    async (url, options) => {
      step++;
      assert.equal(options.redirect, "manual");
      assert.equal(options.cache, "no-store");
      if (step === 1) {
        assert.equal(url, "https://student.gs.hs.kr/student/getSessionKey.do");
        assert.equal(options.method, "POST");
        assert.equal(options.headers.Cookie, undefined);
        assert.equal(options.body.toString(), "");
        return new Response("server-challenge", {
          headers: {
            "Set-Cookie": `JSESSIONID=${schoolSession}; Path=/; Secure`,
          },
        });
      }
      if (step === 2) {
        assert.equal(url, "https://student.gs.hs.kr/student/autoLogin.do");
        assert.equal(options.headers.Cookie, `JSESSIONID=${schoolSession}`);
        assert.deepEqual(Object.fromEntries(options.body), {
          sKey: proof,
          cKey: sha256("server-challenge"),
          vKey: sha256(
            options.headers["User-Agent"]
              .replace(/[^a-zA-Z]/g, "")
              .toUpperCase(),
          ),
          device: "Android",
          mode: "AUTO",
          pin: "",
        });
        return new Response("FINE", {
          headers: { "Set-Cookie": `JSESSIONID=${rotated}; Path=/` },
        });
      }
      assert.equal(step, 3);
      assert.equal(
        url,
        "https://student.gs.hs.kr/student/mymenu/privateInfo.do",
      );
      assert.equal(options.headers.Cookie, `JSESSIONID=${rotated}`);
      return new Response(profile);
    },
  );
  assert.equal(result, sha256("25001"));
  assert.equal(step, 3);
});

test("missing session, rejected proof, redirects and anonymous profiles fail closed", async () => {
  for (const scenario of [
    "no-cookie",
    "blank-challenge",
    "html",
    "redirect",
    "denied",
    "anonymous",
    "network",
  ]) {
    let step = 0;
    await assert.rejects(
      verifySchoolAutomaticLogin(proof, async () => {
        step++;
        if (scenario === "network") throw new Error("transport failure");
        if (step === 1) {
          if (scenario === "redirect")
            return new Response(null, {
              status: 302,
              headers: { Location: "https://evil.test" },
            });
          return new Response(
            scenario === "blank-challenge"
              ? ""
              : scenario === "html"
                ? "<html>login</html>"
                : "challenge",
            {
              headers:
                scenario === "no-cookie"
                  ? {}
                  : { "Set-Cookie": `JSESSIONID=${schoolSession}; Path=/` },
            },
          );
        }
        if (step === 2)
          return new Response(scenario === "denied" ? "FAIL" : "FINE");
        return new Response("<html>login</html>");
      }),
    );
    assert.ok(
      step <= (scenario === "anonymous" ? 3 : scenario === "denied" ? 2 : 1),
    );
  }
});

test("auth route never issues tokens for client IDs or failed school verification", async () => {
  const Module = require("node:module");
  const original = Module._load;
  const output = path.resolve(".next/dailymath-tests/auth-route.js");
  fs.writeFileSync(
    output,
    ts.transpileModule(
      fs.readFileSync("app/api/dailymath/auth/route.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  );
  const contract = require("../.next/dailymath-tests/dailymath-contract.js");
  let valid = false;
  let issued = 0;
  const modules = {
    "@/lib/dailymath-contract": contract,
    "@/lib/dailymath": { checkDailyMathRate: () => {} },
    "@/lib/dailymath-auth": {
      issueDailyMathToken: async (identity) => {
        issued++;
        assert.equal(identity, sha256("25001"));
        return { token: "test-token" };
      },
    },
    "@/lib/dailymath-school-auto": {
      automaticLoginProof,
      verifySchoolAutomaticLogin: async (value) => {
        assert.equal(value, proof);
        if (!valid) throw new contract.DailyMathRequestError("Rejected", 401);
        return sha256("25001");
      },
    },
  };
  try {
    Module._load = function (name, ...args) {
      return modules[name] ?? original.call(this, name, ...args);
    };
    const route = require(output);
    const request = (body) =>
      new Request("https://example.test/api/dailymath/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await route.POST(request({ student_id: "99999" }))).status,
      400,
    );
    assert.equal(
      (await route.POST(request({ auto_login_proof: proof }))).status,
      401,
    );
    assert.equal(issued, 0);
    valid = true;
    const response = await route.POST(
      request({ auto_login_proof: proof, student_id: "99999" }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(issued, 1);
  } finally {
    Module._load = original;
  }
});

test("school RETRY renews the challenge once and does not expire the app login", async () => {
  let challenges = 0;
  let logins = 0;
  const identity = await verifySchoolAutomaticLogin(
    proof,
    async (url, options) => {
      if (url.endsWith("getSessionKey.do")) {
        challenges++;
        return new Response(`challenge-${challenges}`, {
          headers: { "Set-Cookie": `JSESSIONID=${schoolSession}; Path=/` },
        });
      }
      if (url.endsWith("autoLogin.do")) {
        logins++;
        assert.equal(options.headers["X-Requested-With"], "XMLHttpRequest");
        assert.equal(
          options.body.get("cKey"),
          sha256(`challenge-${challenges}`),
        );
        return new Response(logins === 1 ? "RETRY" : "FINE");
      }
      return new Response(profile);
    },
  );
  assert.equal(identity, sha256("25001"));
  assert.equal(challenges, 2);
  assert.equal(logins, 2);
});

test("transient school responses are 503; only explicit credential expiry is 401", async () => {
  for (const [result, status] of [
    ["RETRY", 503],
    ["UNKNOWN", 503],
    ["NO_SESSION", 401],
    ["FINE", 503],
  ]) {
    let calls = 0;
    await assert.rejects(
      verifySchoolAutomaticLogin(proof, async (url) => {
        calls++;
        if (url.endsWith("getSessionKey.do"))
          return new Response("challenge", {
            headers: { "Set-Cookie": `JSESSIONID=${schoolSession}; Path=/` },
          });
        if (url.endsWith("autoLogin.do")) return new Response(result);
        return new Response("<html>temporarily unavailable</html>");
      }),
      { status },
    );
    assert.ok(calls <= 4);
  }
});


test("late completion syncs without inventing a school reply or submission time", () => {
  const completed = { ...record, state: "late", reply_id: null, first_submitted_at_ms: null };
  assert.deepEqual(parseProgress([completed]), [completed]);
  assert.throws(() => parseProgress([{ ...completed, solved_on: null }]));
});

test("cleared drafts sync as unsubmitted instead of resurrecting the old draft", () => {
  const empty = { ...record, state: "new", reply_id: null, solved_on: null, first_submitted_at_ms: null };
  assert.deepEqual(parseProgress([empty]), [empty]);
});
