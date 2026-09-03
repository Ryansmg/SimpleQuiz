import type { Metadata } from "next";
import Link from "next/link";
import { listCustomPuzzles, type CustomPuzzle } from "@/lib/custom-puzzles";
import {
  PUZZLE_DIFFICULTIES,
  type PuzzleDifficulty,
} from "@/lib/seventeen-expression";
import CustomHeader from "./CustomHeader";
import styles from "./custom.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "커스텀 17 문제 | minguu.dev",
  description: "다른 사용자가 만든 17 만들기 문제를 골라 풀어 보세요.",
};

type ListSort = "new" | "top";
type ListSearchParams = {
  difficulty?: string | string[];
  sort?: string | string[];
};

function difficultyClass(difficulty: PuzzleDifficulty): string {
  if (difficulty === "도전") return styles.difficultyHard;
  if (difficulty === "보통") return styles.difficultyMedium;
  return "";
}

function scoreClass(score: number): string {
  if (score > 0) return styles.scorePositive;
  if (score < 0) return styles.scoreNegative;
  return "";
}

function formatVoteScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "최근";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function listHref(
  difficulty: PuzzleDifficulty | undefined,
  sort: ListSort,
): string {
  const params = new URLSearchParams();
  if (difficulty) params.set("difficulty", difficulty);
  if (sort === "top") params.set("sort", "top");
  const query = params.toString();
  return query ? `/17/custom?${query}` : "/17/custom";
}

function randomHref(difficulty: PuzzleDifficulty | undefined): string {
  if (!difficulty) return "/17/custom/random";
  const params = new URLSearchParams({ difficulty });
  return `/17/custom/random?${params.toString()}`;
}

function PuzzleRows({ puzzles }: { puzzles: CustomPuzzle[] }) {
  return (
    <ol className={styles.puzzleList}>
      {puzzles.map((puzzle, index) => (
        <li key={puzzle.id}>
          <Link href={`/17/custom/${puzzle.id}`} className={styles.puzzleRow}>
            <span className={styles.rowNumber}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className={styles.rowMain}>
              <div className={styles.miniCards} aria-label={`숫자 카드 ${puzzle.cards.join(", ")}`}>
                {puzzle.cards.map((card, cardIndex) => (
                  <span
                    className={styles.miniCard}
                    title={card}
                    key={`${puzzle.id}-${cardIndex}`}
                  >
                    {card}
                  </span>
                ))}
              </div>
            </div>
            <strong
              className={`${styles.rowVoteScore} ${scoreClass(puzzle.voteScore)}`}
              aria-label={`투표 점수 ${formatVoteScore(puzzle.voteScore)}`}
            >
              {formatVoteScore(puzzle.voteScore)}
            </strong>
            <div className={styles.rowMeta}>
              <span className={`${styles.difficulty} ${difficultyClass(puzzle.difficulty)}`}>
                {puzzle.difficulty}
              </span>
              <span className={styles.authorMeta}>
                <strong title={puzzle.nickname}>{puzzle.nickname}</strong>
                <span>{formatDate(puzzle.createdAt)}</span>
              </span>
            </div>
            <span className={styles.rowArrow} aria-hidden="true">→</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default async function CustomPuzzleListPage({
  searchParams,
}: {
  searchParams: Promise<ListSearchParams>;
}) {
  const query = await searchParams;
  const requestedDifficulty = firstValue(query.difficulty);
  const difficulty = PUZZLE_DIFFICULTIES.includes(
    requestedDifficulty as PuzzleDifficulty,
  )
    ? (requestedDifficulty as PuzzleDifficulty)
    : undefined;
  const sort: ListSort = firstValue(query.sort) === "top" ? "top" : "new";

  let puzzles: CustomPuzzle[] = [];
  let unavailable = false;

  try {
    puzzles = await listCustomPuzzles({ difficulty, sort });
  } catch (error) {
    console.error("Failed to load custom 17 puzzles", error);
    unavailable = true;
  }

  return (
    <main className={styles.customPage} lang="ko">
      <CustomHeader />

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            CUSTOM PUZZLES
          </div>
          <h1>
            누군가 만든 <span>17</span>에 도전하세요.
          </h1>
          <p>
            평범한 네 장부터 자릿수가 끝없이 긴 숫자까지. 만든 사람이 직접
            검증한 문제만 모았습니다.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href={randomHref(difficulty)} className={styles.secondaryLink}>랜덤 문제 풀기</Link>
          <Link href="/17/custom/new" className={styles.primaryLink}>내 문제 올리기</Link>
        </div>
      </section>

      <section className={styles.listPanel} aria-labelledby="custom-list-title">
        <div className={styles.listTop}>
          <h2 id="custom-list-title">
            {sort === "top" ? "추천받은 문제" : "새로 올라온 문제"}
          </h2>
          <span className={styles.listCount}>{unavailable ? "OFFLINE" : `${puzzles.length} PUZZLES`}</span>
        </div>

        <nav className={styles.listToolbar} aria-label="문제 목록 필터와 정렬">
          <div className={styles.toolbarGroup}>
            <span className={styles.toolbarLabel}>난이도</span>
            <div className={styles.toolbarChoices}>
              <Link
                href={listHref(undefined, sort)}
                className={`${styles.toolbarChoice} ${!difficulty ? styles.toolbarChoiceActive : ""}`}
                aria-current={!difficulty ? "page" : undefined}
              >
                전체
              </Link>
              {PUZZLE_DIFFICULTIES.map((option) => (
                <Link
                  key={option}
                  href={listHref(option, sort)}
                  className={`${styles.toolbarChoice} ${difficulty === option ? styles.toolbarChoiceActive : ""}`}
                  aria-current={difficulty === option ? "page" : undefined}
                >
                  {option}
                </Link>
              ))}
            </div>
          </div>
          <div className={styles.toolbarGroup}>
            <span className={styles.toolbarLabel}>정렬</span>
            <div className={styles.toolbarChoices}>
              <Link
                href={listHref(difficulty, "new")}
                className={`${styles.toolbarChoice} ${sort === "new" ? styles.toolbarChoiceActive : ""}`}
                aria-current={sort === "new" ? "page" : undefined}
              >
                최신순
              </Link>
              <Link
                href={listHref(difficulty, "top")}
                className={`${styles.toolbarChoice} ${sort === "top" ? styles.toolbarChoiceActive : ""}`}
                aria-current={sort === "top" ? "page" : undefined}
              >
                추천순
              </Link>
            </div>
          </div>
        </nav>

        {unavailable ? (
          <div className={styles.emptyState} role="status">
            <span className={styles.emptyMark}>!</span>
            <h2>문제 목록을 불러오지 못했어요.</h2>
            <p>데이터베이스 연결을 확인한 뒤 새로고침해 주세요.</p>
          </div>
        ) : puzzles.length === 0 && difficulty ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyMark}>17</span>
            <h2>{difficulty} 난이도 문제가 아직 없어요.</h2>
            <p>다른 난이도를 둘러보거나 새로운 문제를 올려 보세요.</p>
            <Link href={listHref(undefined, sort)} className={styles.secondaryLink}>전체 문제 보기</Link>
          </div>
        ) : puzzles.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyMark}>17</span>
            <h2>첫 번째 문제를 기다리고 있어요.</h2>
            <p>기발한 조합을 발견했다면 가장 먼저 올려 보세요.</p>
            <Link href="/17/custom/new" className={styles.primaryLink}>첫 문제 만들기</Link>
          </div>
        ) : (
          <PuzzleRows puzzles={puzzles} />
        )}
      </section>

      <footer className={styles.footer}>
        <span>USER-CREATED · SERVER VERIFIED</span>
        <span>minguu.dev / 17</span>
      </footer>
    </main>
  );
}