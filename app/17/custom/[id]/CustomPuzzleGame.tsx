"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { checkSeventeenExpression } from "@/lib/seventeen-expression";
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

export default function CustomPuzzleGame({
  cards,
  created,
}: {
  cards: string[];
  created: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expression, setExpression] = useState("");
  const [solved, setSolved] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({
    kind: created ? "success" : "idle",
    message: created
      ? "문제가 등록됐어요. 이 링크를 공유하거나 직접 다시 풀어 보세요."
      : "네 장의 카드를 모두 한 번씩 사용해 17을 만드세요.",
  });

  function insert(value: string) {
    if (solved) return;
    const input = inputRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? start;
    const next = expression.slice(0, start) + value + expression.slice(end);
    setExpression(next);

    window.requestAnimationFrame(() => {
      input?.focus();
      const position = start + value.length;
      input?.setSelectionRange(position, position);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (solved) return;

    const check = checkSeventeenExpression(cards, expression);
    if (!check.ok) {
      setFeedback({ kind: "error", message: check.message });
      return;
    }

    setSolved(true);
    setFeedback({ kind: "success", message: "정답입니다. 정확히 17을 만들었어요!" });
  }

  function reset() {
    setExpression("");
    setSolved(false);
    setFeedback({
      kind: "idle",
      message: "식을 비웠어요. 다른 방법으로 17을 만들어 보세요.",
    });
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  const feedbackClass =
    feedback.kind === "error"
      ? styles.feedbackError
      : feedback.kind === "success"
        ? styles.feedbackSuccess
        : "";

  return (
    <section className={styles.solvePanel} aria-labelledby="solve-title">
      <div className={styles.panelTop}>
        <h2 id="solve-title">숫자 카드</h2>
        <span className={styles.panelKicker}>TARGET 17</span>
      </div>

      <div className={styles.solveBody}>
        <div className={styles.numberCards}>
          {cards.map((card, index) => (
            <button
              type="button"
              className={styles.numberCard}
              key={`${card}-${index}`}
              onClick={() => insert(card)}
              disabled={solved}
              title={card}
              aria-label={`카드 ${index + 1}, ${card}`}
            >
              <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
              <strong>{card}</strong>
            </button>
          ))}
        </div>

        <form className={styles.solveExpression} onSubmit={handleSubmit}>
          <div className={styles.answerHeader}>
            <label htmlFor="custom-expression">YOUR EXPRESSION</label>
            <span>카드를 연달아 누르면 이어 붙일 수 있어요</span>
          </div>
          <input
            ref={inputRef}
            className={styles.answerInput}
            id="custom-expression"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            placeholder="여기에 식을 입력하세요"
            autoComplete="off"
            spellCheck={false}
            disabled={solved}
          />
          <div className={styles.operatorGrid} aria-label="연산자 입력">
            {OPERATORS.map((operator) => (
              <button
                type="button"
                key={operator.label}
                onClick={() => insert(operator.value)}
                aria-label={operator.ariaLabel}
                disabled={solved}
              >
                {operator.label}
              </button>
            ))}
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

          {!solved ? (
            <button className={styles.submitButton} type="submit">
              답 확인하기
              <span aria-hidden="true">↵</span>
            </button>
          ) : (
            <div className={styles.solvedBox}>
              <h2>문제 해결!</h2>
              <p>같은 카드로 다른 식을 찾거나, 다음 커스텀 문제에 도전해 보세요.</p>
              <div className={styles.solvedActions}>
                <button type="button" className={styles.secondaryLink} onClick={reset}>
                  다른 풀이 찾기
                </button>
                <Link href="/17/custom" className={styles.primaryLink}>
                  다른 문제 보기
                </Link>
              </div>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}