"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  generateChallenge,
  type DifficultyPreference,
  type GeneratedChallenge,
  type NumberMode,
} from "@/lib/seventeen";
import styles from "./seventeen.module.css";

type TokenType =
  | "number"
  | "plus"
  | "minus"
  | "multiply"
  | "divide"
  | "power"
  | "leftParen"
  | "rightParen"
  | "end";

type Token = {
  type: TokenType;
  text: string;
  value?: number;
};

type Evaluation = {
  value: number;
  usedLiterals: string[];
};

type Feedback =
  | { kind: "idle"; message: string }
  | { kind: "error"; message: string }
  | { kind: "near"; message: string; value: number }
  | { kind: "correct"; message: string };

const TARGET = 17;
const RECENT_LIMIT = 80;

const BINARY_OPERATORS = [
  { label: "+", insert: " + ", ariaLabel: "더하기" },
  { label: "−", insert: " − ", ariaLabel: "빼기" },
  { label: "×", insert: " × ", ariaLabel: "곱하기" },
  { label: "÷", insert: " ÷ ", ariaLabel: "나누기" },
  { label: "^", insert: " ^ ", ariaLabel: "거듭제곱" },
];

const EXTRA_OPERATORS = [
  { label: "(", insert: "(", ariaLabel: "왼쪽 괄호" },
  { label: ")", insert: ")", ariaLabel: "오른쪽 괄호" },
];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (/\d/.test(character)) {
      let text = character;
      index += 1;

      while (index < source.length && /\d/.test(source[index])) {
        text += source[index];
        index += 1;
      }

      tokens.push({ type: "number", text, value: Number(text) });
      continue;
    }

    const operatorMap: Record<string, TokenType> = {
      "+": "plus",
      "-": "minus",
      "−": "minus",
      "*": "multiply",
      "×": "multiply",
      x: "multiply",
      X: "multiply",
      "/": "divide",
      "÷": "divide",
      "^": "power",
      "(": "leftParen",
      ")": "rightParen",
    };

    const type = operatorMap[character];
    if (!type) {
      throw new Error(`‘${character}’ 문자는 사용할 수 없어요.`);
    }

    tokens.push({ type, text: character });
    index += 1;
  }

  tokens.push({ type: "end", text: "" });
  return tokens;
}

class ExpressionParser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Evaluation {
    const result = this.parseAdditive();

    if (this.peek().type !== "end") {
      throw new Error("연산자나 괄호의 위치를 다시 확인해 주세요.");
    }

    return result;
  }

  private peek(): Token {
    return this.tokens[this.position];
  }

  private consume(type: TokenType): Token {
    const token = this.peek();

    if (token.type !== type) {
      throw new Error("식이 아직 완성되지 않았어요.");
    }

    this.position += 1;
    return token;
  }

  private parseAdditive(): Evaluation {
    let left = this.parseMultiplicative();

    while (this.peek().type === "plus" || this.peek().type === "minus") {
      const operator = this.peek().type;
      this.position += 1;
      const right = this.parseMultiplicative();
      left = {
        value:
          operator === "plus"
            ? left.value + right.value
            : left.value - right.value,
        usedLiterals: [...left.usedLiterals, ...right.usedLiterals],
      };
      this.guardValue(left.value);
    }

    return left;
  }

  private parseMultiplicative(): Evaluation {
    let left = this.parsePower();

    while (
      this.peek().type === "multiply" ||
      this.peek().type === "divide"
    ) {
      const operator = this.peek().type;
      this.position += 1;
      const right = this.parsePower();

      if (operator === "divide" && Math.abs(right.value) < 1e-12) {
        throw new Error("0으로 나누는 연산은 정의되지 않아요.");
      }

      left = {
        value:
          operator === "multiply"
            ? left.value * right.value
            : left.value / right.value,
        usedLiterals: [...left.usedLiterals, ...right.usedLiterals],
      };
      this.guardValue(left.value);
    }

    return left;
  }

  private parsePower(): Evaluation {
    const left = this.parseUnary();

    if (this.peek().type !== "power") {
      return left;
    }

    this.position += 1;
    const right = this.parsePower();

    const baseIsZero = Math.abs(left.value) < 1e-12;
    const exponentIsZero = Math.abs(right.value) < 1e-12;

    if (baseIsZero && exponentIsZero) {
      throw new Error("0^0은 정의되지 않은 연산이에요.");
    }

    if (baseIsZero && right.value < 0) {
      throw new Error("0의 음수 지수 거듭제곱은 정의되지 않은 연산이에요.");
    }

    const value = left.value ** right.value;
    if (Number.isNaN(value)) {
      throw new Error("현재 계산 방식으로 실수 결과를 구할 수 없는 거듭제곱이에요.");
    }
    this.guardValue(value);

    return {
      value,
      usedLiterals: [...left.usedLiterals, ...right.usedLiterals],
    };
  }

  private parseUnary(): Evaluation {
    if (this.peek().type === "minus") {
      this.position += 1;
      const result = this.parseUnary();
      return { value: -result.value, usedLiterals: result.usedLiterals };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): Evaluation {
    const token = this.peek();

    if (token.type === "number") {
      this.position += 1;
      return {
        value: token.value ?? 0,
        usedLiterals: [token.text],
      };
    }

    if (token.type === "leftParen") {
      this.position += 1;
      const result = this.parseAdditive();
      this.consume("rightParen");
      return result;
    }

    throw new Error(
      token.type === "end"
        ? "식이 아직 완성되지 않았어요."
        : "숫자나 괄호의 위치를 다시 확인해 주세요.",
    );
  }

  private guardValue(value: number) {
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) {
      throw new Error("계산 결과가 너무 커요. 조금 더 작은 수로 시도해 주세요.");
    }
  }
}

function evaluateExpression(source: string): Evaluation {
  if (!source.trim()) {
    throw new Error("먼저 식을 만들어 주세요.");
  }

  return new ExpressionParser(tokenize(source)).parse();
}

function findCardAllocation(
  cards: number[],
  literals: string[],
  requireEveryCard: boolean,
): number[] | null {
  const allCardsMask = (1 << cards.length) - 1;

  function search(
    literalIndex: number,
    position: number,
    usedMask: number,
    usedIndexes: number[],
  ): number[] | null {
    if (literalIndex >= literals.length) {
      return !requireEveryCard || usedMask === allCardsMask
        ? usedIndexes
        : null;
    }

    const literal = literals[literalIndex];

    if (position >= literal.length) {
      return search(literalIndex + 1, 0, usedMask, usedIndexes);
    }

    const candidateIndexes = cards
      .map((card, index) => ({ card, index, text: String(card) }))
      .filter(
        ({ index, text }) =>
          (usedMask & (1 << index)) === 0 &&
          literal.startsWith(text, position),
      )
      .sort((left, right) => right.text.length - left.text.length);

    for (const candidate of candidateIndexes) {
      const result = search(
        literalIndex,
        position + candidate.text.length,
        usedMask | (1 << candidate.index),
        [...usedIndexes, candidate.index],
      );

      if (result) {
        return result;
      }
    }

    return null;
  }

  return search(0, 0, 0, []);
}

function compareCards(cards: number[], literals: string[]): string | null {
  if (findCardAllocation(cards, literals, true)) {
    return null;
  }

  const partialAllocation = findCardAllocation(cards, literals, false);

  if (!partialAllocation) {
    return "카드에 없는 수를 썼거나 같은 카드를 두 번 사용했어요. 원본 카드끼리 붙이는 것만 가능합니다.";
  }

  const usedIndexes = new Set(partialAllocation);
  const missingCards = cards.filter((_, index) => !usedIndexes.has(index));

  return `아직 ${missingCards.join(", ")} 카드가 남아 있어요. 네 장을 모두 써 주세요.`;
}

function getNumberLiterals(source: string): string[] {
  try {
    return tokenize(source)
      .filter((token) => token.type === "number")
      .map((token) => token.text);
  } catch {
    return [];
  }
}

function getUsedCardIndexes(source: string, cards: number[]): number[] {
  return findCardAllocation(cards, getNumberLiterals(source), false) ?? [];
}

function readRecentKeys(mode: NumberMode): string[] {
  try {
    const value = localStorage.getItem(`seventeen:recent:${mode}`);
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecentKeys(mode: NumberMode, keys: string[]) {
  try {
    localStorage.setItem(
      `seventeen:recent:${mode}`,
      JSON.stringify(keys.slice(-RECENT_LIMIT)),
    );
  } catch {
    // 기록 저장이 막혀도 게임 진행에는 영향이 없습니다.
  }
}

function formatResult(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return Number(value.toFixed(4)).toString();
}

export default function SeventeenGame() {
  const [challenge, setChallenge] = useState<GeneratedChallenge | null>(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const [numberMode, setNumberMode] = useState<NumberMode>("single");
  const [difficultyPreference, setDifficultyPreference] =
    useState<DifficultyPreference>("mixed");
  const [isGenerating, setIsGenerating] = useState(true);
  const [expression, setExpression] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({
    kind: "idle",
    message: "카드를 누르거나 직접 식을 입력해 보세요.",
  });
  const [streak, setStreak] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const usedCardIndexes = useMemo(
    () =>
      challenge
        ? getUsedCardIndexes(expression, challenge.cards)
        : [],
    [challenge, expression],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const recentKeys = readRecentKeys("single");
      const nextChallenge = generateChallenge("single", recentKeys);
      setChallenge(nextChallenge);
      writeRecentKeys("single", [...recentKeys, nextChallenge.key]);
      setIsGenerating(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function resetRound(nextChallenge: GeneratedChallenge) {
    setChallenge(nextChallenge);
    setExpression("");
    setFeedback({
      kind: "idle",
      message: "새 카드가 도착했어요. 이번에도 17을 만들어 보세요.",
    });
    setShowHint(false);
    setIsGenerating(false);
  }

  function dealNewCards(
    mode: NumberMode,
    incrementRound = true,
    difficulty: DifficultyPreference = difficultyPreference,
  ) {
    setIsGenerating(true);

    window.setTimeout(() => {
      const recentKeys = readRecentKeys(mode);
      const nextChallenge = generateChallenge(
        mode,
        recentKeys,
        difficulty === "mixed" ? undefined : difficulty,
      );
      writeRecentKeys(mode, [...recentKeys, nextChallenge.key]);
      resetRound(nextChallenge);

      if (incrementRound) {
        setRoundNumber((current) => current + 1);
      }

      requestAnimationFrame(() => inputRef.current?.focus());
    }, 0);
  }

  function changeNumberMode(mode: NumberMode) {
    if (mode === numberMode || isGenerating) {
      return;
    }

    setNumberMode(mode);
    dealNewCards(mode);
  }

  function changeDifficulty(difficulty: DifficultyPreference) {
    if (difficulty === difficultyPreference || isGenerating) {
      return;
    }

    setDifficultyPreference(difficulty);
    dealNewCards(numberMode, true, difficulty);
  }

  function insertAtCursor(value: string) {
    if (feedback.kind === "correct") {
      return;
    }

    const input = inputRef.current;
    const selectionStart = input?.selectionStart ?? expression.length;
    const selectionEnd = input?.selectionEnd ?? expression.length;
    const nextExpression =
      expression.slice(0, selectionStart) +
      value +
      expression.slice(selectionEnd);

    setExpression(nextExpression);
    setFeedback({
      kind: "idle",
      message: "좋아요. 계산 결과가 17인지 확인해 볼까요?",
    });

    requestAnimationFrame(() => {
      const nextPosition = selectionStart + value.length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextPosition, nextPosition);
    });
  }

  function submit() {
    if (!challenge || isGenerating) {
      return;
    }

    try {
      const result = evaluateExpression(expression);
      const cardError = compareCards(challenge.cards, result.usedLiterals);

      if (cardError) {
        setFeedback({ kind: "error", message: cardError });
        return;
      }

      if (Math.abs(result.value - TARGET) < 1e-9) {
        const nextStreak = streak + 1;
        const nextSolved = solvedCount + 1;
        setStreak(nextStreak);
        setSolvedCount(nextSolved);
        setFeedback({
          kind: "correct",
          message: "정확해요! 네 장의 카드로 17을 만들었습니다.",
        });
        return;
      }

      setFeedback({
        kind: "near",
        value: result.value,
        message:
          result.value < TARGET
            ? `${formatResult(result.value)}까지 왔어요. 조금 더 크게 만들어 보세요.`
            : `${formatResult(result.value)}이 나왔어요. 조금만 줄여 볼까요?`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "식을 계산하지 못했어요. 다시 확인해 주세요.",
      });
    }
  }

  function clearExpression() {
    setExpression("");
    setFeedback({
      kind: "idle",
      message: "새 식을 시작해 보세요.",
    });
    inputRef.current?.focus();
  }

  function removeLastCharacter() {
    if (feedback.kind === "correct") {
      return;
    }

    setExpression((current) => current.trimEnd().slice(0, -1).trimEnd());
    setFeedback({
      kind: "idle",
      message: "한 칸 지웠어요.",
    });
    inputRef.current?.focus();
  }

  function nextChallenge() {
    dealNewCards(numberMode);
  }

  function revealSolution() {
    if (!challenge) {
      return;
    }

    setExpression(challenge.solution);
    setStreak(0);
    setFeedback({
      kind: "correct",
      message: "이렇게 만들 수 있어요. 다음에는 직접 풀어 보세요!",
    });
    setShowHint(true);
  }

  function isCardUsed(cardIndex: number): boolean {
    return usedCardIndexes.includes(cardIndex);
  }

  if (!challenge) {
    return (
      <main className={styles.gamePage} lang="ko">
        <div className={styles.loadingState} role="status">
          <span className={styles.loadingNumber}>17</span>
          <p>풀 수 있는 카드를 섞는 중…</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.gamePage} lang="ko">
      <header className={styles.siteHeader}>
        <Link href="/" className={styles.brand} aria-label="minguu.dev 홈">
          <span className={styles.brandMark}>17</span>
          <span>minguu.dev</span>
        </Link>

        <div className={styles.headerActions}>
          <Link href="/17/custom" className={styles.customLink}>
            커스텀 문제
          </Link>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setShowRules((current) => !current)}
            aria-expanded={showRules}
          >
            게임 방법
          </button>
          <Link href="/" className={styles.homeLink}>
            홈으로
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            숫자 퍼즐 · SEVENTEEN
          </div>
          <h1>
            네 장으로,
            <br />
            딱 <span>17</span> 만들기
          </h1>
          <p>
            사칙연산만으로 부족할 땐 원본 카드를 붙이고, 제곱하고,
            계산 순서를 바꿔 보세요. 답은 언제나 17입니다.
          </p>
        </div>

        <div className={styles.stats} aria-label="게임 기록">
          <div>
            <span>연속 성공</span>
            <strong>{streak}</strong>
          </div>
          <div>
            <span>푼 문제</span>
            <strong>{solvedCount}</strong>
          </div>
        </div>
      </section>

      {showRules && (
        <section className={styles.rulesDrawer}>
          <div>
            <span className={styles.ruleNumber}>01</span>
            <p>
              <strong>네 장을 모두</strong>
              각각 한 번씩 사용합니다.
            </p>
          </div>
          <div>
            <span className={styles.ruleNumber}>02</span>
            <p>
              <strong>원본 카드는 붙여도 OK</strong>
              1과 7 카드가 있다면 17로 사용할 수 있어요.
            </p>
          </div>
          <div>
            <span className={styles.ruleNumber}>03</span>
            <p>
              <strong>계산 결과는 붙일 수 없음</strong>
              (8 ÷ 8)과 7을 붙여 17로 만드는 것은 불가능해요.
            </p>
          </div>
        </section>
      )}

      <div className={styles.gameLayout}>
        <section className={styles.board}>
          <div className={styles.boardTop}>
            <div>
              <span className={styles.roundLabel}>
                PUZZLE {String(roundNumber).padStart(2, "0")}
              </span>
              <span
                className={`${styles.difficulty} ${
                  challenge.difficulty === "도전" ? styles.difficultyHard : ""
                }`}
              >
                {challenge.difficulty}
              </span>
            </div>
            <div className={styles.boardControls}>
              <label className={styles.difficultyPicker}>
                <span>난이도</span>
                <select
                  value={difficultyPreference}
                  onChange={(event) =>
                    changeDifficulty(
                      event.target.value as DifficultyPreference,
                    )
                  }
                  disabled={isGenerating}
                >
                  <option value="mixed">랜덤</option>
                  <option value="입문">입문</option>
                  <option value="보통">보통</option>
                  <option value="도전">도전</option>
                </select>
              </label>
              <label className={styles.modeSwitch}>
                <input
                  type="checkbox"
                  checked={numberMode === "large"}
                  aria-label="10 이상의 큰 수 포함"
                  onChange={(event) =>
                    changeNumberMode(
                      event.target.checked ? "large" : "single",
                    )
                  }
                  disabled={isGenerating}
                />
                <span className={styles.switchTrack} aria-hidden="true">
                  <span />
                </span>
                <span className={styles.switchLabel}>10+ 카드</span>
              </label>
              <span className={styles.target}>
                TARGET <strong>17</strong>
              </span>
            </div>
          </div>

          <div className={styles.cardArea}>
            <p className={styles.sectionLabel}>YOUR CARDS</p>
            <div className={styles.numberCards}>
              {challenge.cards.map((card, index) => {
                const used = isCardUsed(index);
                const isLargeCard = String(card).length > 1;

                return (
                  <button
                    type="button"
                    key={`${challenge.key}-${card}-${index}`}
                    className={`${styles.numberCard} ${
                      used ? styles.numberCardUsed : ""
                    } ${isLargeCard ? styles.numberCardLarge : ""}`}
                    onClick={() => insertAtCursor(String(card))}
                    disabled={
                      feedback.kind === "correct" || isGenerating
                    }
                    aria-pressed={used}
                    aria-label={`${card} 카드${used ? ", 식에 사용됨" : ""}`}
                  >
                    <span className={styles.cardIndex}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <strong>{card}</strong>
                    <span className={styles.cardCorner}>✦</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.expressionArea}>
            <div className={styles.expressionHeader}>
              <label htmlFor="seventeen-expression">YOUR FORMULA</label>
              <div>
                <button
                  type="button"
                  onClick={removeLastCharacter}
                  disabled={feedback.kind === "correct" || isGenerating}
                >
                  한 칸 지우기
                </button>
                <button
                  type="button"
                  onClick={clearExpression}
                  disabled={feedback.kind === "correct" || isGenerating}
                >
                  모두 지우기
                </button>
              </div>
            </div>

            <div
              className={`${styles.inputShell} ${
                feedback.kind === "correct" ? styles.inputCorrect : ""
              } ${feedback.kind === "error" ? styles.inputError : ""}`}
            >
              <input
                ref={inputRef}
                id="seventeen-expression"
                value={expression}
                onChange={(event) => {
                  if (feedback.kind !== "correct") {
                    setExpression(event.target.value);
                    setFeedback({
                      kind: "idle",
                      message: "식을 계산할 준비가 되면 확인을 눌러 주세요.",
                    });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.repeat) {
                    event.preventDefault();

                    if (feedback.kind === "correct") {
                      nextChallenge();
                    } else {
                      submit();
                    }
                  }
                }}
                placeholder="예: 1 × 17"
                autoComplete="off"
                spellCheck={false}
                readOnly={feedback.kind === "correct" || isGenerating}
                aria-invalid={feedback.kind === "error"}
                aria-describedby="seventeen-feedback"
              />
              <span>= ?</span>
            </div>

            <div className={styles.operatorGrid}>
              {BINARY_OPERATORS.map((operator) => (
                <button
                  type="button"
                  key={operator.label}
                  onClick={() => insertAtCursor(operator.insert)}
                  aria-label={operator.ariaLabel}
                  title={operator.ariaLabel}
                  disabled={feedback.kind === "correct" || isGenerating}
                >
                  {operator.label}
                </button>
              ))}
              {EXTRA_OPERATORS.map((operator) => (
                <button
                  type="button"
                  key={operator.label}
                  onClick={() => insertAtCursor(operator.insert)}
                  aria-label={operator.ariaLabel}
                  title={operator.ariaLabel}
                  disabled={feedback.kind === "correct" || isGenerating}
                >
                  {operator.label}
                </button>
              ))}
            </div>

            <div
              className={`${styles.feedback} ${styles[feedback.kind]}`}
              id="seventeen-feedback"
              role="status"
              aria-live="polite"
            >
              <span className={styles.feedbackIcon}>
                {feedback.kind === "correct"
                  ? "✓"
                  : feedback.kind === "error"
                    ? "!"
                    : feedback.kind === "near"
                      ? formatResult(feedback.value)
                      : "17"}
              </span>
              <p>{feedback.message}</p>
            </div>

            {feedback.kind === "correct" ? (
              <button
                type="button"
                className={styles.submitButton}
                onClick={nextChallenge}
              >
                다음 퍼즐
                <span aria-hidden="true">↵</span>
              </button>
            ) : (
              <button
                type="button"
                className={styles.submitButton}
                onClick={submit}
                disabled={isGenerating}
              >
                {isGenerating ? "풀 수 있는 카드 찾는 중…" : "17인지 확인"}
                <span aria-hidden="true">↵</span>
              </button>
            )}
          </div>
        </section>

        <aside className={styles.sidePanel}>
          <section className={styles.sideCard}>
            <div className={styles.sideCardHeader}>
              <span>힌트</span>
              <span className={styles.sparkle}>✦</span>
            </div>
            {showHint ? (
              <p className={styles.hintText}>{challenge.hint}</p>
            ) : (
              <p>막혔다면 작은 단서 하나를 열어 보세요.</p>
            )}
            <button
              type="button"
              className={styles.sideButton}
              onClick={() => setShowHint(true)}
              disabled={showHint || isGenerating}
            >
              {showHint ? "힌트 확인 완료" : "힌트 보기"}
            </button>
          </section>

          <section className={styles.sideCard}>
            <div className={styles.sideCardHeader}>
              <span>사용 가능한 연산</span>
              <span className={styles.miniBadge}>CHEAT SHEET</span>
            </div>
            <dl className={styles.operationList}>
              <div>
                <dt>+ −</dt>
                <dd>더하기와 빼기</dd>
              </div>
              <div>
                <dt>× ÷</dt>
                <dd>곱하기와 나누기</dd>
              </div>
              <div>
                <dt>^</dt>
                <dd>거듭제곱 · 2 ^ 4 = 16</dd>
              </div>
              <div>
                <dt>17</dt>
                <dd>원본 카드끼리 바로 붙이기</dd>
              </div>
            </dl>
          </section>

          <button
            type="button"
            className={styles.solutionButton}
            onClick={revealSolution}
            disabled={isGenerating}
          >
            정답이 궁금해요
          </button>

          <button
            type="button"
            className={styles.skipButton}
            onClick={nextChallenge}
            disabled={isGenerating}
          >
            이 문제 건너뛰기
            <span aria-hidden="true">→</span>
          </button>

          <p className={styles.sideNote}>
            정답을 보면 연속 성공 기록이 초기화됩니다.
          </p>
        </aside>
      </div>

      <footer className={styles.footer}>
        <span>17 MAKER</span>
        <p>작은 숫자에서 시작하는 큰 발상.</p>
        <span>© minguu.dev</span>
      </footer>
    </main>
  );
}
