import {
  issueDailyMathToken,
  revokeDailyMathToken,
} from "@/lib/dailymath-auth";
import { checkDailyMathRate } from "@/lib/dailymath";
import {
  DailyMathRequestError,
  readJsonBody,
  claimedStudentAccount,
} from "@/lib/dailymath-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown): Response {
  // Do not log request bodies, school cookies, response HTML or raw database errors.
  const status = error instanceof DailyMathRequestError ? error.status : 503;
  return Response.json(
    {
      error:
        error instanceof DailyMathRequestError
          ? error.message
          : "인증 서버에 연결하지 못했습니다.",
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    const account = claimedStudentAccount(await readJsonBody(request, 2048));
    checkDailyMathRate(`account:${account}`);
    const auth = await issueDailyMathToken(account);
    return Response.json(auth, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await revokeDailyMathToken(request);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
