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
      return Response.redirect(
        new URL(`/17/custom/${puzzleId}`, requestUrl),
        307,
      );
    }
  } catch (error) {
    console.error("Failed to select random custom 17 puzzle", error);
  }

  const fallback = new URL("/17/custom", requestUrl);
  if (difficulty) fallback.searchParams.set("difficulty", difficulty);
  return Response.redirect(fallback, 307);
}