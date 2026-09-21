import { DailyMathRequestError } from "./dailymath-contract";
export const inkHeaders = { "Cache-Control": "no-store" };
export function inkFailure(error: unknown) {
  const status = error instanceof DailyMathRequestError ? error.status : 503;
  return Response.json(
    {
      error:
        error instanceof DailyMathRequestError
          ? error.message
          : "필기를 동기화하지 못했습니다. 기기의 필기는 보존됩니다.",
    },
    {
      status,
      headers: {
        ...inkHeaders,
        ...(status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
