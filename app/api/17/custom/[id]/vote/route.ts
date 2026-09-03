import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import {
  createCustomPuzzleVoterKey,
  getCustomPuzzle,
  setCustomPuzzleVote,
} from "@/lib/custom-puzzles";
import { checkSeventeenExpression } from "@/lib/seventeen-expression";

const VOTER_COOKIE = "seventeen-voter";
const VOTER_MAX_AGE = 60 * 60 * 24 * 365;

type VoteSubmission = {
  vote?: unknown;
  solution?: unknown;
};

function validationError(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}


export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let submission: VoteSubmission;

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return validationError("투표 내용을 읽을 수 없어요.");
    }
    submission = body as VoteSubmission;
  } catch {
    return validationError("투표 내용을 읽을 수 없어요.");
  }

  if (
    submission.vote !== -1 &&
    submission.vote !== 0 &&
    submission.vote !== 1
  ) {
    return validationError("올바른 투표를 선택해 주세요.");
  }
  if (typeof submission.solution !== "string") {
    return validationError("문제를 먼저 풀어 주세요.");
  }

  try {
    const puzzle = await getCustomPuzzle(id);
    if (!puzzle) {
      return Response.json({ error: "문제를 찾을 수 없어요." }, { status: 404 });
    }

    const check = checkSeventeenExpression(
      puzzle.cards,
      submission.solution.trim(),
    );
    if (!check.ok) {
      return validationError("정답을 맞힌 뒤 투표할 수 있어요.");
    }

    const cookieStore = await cookies();
    const existingVoterId = cookieStore.get(VOTER_COOKIE)?.value;
    const voterId =
      existingVoterId && /^[0-9a-f-]{36}$/i.test(existingVoterId)
        ? existingVoterId
        : randomUUID();
    const score = await setCustomPuzzleVote({
      puzzleId: id,
      voterKey: createCustomPuzzleVoterKey(voterId),
      vote: submission.vote,
    });

    if (score === null) {
      return Response.json({ error: "문제를 찾을 수 없어요." }, { status: 404 });
    }

    if (voterId !== existingVoterId) {
      cookieStore.set(VOTER_COOKIE, voterId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: VOTER_MAX_AGE,
      });
    }

    return Response.json({ score, vote: submission.vote });
  } catch (error) {
    console.error("Failed to vote on custom 17 puzzle", error);
    return Response.json(
      { error: "지금은 투표할 수 없어요. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
}