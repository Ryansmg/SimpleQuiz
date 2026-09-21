import { authenticatedAccount } from "@/lib/dailymath-auth";
import { checkDailyMathRate } from "@/lib/dailymath";
import { inkManifest } from "@/lib/dailymath-ink";
import { inkFailure, inkHeaders } from "@/lib/dailymath-ink-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const account = await authenticatedAccount(request);
    checkDailyMathRate(`ink:${account}`);
    return Response.json(await inkManifest(account), { headers: inkHeaders });
  } catch (error) {
    return inkFailure(error);
  }
}
