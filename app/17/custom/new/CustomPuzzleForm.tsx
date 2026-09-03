"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import {
  checkSeventeenExpression,
  normalizePuzzleCards,
  PUZZLE_DIFFICULTIES,
  type PuzzleDifficulty,
} from "@/lib/seventeen-expression";
import styles from "../custom.module.css";

const OPERATORS = [
  { label: "+", value: " + ", ariaLabel: "더하기" },
  { label: "−", value: " − ", ariaLabel: "빼기" },
  { label: "×", value: " × ", ariaLabel: "곱하기" },
  { label: "÷", value: " ÷ ", ariaLabel: "나누기" },
  { label: "^", value: " ^ ", ariaLabel: "거듭제곱" },
  { label: "(", value: "(", ariaLabel: "왼쪽 괄호" },
  { label: ")", value: ")", ariaLabel: "오른쪽 괄호" },
];

type Feedback = {
  kind: "idle" | "error" | "success";
  message: string;
};

export default function CustomPuzzleForm() {
  const router = useRouter();
  const answerRef = useRef<HTMLInputElement>(null);
  const [cards, setCards] = useState(["", "", "", ""]);
  const [nickname, setNickname] = useState("");
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>("보통");
  const [solution, setSolution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({
    kind: "idle",
    message: "답안은 공개되지 않으며, 문제 등록을 검증하는 데만 사용됩니다.",
  });

  function updateCard(index: number, value: string) {
    setCards((current) =>
      current.map((card, cardIndex) => (cardIndex === index ? value : card)),
    );
  }

  function updateNickname(value: string) {
    if (Array.from(value).length <= 20) setNickname(value);
  }

  function insertOperator(value: string) {
    const input = answerRef.current;
    const start = input?.selectionStart ?? solution.length;
    const end = input?.selectionEnd ?? start;
    const next = solution.slice(0, start) + value + solution.slice(end);
    setSolution(next);

    window.requestAnimationFrame(() => {
      input?.focus();
      const position = start + value.length;
      input?.setSelectionRange(position, position);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    let normalizedCards: string[];
    try {
      normalizedCards = normalizePuzzleCards(cards);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "카드를 확인해 주세요.",
      });
      return;
    }

    if (!nickname.trim()) {
      setFeedback({ kind: "error", message: "닉네임을 입력해 주세요." });
      return;
    }

    const check = checkSeventeenExpression(normalizedCards, solution);
    if (!check.ok) {
      setFeedback({ kind: "error", message: check.message });
      return;
    }

    setIsSubmitting(true);
    setFeedback({ kind: "idle", message: "서버에서 답안을 한 번 더 확인하고 있어요…" });

    try {
      const response = await fetch("/api/17/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: normalizedCards,
          nickname: nickname.trim(),
          difficulty,
          solution: solution.trim(),
        }),
      });
      const data = (await response.json()) as { id?: string; error?: string };

      if (!response.ok || !data.id) {
        throw new Error(data.error || "문제를 저장하지 못했어요.");
      }

      setFeedback({ kind: "success", message: "문제를 올렸어요. 풀이 화면으로 이동합니다." });
      router.push(`/17/custom/${data.id}?created=1`);
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "문제를 저장하지 못했어요. 다시 시도해 주세요.",
      });
      setIsSubmitting(false);
    }
  }

  const feedbackClass =
    feedback.kind === "error"
      ? styles.feedbackError
      : feedback.kind === "success"
        ? styles.feedbackSuccess
        : "";

  return (
    <form className={styles.formPanel} onSubmit={handleSubmit} noValidate>
      <div className={styles.panelTop}>
        <h2>문제 정보</h2>
        <span className={styles.panelKicker}>ALL FIELDS REQUIRED</span>
      </div>

      <div className={styles.formBody}>
        <div className={styles.fieldGroup}>
          <p className={styles.groupLabel}>FOUR NUMBER CARDS</p>
          <div className={styles.cardInputs}>
            {cards.map((card, index) => (
              <label className={styles.cardInputShell} key={index}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  spellCheck={false}
                  value={card}
                  onChange={(event) => updateCard(index, event.target.value)}
                  placeholder="0"
                  aria-label={`숫자 카드 ${index + 1}`}
                  disabled={isSubmitting}
                />
              </label>
            ))}
          </div>
        </div>

        <div className={`${styles.fieldGroup} ${styles.twoColumns}`}>
          <div>
            <label className={styles.fieldLabel} htmlFor="nickname">NICKNAME</label>
            <input
              className={styles.textInput}
              id="nickname"
              value={nickname}
              onChange={(event) => updateNickname(event.target.value)}
              placeholder="만든 사람 이름"
              autoComplete="nickname"
              disabled={isSubmitting}
              aria-describedby="nickname-count"
            />
            <span className={styles.charCount} id="nickname-count">
              {Array.from(nickname).length} / 20
            </span>
          </div>

          <fieldset>
            <legend className={styles.fieldLabel}>DIFFICULTY</legend>
            <div className={styles.difficultyOptions}>
              {PUZZLE_DIFFICULTIES.map((option) => (
                <label className={styles.difficultyOption} key={option}>
                  <input
                    type="radio"
                    name="difficulty"
                    value={option}
                    checked={difficulty === option}
                    onChange={() => setDifficulty(option)}
                    disabled={isSubmitting}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.answerHeader}>
            <label htmlFor="solution">YOUR ANSWER</label>
            <span>결과가 정확히 17이어야 합니다</span>
          </div>
          <input
            ref={answerRef}
            className={styles.answerInput}
            id="solution"
            value={solution}
            onChange={(event) => setSolution(event.target.value)}
            placeholder="예: 1 × 17"
            autoComplete="off"
            spellCheck={false}
            disabled={isSubmitting}
          />
          <div className={styles.operatorGrid} aria-label="연산자 입력">
            {OPERATORS.map((operator) => (
              <button
                type="button"
                key={operator.label}
                onClick={() => insertOperator(operator.value)}
                aria-label={operator.ariaLabel}
                disabled={isSubmitting}
              >
                {operator.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`${styles.feedback} ${feedbackClass}`}
          role={feedback.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <span className={styles.feedbackIcon} aria-hidden="true">
            {feedback.kind === "error" ? "!" : feedback.kind === "success" ? "✓" : "i"}
          </span>
          <p>{feedback.message}</p>
        </div>

        <button className={styles.submitButton} type="submit" disabled={isSubmitting}>
          {isSubmitting ? "검증하고 저장하는 중…" : "이 문제 올리기"}
          <span aria-hidden="true">→</span>
        </button>

        <div className={styles.formActions}>
          <Link href="/17/custom" className={styles.headerLinkQuiet}>
            취소하고 목록으로
          </Link>
        </div>
      </div>
    </form>
  );
}