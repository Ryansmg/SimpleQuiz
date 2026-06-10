"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import type { QuizInfo, QuizResult } from "@/types/quiz";

type Props = {
    quiz: QuizInfo;
};

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;

    if (m === 0) return `${s}초`;
    return `${m}분 ${String(s).padStart(2, "0")}초`;
}

function readQuizResultRaw(quizId: string): string | null {
    if (typeof window === "undefined") {
        return null;
    }

    return sessionStorage.getItem(`quiz-result:${quizId}`);
}

function parseQuizResult(raw: string | null): QuizResult | null {
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as QuizResult;
    } catch {
        return null;
    }
}

export default function QuizResultView({ quiz }: Props) {
    const rawResult = useSyncExternalStore(
        () => {
            return () => {};
        },
        () => readQuizResultRaw(quiz.id),
        () => null
    );

    const result = useMemo(() => {
        return parseQuizResult(rawResult);
    }, [rawResult]);

    if (!result) {
        return (
            <main>
                <section className="card stack">
                    <div>
                        <h1>결과가 없습니다</h1>
                        <p>퀴즈를 먼저 풀어 주세요.</p>
                    </div>

                    <div className="buttonRow">
                        <Link href={`/quiz/${quiz.id}/start`} className="button">
                            퀴즈 시작하기
                        </Link>

                        <Link href="/" className="button buttonSecondary">
                            돌아가기
                        </Link>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main>
            <section className="card stack">
                <div>
                    <h1>{quiz.name} 결과</h1>
                </div>
                <div className="resultScore">{result.score}{""}점</div>

                <div className="resultMeta">
                    <span className="badge">{result.problemCount}문제</span>
                    <span className="badge feedbackAccepted">정답 {result.correctCount}</span>
                    <span className="badge feedbackWrong">오답 {result.wrongCount}</span>
                </div>

                <div className="resultMeta" style={{marginTop: -7, marginBottom: 10}}>
                  <span className="badge">
                    전체 시간 {formatTime(result.totalTime)}
                  </span>
                    <span className="badge">최종 콤보 {result.finalCombo}</span>
                </div>

                <div className="buttonRow">
                    <Link href="/" className="button">
                        메인으로 돌아가기
                    </Link>
                </div>
            </section>
        </main>
    );
}