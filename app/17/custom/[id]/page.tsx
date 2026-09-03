import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  createCustomPuzzleVoterKey,
  getCustomPuzzle,
  getCustomPuzzleVote,
} from "@/lib/custom-puzzles";
import type { PuzzleDifficulty } from "@/lib/seventeen-expression";
import CustomHeader from "../CustomHeader";
import styles from "../custom.module.css";
import CustomPuzzleGame from "./CustomPuzzleGame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "커스텀 17 문제 풀기 | minguu.dev",
  description: "사용자가 만든 17 만들기 문제에 도전하세요.",
};

function difficultyClass(difficulty: PuzzleDifficulty): string {
  if (difficulty === "도전") return styles.difficultyHard;
  if (difficulty === "보통") return styles.difficultyMedium;
  return "";
}

function formatVoteScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "최근 등록";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default async function CustomPuzzleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  let puzzle;

  try {
    puzzle = await getCustomPuzzle(id);
  } catch (error) {
    console.error("Failed to load custom 17 puzzle", error);
    return (
      <main className={styles.customPage} lang="ko">
        <CustomHeader />
        <section className={styles.emptyState}>
          <span className={styles.emptyMark}>!</span>
          <h1>문제를 불러오지 못했어요.</h1>
          <p>데이터베이스 연결을 확인한 뒤 잠시 후 다시 시도해 주세요.</p>
          <Link href="/17/custom" className={styles.secondaryLink}>목록으로 돌아가기</Link>
        </section>
      </main>
    );
  }

  if (!puzzle) notFound();

  let initialVote: -1 | 0 | 1 = 0;
  const voterId = (await cookies()).get("seventeen-voter")?.value;
  if (voterId && /^[0-9a-f-]{36}$/i.test(voterId)) {
    try {
      initialVote = await getCustomPuzzleVote(
        puzzle.id,
        createCustomPuzzleVoterKey(voterId),
      );
    } catch (error) {
      console.error("Failed to load custom 17 puzzle vote", error);
    }
  }

  return (
    <main className={styles.customPage} lang="ko">
      <CustomHeader />

      <header className={styles.detailHeader}>
        <div>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            CUSTOM PUZZLE #{puzzle.id}
          </div>
          <h1>17을 만들어 보세요.</h1>
          <div className={styles.detailMeta}>
            <strong>{puzzle.nickname}</strong>
            <span className={`${styles.difficulty} ${difficultyClass(puzzle.difficulty)}`}>
              {puzzle.difficulty}
            </span>
            <strong
              className={`${styles.detailVoteScore} ${
                puzzle.voteScore > 0
                  ? styles.scorePositive
                  : puzzle.voteScore < 0
                    ? styles.scoreNegative
                    : ""
              }`}
              aria-label={`투표 점수 ${formatVoteScore(puzzle.voteScore)}`}
            >
              {formatVoteScore(puzzle.voteScore)}
            </strong>
            <span>{formatDate(puzzle.createdAt)}</span>
          </div>
        </div>
      </header>

      <CustomPuzzleGame
        puzzleId={puzzle.id}
        cards={puzzle.cards}
        created={query.created === "1"}
        initialScore={puzzle.voteScore}
        initialVote={initialVote}
      />

      <footer className={styles.footer}>
        <span>MINGUU.DEV / SEVENTEEN CUSTOM</span>
        <span>USE EVERY CARD ONCE</span>
      </footer>
    </main>
  );
}