const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
for (const name of ["dailymath-contract", "dailymath-ranking-model"]) {
  const output = path.resolve(`.next/dailymath-ranking-tests/${name}.js`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  );
}
const {
  schoolTime,
  problemDateFromTitle,
  parseRankingPosts,
  parseRankingReplies,
  calculateRanking,
  studentAccount,
} = require("../.next/dailymath-ranking-tests/dailymath-ranking-model.js");
const login = '<a href="/student/logout.do">logout</a>';
const t = schoolTime;
const post = (id, day, date) => ({
  id,
  key: `day:2026:${day}`,
  publishedAt: t(date),
  publishedOn: date.slice(0, 10).replaceAll(".", "-"),
});
const reply = (postId, studentId, date) => ({
  postId,
  studentId,
  name: `Student ${studentId}`,
  submittedAt: t(date),
});

test("Korean school timestamps include dotted dates and reject invalid values", () => {
  assert.equal(t("2026.04.07. 10:52"), Date.parse("2026-04-07T10:52:00+09:00"));
  assert.equal(
    t("2026.04.07. 23:59:59"),
    Date.parse("2026-04-07T23:59:59+09:00"),
  );
  assert.equal(t("2026.04.07."), Date.parse("2026-04-07T00:00:00+09:00"));
  for (const stamp of ["2026.02.30. 12:00", "2026.04.07. 25:52", "yesterday"])
    assert.equal(t(stamp), null);
});

test("board parsing skips answers and notices and deduplicates pinned rows", () => {
  const row = (id, title, stamp) =>
    `<tr><td><a href="/student/notice/info.do?noticeNo=${id}">${id}</a></td><td>Teacher</td><td>2026</td><td><span class="label">NEW</span>${title}</td><td><span class="gsDateFormat" title="${stamp}">date</span></td></tr>`;
  const problem = row(
    1,
    "2026_Daily Math_017일차_문제(26.04.08.)",
    "2026.04.06. 08:00",
  );
  const posts = parseRankingPosts(
    login +
      `<table>${problem}${problem}${row(2, "17일차 해설", "2026.04.07. 08:00")}${row(3, "문제 제출 안내", "2026.04.07. 08:00")}</table>`,
  );
  assert.equal(posts.length, 1);
  assert.equal(posts[0].key, "day:2026:17");
  assert.equal(posts[0].publishedOn, "2026-04-08");
  assert.throws(() => parseRankingPosts('<form id="loginForm"></form>'), {
    status: 401,
  });
  assert.throws(() => parseRankingPosts(login + "<table></table>"), {
    status: 503,
  });
});

test("private reply metadata includes non-app students without reading their private contents", () => {
  const row = (name, stamp, text = "private contents") =>
    `<div class="direct-chat-msg"><span class="direct-chat-name">${name}</span><span class="gsDateFormat" title="${stamp}">1 day ago</span><div class="direct-chat-text">${text}</div></div>`;
  const html =
    login +
    '<form id="formReply"></form>' +
    row("[ST] Alice (26101)", "2026.04.06. 10:52") +
    row("[ST] Alice (26101)", "2026.04.07. 10:52") +
    row("[ST] Bob (26102)", "2026.04.06. 11:52") +
    row("Teacher", "2026.04.06. 08:30");
  const replies = parseRankingReplies(html, 1);
  assert.equal(replies.length, 2);
  assert.equal(replies[0].name, "Alice");
  assert.equal(replies[0].submittedAt, t("2026.04.06. 10:52"));
  assert.equal(replies[0].lastSubmittedAt, t("2026.04.07. 10:52"));
  assert.ok(!JSON.stringify(replies).includes("private contents"));
  assert.throws(
    () =>
      parseRankingReplies(
        login +
          '<form id="formReply"></form>' +
          row("Alice (26101)", "yesterday"),
        1,
      ),
    { status: 503 },
  );
});

test("timely cutoff is midnight, ties share rank, and every observed student participates", () => {
  const posts = [
    post(1, 1, "2026.04.06. 08:00"),
    post(2, 2, "2026.04.07. 08:00"),
  ];
  const rows = calculateRanking(
    posts,
    [
      reply(1, "26101", "2026.04.06. 10:52"),
      reply(2, "26101", "2026.04.07. 23:59:59"),
      reply(1, "26102", "2026.04.06. 23:59:59"),
      reply(2, "26102", "2026.04.07. 08:00"),
      reply(2, "26103", "2026.04.08. 00:00"),
      reply(2, "26104", "2026.04.07. 07:59"),
    ],
    t("2026.04.08. 12:00"),
  );
  assert.deepEqual(
    rows.map((r) => [r.rank, r.streak]),
    [
      [1, 2],
      [1, 2],
      [3, 0],
      [3, 0],
    ],
  );
  assert.equal(rows[2].last_submitted_at_ms, t("2026.04.08. 00:00"));
  assert.equal(studentAccount("26101").length, 64);
});

test("weekends and today's grace keep the streak, but midnight without submitting breaks it", () => {
  const posts = [
    post(1, 1, "2026.09.18. 08:00"),
    post(2, 2, "2026.09.21. 08:00"),
  ];
  const submissions = [reply(1, "26101", "2026.09.18. 10:52")];
  for (const now of ["2026.09.19. 12:00", "2026.09.21. 23:59:59"])
    assert.equal(calculateRanking(posts, submissions, t(now))[0].streak, 1);
  assert.equal(
    calculateRanking(posts, submissions, t("2026.09.22. 00:00"))[0].streak,
    0,
  );
});

test("duplicate posts count once; deleted posts and future submissions do not participate", () => {
  const posts = [
    post(1, 1, "2026.04.06. 08:00"),
    post(2, 1, "2026.04.06. 08:30"),
  ];
  const submissions = [
    reply(1, "26101", "2026.04.06. 09:00"),
    reply(2, "26101", "2026.04.06. 10:00"),
    reply(3, "26102", "2026.04.06. 10:00"),
    reply(2, "26103", "2026.04.08. 10:00"),
  ];
  const rows = calculateRanking(posts, submissions, t("2026.04.07. 12:00"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].streak, 1);
  assert.equal(rows[0].total_solved, 1);
});

test("school transport uses fresh IPv4 TLS requests without weakening host validation or following redirects", async () => {
  const Module = require("node:module");
  const { EventEmitter } = require("node:events");
  const original = Module._load;
  let observed;
  const mockedRequest = (url, options, callback) => {
    observed = { url, options };
    const request = new EventEmitter();
    request.end = () => {
      const response = new EventEmitter();
      response.headers = {
        location: "/student/login.do",
        "content-type": "text/html",
      };
      response.statusCode = 302;
      callback(response);
      response.emit("data", Buffer.from("redirect"));
      response.emit("end");
    };
    return request;
  };
  const transportOutput = path.resolve(
    ".next/dailymath-ranking-tests/dailymath-school-http.js",
  );
  fs.writeFileSync(
    transportOutput,
    ts.transpileModule(
      fs.readFileSync("lib/dailymath-school-http.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  );
  try {
    Module._load = function (name, ...args) {
      return name === "node:https"
        ? { request: mockedRequest }
        : original.call(this, name, ...args);
    };
    const { schoolFetch } = require(transportOutput);
    const response = await schoolFetch(
      "https://student.gs.hs.kr/student/mymenu/privateInfo.do",
    );
    assert.equal(observed.options.family, 4);
    assert.equal(observed.options.agent, false);
    assert.equal(observed.options.headers.connection, "close");
    assert.notEqual(observed.options.rejectUnauthorized, false);
    assert.equal(observed.url.hostname, "student.gs.hs.kr");
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/student/login.do");
    const previousAddress = process.env.DAILYMATH_SCHOOL_IPV4;
    try {
      process.env.DAILYMATH_SCHOOL_IPV4 = "192.0.2.1";
      await schoolFetch(
        "https://student.gs.hs.kr/student/mymenu/privateInfo.do",
      );
      assert.equal(observed.url.hostname, "student.gs.hs.kr");
      assert.equal(observed.options.autoSelectFamily, false);
      let resolved;
      observed.options.lookup(
        "student.gs.hs.kr",
        {},
        (error, address, family) => {
          resolved = { error, address, family };
        },
      );
      assert.deepEqual(resolved, {
        error: null,
        address: "192.0.2.1",
        family: 4,
      });
      assert.notEqual(observed.options.rejectUnauthorized, false);
      process.env.DAILYMATH_SCHOOL_IPV4 = "https://attacker.invalid";
      await assert.rejects(
        schoolFetch("https://student.gs.hs.kr/student/mymenu/privateInfo.do"),
      );
    } finally {
      if (previousAddress === undefined)
        delete process.env.DAILYMATH_SCHOOL_IPV4;
      else process.env.DAILYMATH_SCHOOL_IPV4 = previousAddress;
    }
    await assert.rejects(schoolFetch("https://attacker.invalid/"));
  } finally {
    Module._load = original;
  }
});

test("assigned problem dates override advance creation dates with a Korean midnight cutoff", () => {
  for (const title of [
    "2026_Daily Math_107일차_문제(26.09.18.)",
    "260918 107일차 문제",
    "107일차 문제 2026년9월18일",
  ]) {
    assert.equal(problemDateFromTitle(title), t("2026.09.18. 00:00"));
  }
  assert.equal(problemDateFromTitle("문제 26.02.30."), null);
  assert.equal(problemDateFromTitle("2026 Daily Math 107일차 문제"), null);
  const html =
    login +
    '<table><tr><td><a href="info.do?noticeNo=18038">18038</a></td><td>Teacher</td><td>2026</td><td>2026_Daily Math_107일차_문제(26.09.18.)</td><td><span class="gsDateFormat" title="2026.09.15. 21:08">date</span></td></tr></table>';
  const posts = parseRankingPosts(html);
  assert.equal(posts[0].publishedOn, "2026-09-18");
  const rows = calculateRanking(
    posts,
    [
      reply(18038, "26101", "2026.09.18. 00:00"),
      reply(18038, "26102", "2026.09.18. 23:59:59"),
      reply(18038, "26103", "2026.09.19. 00:00"),
      reply(18038, "26104", "2026.09.15. 22:00"),
    ],
    t("2026.09.19. 12:00"),
  );
  assert.deepEqual(
    rows.map((r) => r.streak),
    [1, 1, 0, 0],
  );
});
