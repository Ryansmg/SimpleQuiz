import { quizzes } from "@/lib/quizzes";
import { getProblemSet } from "@/lib/problems";
import { notFound } from "next/navigation";
import QuizPlayer from "@/components/QuizPlayer";

type Props = {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        wrong?: string;
    }>;
};

function parseWrongProblemIndexes(value?: string): number[] {
    if (!value) {
        return [];
    }

    return Array.from(
        new Set(
            value
                .split(",")
                .map((item) => Number(item))
                .filter((index) => Number.isInteger(index) && index >= 0)
        )
    );
}

export default async function QuizPage({ params, searchParams }: Props) {
    const { id } = await params;
    const { wrong } = await searchParams;

    const quiz = quizzes.find((quiz) => quiz.id === id);
    if (!quiz) notFound();

    const problemFile = await getProblemSet(id);
    if (!problemFile) notFound();

    const wrongProblemIndexes = parseWrongProblemIndexes(wrong);
    const wrongProblems = wrongProblemIndexes.flatMap((index) => {
        const problem = problemFile.problems[index];

        return problem ? [{ ...problem, originalIndex: index }] : [];
    });

    if (wrongProblemIndexes.length > 0 && wrongProblems.length === 0) {
        notFound();
    }

    const quizToPlay =
        wrongProblems.length > 0
            ? { ...quiz, length: wrongProblems.length }
            : quiz;
    const problemSetToPlay =
        wrongProblems.length > 0
            ? { ...problemFile, id: `${problemFile.id}:wrong`, problems: wrongProblems }
            : problemFile;

    return (
        <QuizPlayer
            quiz={quizToPlay}
            problemSet={problemSetToPlay}
            choiceSourceProblems={problemFile.problems}
        />
    );
}
