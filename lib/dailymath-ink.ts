import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { dailyMathPool } from "./dailymath";
import { DailyMathRequestError } from "./dailymath-contract";
import { inkWriteDecision, type InkUpload } from "./dailymath-ink-contract";

const state = globalThis as typeof globalThis & {
  dailyMathInkSchema?: Promise<void>;
};
async function schema() {
  state.dailyMathInkSchema ??= dailyMathPool()
    .query(
      `CREATE TABLE IF NOT EXISTS dailymath_ink (
    school_account CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    post_id BIGINT UNSIGNED NOT NULL,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
    source_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ink_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ink_gzip MEDIUMBLOB NOT NULL,
    compressed_bytes INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at_ms BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (school_account, post_id)
  ) ENGINE=InnoDB`,
    )
    .then(() => {})
    .catch((error: unknown) => {
      state.dailyMathInkSchema = undefined;
      throw error;
    });
  await state.dailyMathInkSchema;
}
function metadata(row: RowDataPacket) {
  return {
    post_id: Number(row.post_id),
    revision: Number(row.revision),
    source_sha256: String(row.source_sha256),
    ink_sha256: String(row.ink_sha256),
    updated_at_ms: Number(row.updated_at_ms),
  };
}
export async function inkManifest(account: string) {
  await schema();
  const [rows] = await dailyMathPool().execute<RowDataPacket[]>(
    "SELECT post_id,revision,source_sha256,ink_sha256,updated_at_ms FROM dailymath_ink WHERE school_account=? AND revision>0 ORDER BY post_id",
    [account],
  );
  return rows.map(metadata);
}
export async function readInk(account: string, post: number) {
  await schema();
  const [rows] = await dailyMathPool().execute<RowDataPacket[]>(
    "SELECT * FROM dailymath_ink WHERE school_account=? AND post_id=? AND revision>0",
    [account, post],
  );
  if (!rows.length)
    throw new DailyMathRequestError("저장된 필기가 없습니다.", 404);
  return {
    ...metadata(rows[0]),
    data: (rows[0].ink_gzip as Buffer).toString("base64"),
  };
}
export async function writeInk(account: string, post: number, ink: InkUpload) {
  await schema();
  const connection = await dailyMathPool().getConnection();
  try {
    await connection.beginTransaction();
    // The primary key serializes first writes as well as updates across server instances.
    await connection.execute(
      `INSERT INTO dailymath_ink
      (school_account,post_id,revision,source_sha256,ink_sha256,ink_gzip,updated_at_ms)
      VALUES (?,?,0,'','',?,0) ON DUPLICATE KEY UPDATE post_id=VALUES(post_id)`,
      [account, post, Buffer.alloc(0)],
    );
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT post_id,revision,source_sha256,ink_sha256,updated_at_ms,compressed_bytes FROM dailymath_ink WHERE school_account=? AND post_id=? FOR UPDATE",
      [account, post],
    );
    const current = metadata(rows[0]);
    const decision = inkWriteDecision(current, ink);
    if (decision === "conflict")
      throw new DailyMathRequestError(
        "다른 기기의 필기가 변경되었습니다.",
        409,
      );
    if (decision === "unchanged") {
      await connection.commit();
      return current;
    }
    const [usage] = await connection.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS count, COALESCE(SUM(compressed_bytes),0) AS bytes FROM dailymath_ink WHERE school_account=?",
      [account],
    );
    if (
      Number(usage[0].count) > 5000 ||
      Number(usage[0].bytes) -
        Number(rows[0].compressed_bytes) +
        ink.compressed.length >
        256 * 1024 * 1024
    )
      throw new DailyMathRequestError(
        "계정의 필기 저장 한도를 초과했습니다.",
        413,
      );
    const next = {
      post_id: post,
      revision: current.revision + 1,
      source_sha256: ink.source_sha256,
      ink_sha256: ink.ink_sha256,
      updated_at_ms: Date.now(),
    };
    await connection.execute(
      `UPDATE dailymath_ink SET revision=?,source_sha256=?,ink_sha256=?,ink_gzip=?,compressed_bytes=?,updated_at_ms=?
      WHERE school_account=? AND post_id=?`,
      [
        next.revision,
        next.source_sha256,
        next.ink_sha256,
        ink.compressed,
        ink.compressed.length,
        next.updated_at_ms,
        account,
        post,
      ],
    );
    await connection.commit();
    return next;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
