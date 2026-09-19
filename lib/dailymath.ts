import "server-only";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import {
  DailyMathRequestError,
  type ProgressRecord,
} from "./dailymath-contract";
const state = globalThis as typeof globalThis & {
  dailyMathPool?: Pool;
  dailyMathAccountSchema?: Promise<void>;
  dailyMathRate?: Map<
    string,
    {
      start: number;
      count: number;
    }
  >;
};
export function checkDailyMathRate(account: string) {
  const limits = (state.dailyMathRate ??= new Map());
  const now = Date.now();
  for (const [key, value] of limits)
    if (now - value.start >= 60000) limits.delete(key);
  const current = limits.get(account);
  if ((current?.count ?? 0) >= 30 || (!current && limits.size >= 10000))
    throw new DailyMathRequestError("잠시 후 다시 동기화해 주세요.", 429);
  limits.set(account, {
    start: current?.start ?? now,
    count: (current?.count ?? 0) + 1,
  });
}
export function dailyMathPool() {
  if (!process.env.MYSQL_URL) throw new Error("MYSQL_URL is required");
  return (state.dailyMathPool ??= mysql.createPool({
    uri: process.env.MYSQL_URL,
    connectionLimit: 2,
    maxIdle: 2,
    waitForConnections: true,
    queueLimit: 20,
    connectTimeout: 5000,
    idleTimeout: 60000,
    enableKeepAlive: true,
    charset: "utf8mb4",
  }));
}
export async function ensureDailyMathSchema() {
  state.dailyMathAccountSchema ??= dailyMathPool()
    .query(
      `
    CREATE TABLE IF NOT EXISTS dailymath_account_progress (
      school_account CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      post_id BIGINT UNSIGNED NOT NULL,
      state VARCHAR(16) NOT NULL,
      reply_id BIGINT UNSIGNED NULL,
      solved_on DATE NULL,
      updated_at_ms BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (school_account, post_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
    )
    .then(async () => {
      await dailyMathPool().query(`
        CREATE TABLE IF NOT EXISTS dailymath_sessions (
          token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          school_account CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          expires_at_ms BIGINT UNSIGNED NOT NULL,
          PRIMARY KEY (token_hash),
          INDEX dailymath_session_expiry (expires_at_ms)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })
    .catch((error: unknown) => {
      state.dailyMathAccountSchema = undefined;
      throw error;
    });
  await state.dailyMathAccountSchema;
}
export async function getDailyMathProgress(
  account: string,
): Promise<ProgressRecord[]> {
  await ensureDailyMathSchema();
  const [rows] = await dailyMathPool().execute<RowDataPacket[]>(
    `
    SELECT post_id, state, reply_id, DATE_FORMAT(solved_on, '%Y-%m-%d') AS solved_on, updated_at_ms
    FROM dailymath_account_progress WHERE school_account = ? ORDER BY post_id
  `,
    [account],
  );
  return rows.map((row) => ({
    post_id: Number(row.post_id),
    state: row.state,
    reply_id: row.reply_id === null ? null : Number(row.reply_id),
    solved_on: row.solved_on,
    updated_at_ms: Number(row.updated_at_ms),
  }));
}
export async function putDailyMathProgress(
  account: string,
  records: ProgressRecord[],
) {
  await ensureDailyMathSchema();
  const connection = await dailyMathPool().getConnection();
  try {
    await connection.beginTransaction();
    // All devices using the same student-ID hash share the same progress rows.
    // updated_at_ms is assigned last so all comparisons see the previous timestamp.
    for (const record of [...records].sort((a, b) => a.post_id - b.post_id)) {
      await connection.execute(
        `
        INSERT INTO dailymath_account_progress
          (school_account, post_id, state, reply_id, solved_on, updated_at_ms)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          state = IF(updated_at_ms < ?, ?, state),
          reply_id = IF(updated_at_ms < ?, COALESCE(?, reply_id), reply_id),
          solved_on = COALESCE(LEAST(solved_on, ?), solved_on, ?),
          updated_at_ms = GREATEST(updated_at_ms, ?)
      `,
        [
          account,
          record.post_id,
          record.state,
          record.reply_id,
          record.solved_on,
          record.updated_at_ms,
          record.updated_at_ms,
          record.state,
          record.updated_at_ms,
          record.reply_id,
          record.solved_on,
          record.solved_on,
          record.updated_at_ms,
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
