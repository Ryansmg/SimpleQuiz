import { createHash } from "node:crypto";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { DailyMathRequestError } from "./dailymath-contract";

export const MAX_INK_COMPRESSED = 2 * 1024 * 1024;
export const MAX_INK_JSON = 16 * 1024 * 1024;
const unzip = promisify(gunzip);
export type InkUpload = {
  base_revision: number;
  source_sha256: string;
  ink_sha256: string;
  compressed: Buffer;
};
export function inkPostId(value: string): number {
  if (!/^[1-9][0-9]{0,9}$/.test(value))
    throw new DailyMathRequestError("문제 번호가 올바르지 않습니다.");
  return Number(value);
}
export async function parseInkUpload(value: unknown): Promise<InkUpload> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DailyMathRequestError("필기 형식이 올바르지 않습니다.");
  const v = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(v.base_revision) ||
    Number(v.base_revision) < 0 ||
    typeof v.source_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.source_sha256) ||
    typeof v.ink_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.ink_sha256) ||
    typeof v.data !== "string" ||
    v.data.length > Math.ceil(MAX_INK_COMPRESSED / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      v.data,
    )
  )
    throw new DailyMathRequestError("필기 형식이나 크기를 확인해 주세요.");
  const compressed = Buffer.from(v.data, "base64");
  if (!compressed.length || compressed.length > MAX_INK_COMPRESSED)
    throw new DailyMathRequestError("필기 용량이 너무 큽니다.", 413);
  let json: Buffer;
  try {
    json = await unzip(compressed, { maxOutputLength: MAX_INK_JSON });
  } catch {
    throw new DailyMathRequestError("압축된 필기를 읽을 수 없습니다.");
  }
  if (createHash("sha256").update(json).digest("hex") !== v.ink_sha256)
    throw new DailyMathRequestError("필기 데이터가 일치하지 않습니다.");
  let strokes: unknown;
  try {
    strokes = JSON.parse(json.toString("utf8"));
  } catch {
    throw new DailyMathRequestError("필기를 읽을 수 없습니다.");
  }
  if (!Array.isArray(strokes) || strokes.length > 100000)
    throw new DailyMathRequestError("필기 형식이 올바르지 않습니다.");
  let count = 0;
  for (const s of strokes) {
    if (
      !s ||
      !Number.isInteger(s.page) ||
      s.page < 0 ||
      s.page > 9999 ||
      !Number.isInteger(s.color) ||
      s.color < -2147483648 ||
      s.color > 2147483647 ||
      !Number.isFinite(s.width) ||
      s.width <= 0 ||
      s.width > 1 ||
      !Array.isArray(s.points)
    )
      throw new DailyMathRequestError("획 형식이 올바르지 않습니다.");
    count += s.points.length;
    if (count > 1000000)
      throw new DailyMathRequestError("필기 용량이 너무 큽니다.", 413);
    for (const p of s.points) {
      if (
        !Array.isArray(p) ||
        p.length < 2 ||
        p.length > 3 ||
        !p.every((n: unknown) => typeof n === "number" && Number.isFinite(n)) ||
        Math.abs(p[0]) > 16 ||
        Math.abs(p[1]) > 16 ||
        (p.length === 3 && (p[2] < 0 || p[2] > 4))
      )
        throw new DailyMathRequestError("필기 좌표가 올바르지 않습니다.");
    }
  }
  return {
    base_revision: Number(v.base_revision),
    source_sha256: v.source_sha256,
    ink_sha256: v.ink_sha256,
    compressed,
  };
}

// A lost response can be retried without creating another revision.
export function inkWriteDecision(
  current: { revision: number; source_sha256: string; ink_sha256: string },
  incoming: InkUpload,
) {
  if (
    current.revision > 0 &&
    current.source_sha256 === incoming.source_sha256 &&
    current.ink_sha256 === incoming.ink_sha256
  )
    return "unchanged";
  return current.revision === incoming.base_revision ? "write" : "conflict";
}
