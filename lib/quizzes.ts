import testQuiz from "@/data/quizzes/test.json";
import autoChoiceTestQuiz from "@/data/quizzes/autoChoiceTest.json";
import type { QuizInfo } from "@/types/quiz";

export const quizzes = [
    testQuiz,
    autoChoiceTestQuiz,
] satisfies QuizInfo[];
