import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { bearerToken, DailyMathRequestError } from "./dailymath-contract";
import { dailyMathPool, ensureDailyMathSchema } from "./dailymath";

const TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function authenticatedAccount(request: Request): Promise<string> {
  const digest = tokenHash(bearerToken(request));
  await ensureDailyMathSchema();
  const [rows] = await dailyMathPool().execute<RowDataPacket[]>(
    "SELECT school_account FROM dailymath_sessions WHERE token_hash = ? AND expires_at_ms > ?",
    [digest, Date.now()],
  );
  if (rows.length !== 1)
    throw new DailyMathRequestError("DailyMath 인증이 만료되었습니다.", 401);
  return String(rows[0].school_account);
}

export async function issueDailyMathToken(account: string) {
  await ensureDailyMathSchema();
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + TOKEN_LIFETIME_MS;
  await dailyMathPool().execute(
    "DELETE FROM dailymath_sessions WHERE expires_at_ms <= ?",
    [Date.now()],
  );
  await dailyMathPool().execute(
    "INSERT INTO dailymath_sessions (token_hash, school_account, expires_at_ms) VALUES (?, ?, ?)",
    [tokenHash(token), account, expiresAt],
  );
  return { token, account, expires_at_ms: expiresAt };
}

export async function revokeDailyMathToken(request: Request) {
  const digest = tokenHash(bearerToken(request));
  await ensureDailyMathSchema();
  await dailyMathPool().execute(
    "DELETE FROM dailymath_sessions WHERE token_hash = ?",
    [digest],
  );
}
