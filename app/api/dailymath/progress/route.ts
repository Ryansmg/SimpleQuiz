import { authenticatedAccount } from "@/lib/dailymath-auth";
import {
  readProgressBody,
  DailyMathRequestError,
} from "@/lib/dailymath-contract";
import {
  checkDailyMathRate,
  getDailyMathProgress,
  putDailyMathProgress,
} from "@/lib/dailymath";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  const status = error instanceof DailyMathRequestError ? error.status : 503;
  return Response.json(
    {
      error:
        error instanceof DailyMathRequestError
          ? error.message
          : "기록 서버에 연결하지 못했습니다. 기기의 기록은 보존됩니다.",
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429
          ? {
              "Retry-After": "60",
            }
          : {}),
      },
    },
  );
}
export async function GET(request: Request) {
  try {
    const account = await authenticatedAccount(request);
    checkDailyMathRate(account);
    const records = await getDailyMathProgress(account);
    return Response.json(records, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  try {
    const account = await authenticatedAccount(request);
    checkDailyMathRate(account);
    const records = await readProgressBody(request);
    await putDailyMathProgress(account, records);
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
