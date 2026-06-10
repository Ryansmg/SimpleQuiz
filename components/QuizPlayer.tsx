"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Problem, ProblemSet, QuizInfo, QuizResult } from "@/types/quiz";

type Props = {
    quiz: QuizInfo;
    problemSet: ProblemSet;
};

type Phase = "answering" | "feedback";

type Feedback = {
    correct: boolean;
    userAnswerText: string;
    correctAnswerText: string;
    commentary?: string;
};

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;

    if (m === 0) return `${s}초`;
    return `${m}분 ${String(s).padStart(2, "0")}초`;
}

function calculateProblemScore(
    quiz: QuizInfo,
    elapsedSeconds: number,
    combo: number
): number {
    const timeScore =
        quiz.maxScore * ((quiz.inputTime - elapsedSeconds) / quiz.inputTime);

    const baseScore = Math.max(timeScore, quiz.minScore);

    const comboBonus =
        Math.floor(combo / quiz.comboBonusCnt) * quiz.comboBonusScore;

    return Math.floor(baseScore + comboBonus);
}

function normalizeFillAnswer(
    problem: Extract<Problem, { type: "fill" }>,
    value: string
): string {
    let result = value.trim();

    if (problem.ignoreWhitespace) {
        result = result.replace(/\s+/g, "");
    }

    if (problem.ignoreCase) {
        result = result.toLowerCase();
    }

    return result;
}

function judgeAnswer(problem: Problem, input: string | number): boolean {
    if (problem.type === "choice") {
        return input === problem.answer;
    }

    const userAnswer = normalizeFillAnswer(problem, String(input));
    const correctAnswer = normalizeFillAnswer(problem, problem.answer);

    return userAnswer === correctAnswer;
}

function getCorrectAnswerText(problem: Problem): string {
    if (problem.type === "choice") {
        return `${problem.answer + 1}. ${problem.choices[problem.answer]}`;
    }

    return problem.answer;
}

function getUserAnswerText(problem: Problem, input: string | number): string {
    if (problem.type === "choice") {
        const index = Number(input);

        if (!Number.isInteger(index) || index < 0 || index >= problem.choices.length) {
            return String(input);
        }

        return `${index + 1}. ${problem.choices[index]}`;
    }

    return String(input);
}

export default function QuizPlayer({ quiz, problemSet }: Props) {
    const router = useRouter();

    const problems = useMemo(() => {
        return problemSet.problems.slice(0, quiz.length);
    }, [problemSet.problems, quiz.length]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [totalTime, setTotalTime] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [maxCombo, setMaxCombo] = useState(0);
    const [input, setInput] = useState("");

    const [phase, setPhase] = useState<Phase>("answering");
    const [feedback, setFeedback] = useState<Feedback | null>(null);

    const [correctCount, setCorrectCount] = useState(0);
    const [wrongCount, setWrongCount] = useState(0);
    const [expectedScoreDiff, setExpectedScoreDiff] = useState(
        calculateProblemScore(quiz, 0, combo + 1)
    );

    const currentProblem = problems[currentIndex];

    function finishQuiz(
        finalScore: number,
        finalCorrectCount: number,
        finalWrongCount: number,
        finalCombo: number
    ) {
        const result: QuizResult = {
            quizId: quiz.id,
            score: finalScore,
            totalTime,
            problemCount: problems.length,
            correctCount: finalCorrectCount,
            wrongCount: finalWrongCount,
            finalCombo,
        };

        sessionStorage.setItem(`quiz-result:${quiz.id}`, JSON.stringify(result));
        router.push(`/quiz/${quiz.id}/result`);
    }

    function goNext() {
        if (currentIndex + 1 >= problems.length) {
            finishQuiz(score, correctCount, wrongCount, combo);
            return;
        }

        setInput("");
        setFeedback(null);
        setCurrentTime(0);
        setPhase("answering");
        setCurrentIndex((prev) => prev + 1);
        setExpectedScoreDiff(
            calculateProblemScore(quiz, 0, combo + 1)
        )
    }

    function showFeedback(rawInput: string | number) {
        if (!currentProblem) return;

        const correct = judgeAnswer(currentProblem, rawInput);

        let nextScore: number;
        let nextCombo: number;
        let nextCorrectCount = correctCount;
        let nextWrongCount = wrongCount;

        if (correct) {
            nextCombo = combo + 1;

            const gainedScore = calculateProblemScore(
                quiz,
                currentTime,
                nextCombo
            );

            nextScore = score + gainedScore;
            nextCorrectCount = correctCount + 1;
        } else {
            nextCombo = 0;
            nextScore = score + quiz.penalty;
            nextWrongCount = wrongCount + 1;
        }

        setScore(nextScore);
        setCombo(nextCombo);
        setMaxCombo(Math.max(maxCombo, nextCombo));
        setCorrectCount(nextCorrectCount);
        setWrongCount(nextWrongCount);

        setFeedback({
            correct,
            userAnswerText: getUserAnswerText(currentProblem, rawInput),
            correctAnswerText: getCorrectAnswerText(currentProblem),
            commentary: currentProblem.commentary,
        });

        setPhase("feedback");
    }

    function submitChoiceAnswer(choiceIndex: number) {
        if (!currentProblem || currentProblem.type !== "choice") return;
        if (phase !== "answering") return;

        showFeedback(choiceIndex);
    }

    function submitInputAnswer() {
        if (!currentProblem) return;

        if (phase === "feedback") {
            goNext();
            return;
        }

        if (currentProblem.type === "choice") {
            const trimmed = input.trim();
            // if (trimmed === "") return;

            const selectedNumber = Number(trimmed);

            if (!Number.isInteger(selectedNumber)) {
                showFeedback(trimmed);
                return;
            }

            const selectedIndex = selectedNumber - 1;
            showFeedback(selectedIndex);
            return;
        }

        // if (input.trim() === "") return;
        showFeedback(input);
    }

    useEffect(() => {
        if (phase !== "answering") {
            return;
        }

        const timer = setInterval(() => {
            const scoreToGain = calculateProblemScore(
                quiz,
                currentTime + 1,
                combo + 1
            );
            setTotalTime((prev) => prev + 1);
            setCurrentTime((prev) => prev + 1);
            setExpectedScoreDiff(scoreToGain);
        }, 1000);

        return () => clearInterval(timer);
    }, [phase, quiz, currentTime, combo]);

    if (!currentProblem) {
        return null;
    }

    const progress = ((currentIndex + 1) / problems.length) * 100;

    return (
        <>
            <header className="quizTopBar">
                <div className="quizTopBarInfo">
                    <div>
                        전체 시간{" "}
                        <span className="quizTopBarStrong">{formatTime(totalTime)}</span>
                    </div>

                    <div>
                        현재 시간{" "}
                        <span className="quizTopBarStrong">{formatTime(currentTime)}</span>
                    </div>

                    <div>
                        점수 <span className="quizTopBarStrong">{score}
                        {phase === "answering" ? ` (+${expectedScoreDiff})` : null}</span>
                    </div>

                    <div>
                        Combo{" "}
                        <span className="quizTopBarStrong">{combo}</span>
                    </div>

                    <div>
                        Max Combo{" "}
                        <span className="quizTopBarStrong">{maxCombo}</span>
                    </div>
                </div>

                <div className="mobileTopBarInfo">
                    <div>
                        전체{" "}
                        <span className="quizTopBarStrong">{formatTime(totalTime)}</span>
                    </div>

                    <div>
                        현재{" "}
                        <span className="quizTopBarStrong">{formatTime(currentTime)}</span>
                    </div>

                    <div>
                        점수 <span className="quizTopBarStrong">{score}
                        {phase === "answering" ? ` (+${expectedScoreDiff})` : null}</span>
                    </div>

                </div>

                <div className="progressBar">
                    <div className="progressFill" style={{ width: `${progress}%` }} />
                    <div className="progressText">
                        {currentIndex + 1} / {problems.length}
                    </div>
                </div>
            </header>

            <main className="quizMain">
                <section className="card questionPanel">
                    <div className="questionNumber">문제 {currentIndex + 1}</div>

                    <p className="questionText">{currentProblem.legend}</p>

                    {currentProblem.type === "choice" && (
                        <div className="stack">
                            {currentProblem.choices.map((choice, index) => (
                                <button
                                    key={`${currentIndex}-${index}`}
                                    className="choiceButton"
                                    onClick={() => submitChoiceAnswer(index)}
                                    disabled={phase === "feedback"}
                                >
                                    <span className="choiceNumber">{index + 1}.</span>
                                    <span>{choice}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {phase === "feedback" && feedback && (
                        <section
                            className={
                                feedback.correct
                                    ? "feedbackBox feedbackAccepted"
                                    : "feedbackBox feedbackWrong"
                            }
                        >
                            <h2>{feedback.correct ? "Accepted" : "Wrong Answer"}</h2>

                            <p>
                                <strong>답변:</strong> {feedback.userAnswerText}
                            </p>

                            <p>
                                <strong>정답:</strong> {feedback.correctAnswerText}
                            </p>

                            {feedback.commentary && (
                                <p className="feedbackCommentary">
                                    <strong>해설:</strong> {feedback.commentary}
                                </p>
                            )}
                        </section>
                    )}

                    <div className="answerRow">
                        <input
                            className={`answerInput${(currentProblem.type === "choice" || phase === "feedback") ? " hideOnMobile" : ""}`}
                            value={input}
                            readOnly={phase === "feedback"}
                            onChange={(e) => {
                                if (phase === "answering") {
                                    setInput(e.target.value);
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                if (e.repeat) return;

                                submitInputAnswer();
                            }}
                            placeholder={
                                currentProblem.type === "choice"
                                    ? "답안 번호를 입력하세요"
                                    : "정답을 입력하세요"
                            }
                        />

                        <button className={`button${currentProblem.type === "choice" && phase === "answering" ? " hideOnMobile" : ""}`}
                                onClick={submitInputAnswer}>
                            {phase === "answering" ? "제출" : "다음"}
                        </button>
                    </div>
                </section>
            </main>
        </>
    );
}