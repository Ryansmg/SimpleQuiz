export type ProgressRecord = {
  post_id: number;
  state: "new" | "draft" | "submitted" | "late";
  reply_id: number | null;
  solved_on: string | null;
  updated_at_ms: number;
  first_submitted_at_ms: number | null;
};
export class DailyMathRequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
/** Only server-issued app tokens may access records. Student IDs are never credentials. */
export function bearerToken(request: Request): string {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match)
    throw new DailyMathRequestError("DailyMath 인증이 필요합니다.", 401);
  return match[1];
}

export function parseProgress(
  value: unknown,
  now = Date.now(),
): ProgressRecord[] {
  if (!Array.isArray(value) || value.length > 200)
    throw new DailyMathRequestError("한 번에 200개 이하의 기록을 보내 주세요.");
  const seen = new Set<number>();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new DailyMathRequestError("기록 형식이 올바르지 않습니다.");
    const { post_id, state, reply_id, solved_on, updated_at_ms } = item;
    const first_submitted_at_ms = item.first_submitted_at_ms ?? null;
    if (
      first_submitted_at_ms !== null &&
      (!Number.isSafeInteger(first_submitted_at_ms) ||
        first_submitted_at_ms <= 0 ||
        first_submitted_at_ms > now + 600000 ||
        solved_on === null)
    )
      throw new DailyMathRequestError("최초 제출 시각이 올바르지 않습니다.");
    if (!Number.isSafeInteger(post_id) || post_id <= 0 || seen.has(post_id))
      throw new DailyMathRequestError(
        "문제 번호가 중복되거나 올바르지 않습니다.",
      );
    seen.add(post_id);
    if (
      state !== "new" &&
      state !== "draft" &&
      state !== "submitted" &&
      state !== "late"
    )
      throw new DailyMathRequestError("동기화할 수 없는 상태입니다.");
    if (reply_id !== null && (!Number.isSafeInteger(reply_id) || reply_id <= 0))
      throw new DailyMathRequestError("댓글 번호가 올바르지 않습니다.");
    if (
      solved_on !== null &&
      (typeof solved_on !== "string" ||
        !/^20\d{2}-\d{2}-\d{2}$/.test(solved_on) ||
        !Number.isFinite(Date.parse(solved_on)) ||
        new Date(solved_on).toISOString().slice(0, 10) !== solved_on)
    )
      throw new DailyMathRequestError("학습 날짜가 올바르지 않습니다.");
    if (state === "late" && solved_on === null)
      throw new DailyMathRequestError("완료 기록에 학습 날짜가 필요합니다.");
    if (state === "submitted" && reply_id === null)
      throw new DailyMathRequestError("제출 기록에 댓글 번호가 필요합니다.");
    if (
      !Number.isSafeInteger(updated_at_ms) ||
      updated_at_ms <= 0 ||
      updated_at_ms > now + 600000
    )
      throw new DailyMathRequestError("기기 시간을 확인해 주세요.");
    return {
      post_id,
      state,
      reply_id,
      solved_on,
      updated_at_ms,
      first_submitted_at_ms,
    };
  });
}
export async function readJsonBody(request: Request, maxBytes = 128 * 1024) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new DailyMathRequestError("JSON 요청이 필요합니다.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new DailyMathRequestError("본문이 없습니다.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new DailyMathRequestError("요청이 너무 큽니다.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DailyMathRequestError("JSON 형식이 올바르지 않습니다.");
  }
  return body;
}

export async function readProgressBody(request: Request) {
  return parseProgress(await readJsonBody(request));
}
