import { quizzes } from "@/lib/quizzes";
import { notFound } from "next/navigation";
import QuizResultView from "@/components/QuizResultView";

type Props = {
    params: Promise<{
        id: string;
    }>;
};

export default async function ResultPage({ params }: Props) {
    const { id } = await params;

    const quiz = quizzes.find((quiz) => quiz.id === id);
    if (!quiz) notFound();

    return <QuizResultView quiz={quiz} />;
}
