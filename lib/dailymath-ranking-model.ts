import { createHash } from "node:crypto";
import { load } from "cheerio";
import { DailyMathRequestError } from "./dailymath-contract";

export type RankingPost = {
  id: number;
  key: string;
  publishedAt: number;
  publishedOn: string;
};
export type RankingSubmission = {
  postId: number;
  studentId: string;
  name: string;
  submittedAt: number;
  lastSubmittedAt?: number;
};
export type RankingEntry = {
  rank: number;
  student_id: string;
  name: string;
  streak: number;
  total_solved: number;
  last_submitted_at_ms: number;
  is_me: boolean;
};
const DAY = 86_400_000;
const KOREA = 9 * 60 * 60 * 1000;
export const koreanDate = (time: number) =>
  new Date(time + KOREA).toISOString().slice(0, 10);

export function schoolTime(text: string): number | null {
  const match =
    /(?<!\d)(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?\s*(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(
      text,
    );
  if (!match) return null;
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const values = [year, month, day, hour, minute, second].map(Number);
  const time =
    Date.UTC(
      values[0],
      values[1] - 1,
      values[2],
      values[3],
      values[4],
      values[5],
    ) - KOREA;
  const local = new Date(time + KOREA);
  if (
    local.getUTCFullYear() !== values[0] ||
    local.getUTCMonth() + 1 !== values[1] ||
    local.getUTCDate() !== values[2] ||
    local.getUTCHours() !== values[3] ||
    local.getUTCMinutes() !== values[4] ||
    local.getUTCSeconds() !== values[5]
  )
    return null;
  return time;
}

export function requireSchoolPage(html: string) {
  if (!/href=["']\/student\/logout\.do["']/i.test(html)) {
    throw new DailyMathRequestError("송죽학사에 다시 로그인해 주세요.", 401);
  }
}

export function parseRankingPosts(html: string): RankingPost[] {
  requireSchoolPage(html);
  const $ = load(html);
  const posts = new Map<number, RankingPost>();
  $("tr").each((_, row) => {
    const cells = $(row).find("td");
    const href = $(row).find("a[href*='noticeNo=']").first().attr("href") ?? "";
    const id = Number(/noticeNo=(\d+)/.exec(href)?.[1]);
    if (!id || cells.length < 4) return;
    const titleCell = cells.eq(3).clone();
    titleCell.find(".label").remove();
    const title = titleCell.text().replace(/\s+/g, " ").trim();
    if (
      /안내|공지|운영|일정|해설|답안|정답|풀이|solution|answer/i.test(title) ||
      !/문제|problem/i.test(title)
    )
      return;
    const publishedAt = schoolTime(
      $(row).find(".gsDateFormat[title]").first().attr("title") ?? "",
    );
    if (publishedAt === null)
      throw new DailyMathRequestError("문제 게시 날짜를 읽지 못했습니다.", 503);
    const year =
      /(?<!\d)20\d{2}(?!\d)/.exec(title)?.[0] ??
      /20\d{2}/.exec(cells.eq(2).text())?.[0] ??
      koreanDate(publishedAt).slice(0, 4);
    const dayMatch =
      /(?:제\s*)?(\d{1,4})\s*일\s*차|day\s*[_ .-]*0*(\d{1,4})/i.exec(title);
    const day = dayMatch ? Number(dayMatch[1] ?? dayMatch[2]) : null;
    posts.set(id, {
      id,
      key: day === null ? `post:${id}` : `day:${year}:${day}`,
      publishedAt,
      publishedOn: koreanDate(publishedAt),
    });
  });
  if (!posts.size)
    throw new DailyMathRequestError("문제 목록을 읽지 못했습니다.", 503);
  return [...posts.values()].sort(
    (a, b) => b.publishedAt - a.publishedAt || b.id - a.id,
  );
}

export function parseRankingReplies(
  html: string,
  postId: number,
): RankingSubmission[] {
  requireSchoolPage(html);
  const $ = load(html);
  if (
    !$("#formReply, .direct-chat, #contentTextArea_ifr, .box-body .preWrap")
      .length
  )
    throw new DailyMathRequestError("댓글 화면 구조가 변경되었습니다.", 503);
  const students = new Map<string, RankingSubmission>();
  $(".direct-chat-msg").each((_, element) => {
    const row = $(element);
    const author = row.find(".direct-chat-name").text().trim();
    const match = /\((\d{5})\)\s*$/.exec(author);
    // Staff comments have no student ID and are not submissions.
    if (!match) return;
    const stamp = row.find(".gsDateFormat[title]").first().attr("title") ?? "";
    const submittedAt = schoolTime(stamp);
    if (submittedAt === null || !/\d{1,2}:\d{2}/.test(stamp))
      throw new DailyMathRequestError("댓글 작성 시각을 읽지 못했습니다.", 503);
    const studentId = match[1];
    const name =
      author
        .slice(0, match.index)
        .replace(/^\[[^\]]*\]\s*/, "")
        .trim()
        .slice(0, 80) || studentId;
    const previous = students.get(studentId);
    students.set(studentId, {
      postId,
      studentId,
      name,
      submittedAt: Math.min(previous?.submittedAt ?? Infinity, submittedAt),
      lastSubmittedAt: Math.max(previous?.lastSubmittedAt ?? 0, submittedAt),
    });
  });
  return [...students.values()];
}

/** The same publication-day rule as Android; missing posting days do not break a streak. */
export function calculateRanking(
  posts: RankingPost[],
  submissions: RankingSubmission[],
  now = Date.now(),
): RankingEntry[] {
  const grouped = new Map<
    string,
    { opened: number; deadline: number; ids: Set<number> }
  >();
  for (const post of posts) {
    if (post.publishedAt > now) continue;
    const group = grouped.get(post.key);
    const opened = Math.min(group?.opened ?? Infinity, post.publishedAt);
    const midnight = Date.parse(`${koreanDate(opened)}T00:00:00+09:00`);
    const ids = group?.ids ?? new Set<number>();
    ids.add(post.id);
    grouped.set(post.key, { opened, deadline: midnight + DAY, ids });
  }
  const exercises = [...grouped.values()].sort((a, b) => b.opened - a.opened);
  const activeIds = new Set(posts.map((post) => post.id));
  const byStudent = new Map<string, RankingSubmission[]>();
  for (const record of submissions) {
    if (!activeIds.has(record.postId) || record.submittedAt > now) continue;
    const records = byStudent.get(record.studentId) ?? [];
    records.push(record);
    byStudent.set(record.studentId, records);
  }
  const entries: RankingEntry[] = [];
  for (const [studentId, records] of byStudent) {
    const latest = records.reduce((a, b) =>
      (a.lastSubmittedAt ?? a.submittedAt) >
      (b.lastSubmittedAt ?? b.submittedAt)
        ? a
        : b,
    );
    let streak = 0;
    let started = false;
    for (const exercise of exercises) {
      const onTime = records.some(
        (record) =>
          exercise.ids.has(record.postId) &&
          record.submittedAt >= exercise.opened &&
          record.submittedAt < exercise.deadline,
      );
      if (onTime) {
        streak++;
        started = true;
      } else if (!started && now < exercise.deadline) continue;
      else break;
    }
    const totalSolved = exercises.filter((exercise) =>
      records.some((record) => exercise.ids.has(record.postId)),
    ).length;
    entries.push({
      rank: 0,
      student_id: studentId,
      name: latest.name,
      streak,
      total_solved: totalSolved,
      last_submitted_at_ms: latest.lastSubmittedAt ?? latest.submittedAt,
      is_me: false,
    });
  }
  entries.sort(
    (a, b) => b.streak - a.streak || a.student_id.localeCompare(b.student_id),
  );
  entries.forEach((entry, index) => {
    entry.rank =
      index && entry.streak === entries[index - 1].streak
        ? entries[index - 1].rank
        : index + 1;
  });
  return entries;
}
export const studentAccount = (studentId: string) =>
  createHash("sha256").update(studentId).digest("hex");
