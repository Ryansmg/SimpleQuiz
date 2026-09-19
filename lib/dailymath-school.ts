import { createHash } from "node:crypto";
import { schoolFetch } from "./dailymath-school-http";
import { DailyMathRequestError } from "./dailymath-contract";

const PROFILE_URL = "https://student.gs.hs.kr/student/mymenu/privateInfo.do";

/** Parse only the school's self-profile response, never HTML supplied by the client. */
export function verifiedAccountFromProfile(html: string): string {
  const loggedIn = /<a\b[^>]*href=["']\/student\/logout\.do["']/i.test(html);
  const studentRows = [
    ...html.matchAll(
      /<tr\b[^>]*>\s*<td\b[^>]*>\s*학번\s*<\/td>\s*<td\b[^>]*>\s*(\d{5})\s*<\/td>\s*<\/tr>/gi,
    ),
  ];
  if (!loggedIn || studentRows.length !== 1) {
    console.warn("DailyMath school verification rejected", {
      loggedIn,
      profileRows: studentRows.length,
    });
    throw new DailyMathRequestError(
      "송죽학사 로그인을 다시 확인해 주세요.",
      401,
    );
  }
  return createHash("sha256").update(studentRows[0][1]).digest("hex");
}

export function schoolSessionId(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new DailyMathRequestError("세션 형식이 올바르지 않습니다.");
  const value = (body as Record<string, unknown>).session_id;
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{16,256}$/.test(value))
    throw new DailyMathRequestError("세션 형식이 올바르지 않습니다.");
  return value;
}

export async function verifySchoolSession(
  sessionId: string,
  fetcher: typeof fetch = schoolFetch,
): Promise<string> {
  // Only this fixed school endpoint receives JSESSIONID. Never follow a redirect.
  let response: Response;
  try {
    response = await fetcher(PROFILE_URL, {
      headers: {
        Cookie: `JSESSIONID=${sessionId}`,
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) DailyMath/1.0 Chrome/120.0.0.0 Mobile Safari/537.36",
      },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new DailyMathRequestError(
      "학교 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
  if (response.status >= 300 && response.status < 500) {
    console.warn("DailyMath school verification status", { status: response.status });
    throw new DailyMathRequestError("송죽학사 세션이 만료되었습니다.", 401);
  }
  if (!response.ok)
    throw new DailyMathRequestError("학교 서버를 확인하지 못했습니다.", 503);
  const reader = response.body?.getReader();
  if (!reader)
    throw new DailyMathRequestError("학교 응답을 확인하지 못했습니다.", 503);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 512 * 1024) {
        await reader.cancel();
        throw new DailyMathRequestError(
          "학교 응답 형식이 변경되었습니다.",
          503,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return verifiedAccountFromProfile(Buffer.concat(chunks).toString("utf8"));
}
