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
  assert.equal(posts[0].publishedOn, "2026-04-06");
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
