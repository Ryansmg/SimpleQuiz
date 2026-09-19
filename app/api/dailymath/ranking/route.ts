import { authenticatedAccount } from "@/lib/dailymath-auth";
import { checkDailyMathRate } from "@/lib/dailymath";
import { DailyMathRequestError, readJsonBody } from "@/lib/dailymath-contract";
import { parseRankingUpload } from "@/lib/dailymath-ranking-model";
import { rankingSnapshot, refreshRanking } from "@/lib/dailymath-ranking";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown, appAuthenticated = false) {
  const originalStatus =
    error instanceof DailyMathRequestError ? error.status : 503;
  // A school-session rejection must not invalidate an already verified app token.
  const schoolSessionRejected = appAuthenticated && originalStatus === 401;
  const status = schoolSessionRejected ? 409 : originalStatus;
  return Response.json(
    {
      error: schoolSessionRejected
        ? "학교 로그인 상태를 확인하지 못했습니다. 잠시 후 새로고침해 주세요."
        : error instanceof DailyMathRequestError
          ? error.message
          : "랭킹을 갱신하지 못했습니다. 다시 시도해 주세요.",
    },
    {
      status,
      headers: {
        ...headers,
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
export async function GET(request: Request) {
  try {
    const account = await authenticatedAccount(request);
    checkDailyMathRate(`ranking:${account}`);
    return Response.json(await rankingSnapshot(account), { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  let appAuthenticated = false;
  try {
    const account = await authenticatedAccount(request);
    appAuthenticated = true;
    checkDailyMathRate(`ranking:${account}`);
    const input = parseRankingUpload(await readJsonBody(request, 1024 * 1024));
    return Response.json(await refreshRanking(account, input), { headers });
  } catch (error) {
    return failure(error, appAuthenticated);
  }
}
