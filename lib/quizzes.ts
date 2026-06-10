
import stage1_42 from "@/data/quizzes/42stage1.json";
import stage2_42 from "@/data/quizzes/42stage2.json";
import stage3_42 from "@/data/quizzes/42stage3.json";
import stage4_42 from "@/data/quizzes/42stage4.json";
import stage5_42 from "@/data/quizzes/42stage5.json";
import type { QuizInfo } from "@/types/quiz";

export const quizzes = [
    stage1_42,
    stage2_42,
    stage3_42,
    stage4_42,
    stage5_42
] satisfies QuizInfo[];
