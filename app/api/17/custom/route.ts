import {
  createCustomPuzzle,
  DuplicateCustomPuzzleError,
} from "@/lib/custom-puzzles";
import {
  checkSeventeenExpression,
  normalizePuzzleCards,
  PUZZLE_DIFFICULTIES,
  type PuzzleDifficulty,
} from "@/lib/seventeen-expression";

type Submission = {
  nickname?: unknown;
  difficulty?: unknown;
  cards?: unknown;
  solution?: unknown;
};

function validationError(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let submission: Submission;

  try {
    const rawSubmission: unknown = await request.json();
    if (
      !rawSubmission ||
      typeof rawSubmission !== "object" ||
      Array.isArray(rawSubmission)
    ) {
      return validationError("등록 내용을 읽을 수 없어요. 다시 시도해 주세요.");
    }
    submission = rawSubmission as Submission;
  } catch {
    return validationError("등록 내용을 읽을 수 없어요. 다시 시도해 주세요.");
  }

  const nickname =
    typeof submission.nickname === "string" ? submission.nickname.trim() : "";
  if (!nickname) return validationError("닉네임을 입력해 주세요.");
  if (Array.from(nickname).length > 20) {
    return validationError("닉네임은 20자 이하로 입력해 주세요.");
  }

  if (
    typeof submission.difficulty !== "string" ||
    !PUZZLE_DIFFICULTIES.includes(submission.difficulty as PuzzleDifficulty)
  ) {
    return validationError("난이도를 선택해 주세요.");
  }

  let cards: string[];
  try {
    cards = normalizePuzzleCards(submission.cards);
  } catch (error) {
    return validationError(
      error instanceof Error ? error.message : "숫자 카드를 확인해 주세요.",
    );
  }

  if (typeof submission.solution !== "string") {
    return validationError("답안을 입력해 주세요.");
  }

  const solution = submission.solution.trim();
  const check = checkSeventeenExpression(cards, solution);
  if (!check.ok) return validationError(check.message);

  try {
    const id = await createCustomPuzzle({
      nickname,
      difficulty: submission.difficulty as PuzzleDifficulty,
      cards,
      solution,
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateCustomPuzzleError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    console.error("Failed to create custom 17 puzzle", error);
    return Response.json(
      { error: "지금은 문제를 저장할 수 없어요. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
}