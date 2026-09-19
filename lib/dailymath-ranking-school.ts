import { schoolFetch } from "./dailymath-school-http";
import { DailyMathRequestError } from "./dailymath-contract";
import { requireSchoolPage } from "./dailymath-ranking-model";

/** Only fixed school pages receive the caller's session, kept in memory for this request. */
export async function fetchRankingPage(
  sessionId: string,
  postId?: number,
): Promise<string> {
  if (postId !== undefined && (!Number.isSafeInteger(postId) || postId <= 0))
    throw new Error("Invalid post ID");
  const url =
    "https://student.gs.hs.kr/student/notice/" +
    (postId === undefined
      ? "dailymathList.do?limit=N"
      : `info.do?noticeNo=${postId}`);
  try {
    const response = await schoolFetch(url, {
      headers: {
        Cookie: `JSESSIONID=${sessionId}`,
        Connection: "close",
        "User-Agent": "DailyMath/1.0",
      },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 300 && response.status < 500)
      throw new DailyMathRequestError("송죽학사에 다시 로그인해 주세요.", 401);
    if (!response.ok || !response.body) throw new Error("School unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 4 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Page too large");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const html = Buffer.concat(chunks).toString("utf8");
    requireSchoolPage(html);
    return html;
  } catch (error) {
    if (error instanceof DailyMathRequestError) throw error;
    throw new DailyMathRequestError(
      "학교 댓글을 불러오지 못했습니다. 다시 시도해 주세요.",
      503,
    );
  }
}
