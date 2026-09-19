import { authenticatedAccount } from "@/lib/dailymath-auth";
import { checkDailyMathRate } from "@/lib/dailymath";
import { DailyMathRequestError, readJsonBody } from "@/lib/dailymath-contract";
import { schoolSessionId, verifySchoolSession } from "@/lib/dailymath-school";
import { rankingSnapshot, refreshRanking } from "@/lib/dailymath-ranking";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const status = error instanceof DailyMathRequestError ? error.status : 503;
  return Response.json(
    {
      error:
        error instanceof DailyMathRequestError
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
  try {
    const account = await authenticatedAccount(request);
    checkDailyMathRate(`ranking:${account}`);
    const body = await readJsonBody(request, 2048);
    const sessionId = schoolSessionId(body);
    if ((await verifySchoolSession(sessionId)) !== account)
      throw new DailyMathRequestError(
        "로그인한 학교 계정이 일치하지 않습니다.",
        403,
      );
    const continuation =
      (body as Record<string, unknown>).continue_scan === true;
    return Response.json(
      await refreshRanking(account, sessionId, continuation),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
