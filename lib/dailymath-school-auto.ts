import { createHash } from "node:crypto";
import { DailyMathRequestError } from "./dailymath-contract";
import { schoolFetch } from "./dailymath-school-http";
import { verifySchoolSession } from "./dailymath-school";

const SCHOOL = "https://student.gs.hs.kr";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) DailyMath/1.0 Chrome/120.0.0.0 Mobile Safari/537.36";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** This proof is a credential. Never log, cache, or persist it. */
export function automaticLoginProof(body: unknown): string {
  const proof =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).auto_login_proof
      : undefined;
  if (typeof proof !== "string" || !/^[a-f0-9]{64}$/.test(proof)) {
    throw new DailyMathRequestError("학교 자동 로그인 인증값이 필요합니다.");
  }
  return proof;
}

/** Creates a separate school session, confined to this single token exchange. */
export async function verifySchoolAutomaticLogin(
  proof: string,
  fetcher: typeof fetch = schoolFetch,
): Promise<string> {
  automaticLoginProof({ auto_login_proof: proof });
  let session: string | undefined;
  async function post(path: string, body: URLSearchParams): Promise<string> {
    let response: Response;
    try {
      response = await fetcher(`${SCHOOL}${path}`, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          Referer: `${SCHOOL}/student/login.do`,
          "Content-Type": "application/x-www-form-urlencoded",
          ...(session ? { Cookie: `JSESSIONID=${session}` } : {}),
        },
        body,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new DailyMathRequestError(
        "학교 인증 서버에 연결하지 못했습니다.",
        503,
      );
    }
    if (!response.ok) {
      throw new DailyMathRequestError(
        "학교 자동 로그인을 확인하지 못했습니다.",
        503,
      );
    }
    for (const cookie of response.headers.getSetCookie()) {
      const match = /^JSESSIONID=([A-Za-z0-9._-]{16,256})(?:;|$)/.exec(cookie);
      if (match) session = match[1];
    }
    const text = (await response.text()).trim();
    if (text.length > 2048 || /[<>\r\n]/.test(text)) {
      throw new DailyMathRequestError(
        "학교 인증 응답을 확인하지 못했습니다.",
        503,
      );
    }
    return text;
  }

  const challenge = await post(
    "/student/getSessionKey.do",
    new URLSearchParams(),
  );
  if (!session || !challenge) {
    throw new DailyMathRequestError("학교 인증 세션을 만들지 못했습니다.", 503);
  }
  const result = await post(
    "/student/autoLogin.do",
    new URLSearchParams({
      sKey: proof,
      cKey: hash(challenge),
      vKey: hash(USER_AGENT.replace(/[^a-zA-Z]/g, "").toUpperCase()),
      device: "Android",
      mode: "AUTO",
      pin: "",
    }),
  );
  if (result !== "FINE") {
    throw new DailyMathRequestError("송죽학사에 다시 로그인해 주세요.", 401);
  }
  // Identity comes exclusively from the school's authenticated self-profile.
  return verifySchoolSession(session, fetcher);
}
