import { authenticatedAccount } from "@/lib/dailymath-auth";
import { checkDailyMathRate } from "@/lib/dailymath";
import { readJsonBody } from "@/lib/dailymath-contract";
import {
  inkPostId,
  parseInkUpload,
  MAX_INK_COMPRESSED,
} from "@/lib/dailymath-ink-contract";
import { readInk, writeInk } from "@/lib/dailymath-ink";
import { inkFailure, inkHeaders } from "@/lib/dailymath-ink-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ postId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const account = await authenticatedAccount(request);
    checkDailyMathRate(`ink:${account}`);
    return Response.json(
      await readInk(account, inkPostId((await context.params).postId)),
      { headers: inkHeaders },
    );
  } catch (error) {
    return inkFailure(error);
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    const account = await authenticatedAccount(request);
    checkDailyMathRate(`ink:${account}`);
    const post = inkPostId((await context.params).postId);
    const ink = await parseInkUpload(
      await readJsonBody(request, Math.ceil(MAX_INK_COMPRESSED / 3) * 4 + 4096),
    );
    return Response.json(await writeInk(account, post, ink), {
      headers: inkHeaders,
    });
  } catch (error) {
    return inkFailure(error);
  }
}
