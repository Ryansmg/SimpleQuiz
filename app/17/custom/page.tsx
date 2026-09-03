import type { Metadata } from "next";
import Link from "next/link";
import { listCustomPuzzles, type CustomPuzzle } from "@/lib/custom-puzzles";
import type { PuzzleDifficulty } from "@/lib/seventeen-expression";
import CustomHeader from "./CustomHeader";
import styles from "./custom.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "커스텀 17 문제 | minguu.dev",
  description: "다른 사용자가 만든 17 만들기 문제를 골라 풀어 보세요.",
};

function difficultyClass(difficulty: PuzzleDifficulty): string {
  if (difficulty === "도전") return styles.difficultyHard;
  if (difficulty === "보통") return styles.difficultyMedium;
  return "";
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
            <div className={styles.rowMeta}>
              <strong title={puzzle.nickname}>{puzzle.nickname}</strong>
              <span className={`${styles.difficulty} ${difficultyClass(puzzle.difficulty)}`}>
                {puzzle.difficulty}
              </span>
              <span>{formatDate(puzzle.createdAt)}</span>
            </div>
            <span className={styles.rowArrow} aria-hidden="true">→</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export default async function CustomPuzzleListPage() {
  let puzzles: CustomPuzzle[] = [];
  let unavailable = false;

  try {
    puzzles = await listCustomPuzzles();
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
          <Link href="/17" className={styles.secondaryLink}>랜덤 문제 풀기</Link>
          <Link href="/17/custom/new" className={styles.primaryLink}>내 문제 올리기</Link>
        </div>
      </section>

      <section className={styles.listPanel} aria-labelledby="custom-list-title">
        <div className={styles.listTop}>
          <h2 id="custom-list-title">새로 올라온 문제</h2>
          <span className={styles.listCount}>{unavailable ? "OFFLINE" : `${puzzles.length} PUZZLES`}</span>
        </div>

        {unavailable ? (
          <div className={styles.emptyState} role="status">
            <span className={styles.emptyMark}>!</span>
            <h2>문제 목록을 불러오지 못했어요.</h2>
            <p>데이터베이스 연결을 확인한 뒤 새로고침해 주세요.</p>
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