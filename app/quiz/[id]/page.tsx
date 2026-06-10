import { quizzes } from "@/lib/quizzes";
import { getProblemSet } from "@/lib/problems";
import { notFound } from "next/navigation";
import QuizPlayer from "@/components/QuizPlayer";

type Props = {
    params: Promise<{
        id: string;
    }>;
};

export default async function QuizPage({ params }: Props) {
    const { id } = await params;

    const quiz = quizzes.find((quiz) => quiz.id === id);
    if (!quiz) notFound();

    const problemFile = await getProblemSet(id);
    if (!problemFile) notFound();

    return <QuizPlayer quiz={quiz} problemSet={problemFile} />;
}
