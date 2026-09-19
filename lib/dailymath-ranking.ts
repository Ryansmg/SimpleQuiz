import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { dailyMathPool } from "./dailymath";
import {
  calculateRanking,
  parseRankingPosts,
  parseRankingReplies,
  studentAccount,
  type RankingEntry,
  type RankingPost,
  type RankingSubmission,
  type RankingUpload,
} from "./dailymath-ranking-model";
import { DailyMathRequestError } from "./dailymath-contract";

const state = globalThis as typeof globalThis & {
  dailyMathRankingSchema?: Promise<void>;
};
const LOCK = "dailymath-ranking-refresh-v1";
const BATCH_SIZE = 8;

export async function ensureRankingSchema() {
  state.dailyMathRankingSchema ??= (async () => {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS dailymath_ranking_posts (
        post_id BIGINT UNSIGNED PRIMARY KEY, exercise_key VARCHAR(64) NOT NULL,
        published_at_ms BIGINT UNSIGNED NOT NULL, published_on DATE NOT NULL,
        scanned_at_ms BIGINT UNSIGNED NULL, active BOOLEAN NOT NULL DEFAULT TRUE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS dailymath_ranking_submissions (
        post_id BIGINT UNSIGNED NOT NULL, student_id CHAR(5) NOT NULL,
        display_name VARCHAR(80) NOT NULL, first_submitted_at_ms BIGINT UNSIGNED NOT NULL,
        last_submitted_at_ms BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY(post_id, student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS dailymath_ranking_students (
        student_id CHAR(5) PRIMARY KEY, display_name VARCHAR(80) NOT NULL,
        current_streak INT UNSIGNED NOT NULL, total_solved INT UNSIGNED NOT NULL,
        last_submitted_at_ms BIGINT UNSIGNED NOT NULL, ranking_position INT UNSIGNED NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS dailymath_ranking_state (
        id TINYINT PRIMARY KEY, ready BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at_ms BIGINT UNSIGNED NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      "INSERT IGNORE INTO dailymath_ranking_state (id) VALUES (1)",
    ])
      await dailyMathPool().query(sql);
  })().catch((error) => {
    state.dailyMathRankingSchema = undefined;
    throw error;
  });
  await state.dailyMathRankingSchema;
}

export async function rankingSnapshot(
  account: string,
  refreshing = false,
  scanPostIds?: number[],
) {
  await ensureRankingSchema();
  const pool = dailyMathPool();
  const [stateRows] = await pool.query<RowDataPacket[]>(
    "SELECT ready, updated_at_ms FROM dailymath_ranking_state WHERE id = 1",
  );
  const [counts] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total, COUNT(scanned_at_ms) AS scanned FROM dailymath_ranking_posts WHERE active = TRUE",
  );
  const [students] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM dailymath_ranking_students ORDER BY current_streak DESC, last_submitted_at_ms DESC, student_id",
  );
  const entries: RankingEntry[] = students.map((row) => ({
    rank: Number(row.ranking_position),
    student_id: String(row.student_id),
    name: String(row.display_name),
    streak: Number(row.current_streak),
    total_solved: Number(row.total_solved),
    last_submitted_at_ms: Number(row.last_submitted_at_ms),
    is_me: studentAccount(String(row.student_id)) === account,
  }));
  const [pending] = await pool.query<RowDataPacket[]>(
    "SELECT post_id FROM dailymath_ranking_posts WHERE active = TRUE AND scanned_at_ms IS NULL ORDER BY published_at_ms DESC, post_id DESC LIMIT 8",
  );
  const total = Number(counts[0].total);
  const scanned = Number(counts[0].scanned);
  return {
    ready: Boolean(stateRows[0].ready),
    updated_at_ms:
      stateRows[0].updated_at_ms == null
        ? null
        : Number(stateRows[0].updated_at_ms),
    scanned_posts: scanned,
    total_posts: total,
    has_more: scanned < total || total === 0,
    refreshing,
    scan_post_ids: scanPostIds ?? pending.map((row) => Number(row.post_id)),
    entries,
  };
}

async function reconcilePosts(
  connection: PoolConnection,
  posts: RankingPost[],
) {
  await connection.beginTransaction();
  try {
    await connection.query(
      "UPDATE dailymath_ranking_posts SET active = FALSE WHERE active = TRUE",
    );
    // Metadata corrections reuse already collected raw comment times. They do not
    // require another full crawl; publishSnapshot recalculates the affected streaks.
    await connection.query(
      `INSERT INTO dailymath_ranking_posts
      (post_id, exercise_key, published_at_ms, published_on, active) VALUES ?
      ON DUPLICATE KEY UPDATE
        exercise_key = VALUES(exercise_key), published_at_ms = VALUES(published_at_ms), published_on = VALUES(published_on), active = TRUE`,
      [
        posts.map((post) => [
          post.id,
          post.key,
          post.publishedAt,
          post.publishedOn,
          true,
        ]),
      ],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function reconcileReplies(
  connection: PoolConnection,
  postId: number,
  replies: RankingSubmission[],
  now: number,
) {
  await connection.beginTransaction();
  try {
    if (replies.length) {
      await connection.query(
        "DELETE FROM dailymath_ranking_submissions WHERE post_id = ? AND student_id NOT IN (?)",
        [postId, replies.map((reply) => reply.studentId)],
      );
      await connection.query(
        `INSERT INTO dailymath_ranking_submissions
        (post_id, student_id, display_name, first_submitted_at_ms, last_submitted_at_ms) VALUES ?
        ON DUPLICATE KEY UPDATE display_name = VALUES(display_name),
          first_submitted_at_ms = LEAST(first_submitted_at_ms, VALUES(first_submitted_at_ms)),
          last_submitted_at_ms = GREATEST(last_submitted_at_ms, VALUES(last_submitted_at_ms))`,
        [
          replies.map((reply) => [
            postId,
            reply.studentId,
            reply.name,
            reply.submittedAt,
            reply.lastSubmittedAt ?? reply.submittedAt,
          ]),
        ],
      );
    } else {
      await connection.execute(
        "DELETE FROM dailymath_ranking_submissions WHERE post_id = ?",
        [postId],
      );
    }
    await connection.execute(
      "UPDATE dailymath_ranking_posts SET scanned_at_ms = ? WHERE post_id = ?",
      [now, postId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function publishSnapshot(
  connection: PoolConnection,
  posts: RankingPost[],
) {
  const [rows] = await connection.query<
    RowDataPacket[]
  >(`SELECT s.* FROM dailymath_ranking_submissions s
    JOIN dailymath_ranking_posts p ON p.post_id = s.post_id WHERE p.active = TRUE`);
  const submissions = rows.map((row) => ({
    postId: Number(row.post_id),
    studentId: String(row.student_id),
    name: String(row.display_name),
    submittedAt: Number(row.first_submitted_at_ms),
    lastSubmittedAt: Number(row.last_submitted_at_ms),
  }));
  const now = Date.now();
  const entries = calculateRanking(posts, submissions, now);
  await connection.beginTransaction();
  try {
    await connection.query("DELETE FROM dailymath_ranking_students");
    if (entries.length)
      await connection.query(
        `INSERT INTO dailymath_ranking_students
      (student_id, display_name, current_streak, total_solved, last_submitted_at_ms, ranking_position) VALUES ?`,
        [
          entries.map((entry) => [
            entry.student_id,
            entry.name,
            entry.streak,
            entry.total_solved,
            entry.last_submitted_at_ms,
            entry.rank,
          ]),
        ],
      );
    await connection.execute(
      "UPDATE dailymath_ranking_state SET ready = TRUE, updated_at_ms = ? WHERE id = 1",
      [now],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

/** School access happens on the device; only bounded metadata batches reach MySQL. */
export async function refreshRanking(account: string, input: RankingUpload) {
  await ensureRankingSchema();
  const connection = await dailyMathPool().getConnection();
  let locked = false;
  let queue: number[] = [];
  try {
    const [lockRows] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK(?, 5) AS acquired",
      [LOCK],
    );
    locked = Number(lockRows[0].acquired) === 1;
    if (!locked)
      throw new DailyMathRequestError(
        "다른 랭킹 갱신이 진행 중입니다. 잠시 후 새로고침해 주세요.",
        503,
      );
    let posts: RankingPost[];
    if (input.boardHtml !== undefined) {
      posts = parseRankingPosts(input.boardHtml);
      await reconcilePosts(connection, posts);
    } else {
      const [savedPosts] = await connection.query<RowDataPacket[]>(
        "SELECT * FROM dailymath_ranking_posts WHERE active = TRUE ORDER BY published_at_ms DESC, post_id DESC",
      );
      posts = savedPosts.map((row) => ({
        id: Number(row.post_id),
        key: String(row.exercise_key),
        publishedAt: Number(row.published_at_ms),
        publishedOn: new Date(Number(row.published_at_ms) + 9 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
      }));
    }
    if (!posts.length)
      throw new DailyMathRequestError("먼저 문제 목록을 갱신해 주세요.", 409);
    const ids = new Set(posts.map((post) => post.id));
    const pages = input.replies.map((page) => {
      if (!ids.has(page.postId))
        throw new DailyMathRequestError("문제 목록에 없는 게시글입니다.");
      return {
        postId: page.postId,
        replies: parseRankingReplies(page.html, page.postId),
      };
    });
    for (const page of pages)
      await reconcileReplies(connection, page.postId, page.replies, Date.now());
    const [saved] = await connection.query<RowDataPacket[]>(
      "SELECT post_id, scanned_at_ms FROM dailymath_ranking_posts WHERE active = TRUE",
    );
    const stamps = new Map(
      saved.map((row) => [
        Number(row.post_id),
        row.scanned_at_ms == null ? null : Number(row.scanned_at_ms),
      ]),
    );
    const unscanned = posts.filter((post) => stamps.get(post.id) == null);
    const recent = input.continuation ? [] : posts.slice(0, 3);
    const historical = input.continuation
      ? []
      : posts
          .filter(
            (post) =>
              (stamps.get(post.id) ?? Infinity) <
              Date.now() - 24 * 60 * 60 * 1000,
          )
          .sort((a, b) => (stamps.get(a.id) ?? 0) - (stamps.get(b.id) ?? 0))
          .slice(0, 1);
    queue = [
      ...new Set(
        [...recent, ...unscanned, ...historical].map((post) => post.id),
      ),
    ].slice(0, BATCH_SIZE);
    if (!unscanned.length) await publishSnapshot(connection, posts);
  } finally {
    if (locked)
      await connection
        .query("SELECT RELEASE_LOCK(?)", [LOCK])
        .catch(() => undefined);
    connection.release();
  }
  return rankingSnapshot(account, false, queue);
}
