import { getRandomCustomPuzzleId } from "@/lib/custom-puzzles";
import {
  PUZZLE_DIFFICULTIES,
  type PuzzleDifficulty,
} from "@/lib/seventeen-expression";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestedDifficulty = requestUrl.searchParams.get("difficulty");
  const difficulty = PUZZLE_DIFFICULTIES.includes(
    requestedDifficulty as PuzzleDifficulty,
  )
    ? (requestedDifficulty as PuzzleDifficulty)
    : undefined;

  try {
    const puzzleId = await getRandomCustomPuzzleId(difficulty);
    if (puzzleId) {
      return new Response(null, {
        status: 307,
        headers: { Location: `/17/custom/${puzzleId}` },
      });
    }
  } catch (error) {
    console.error("Failed to select random custom 17 puzzle", error);
  }

  const fallbackParams = new URLSearchParams();
  if (difficulty) fallbackParams.set("difficulty", difficulty);
  const fallbackQuery = fallbackParams.toString();
  return new Response(null, {
    status: 307,
    headers: {
      Location: fallbackQuery
        ? `/17/custom?${fallbackQuery}`
        : "/17/custom",
    },
  });
}