import type {Metadata} from "next";

export const metadata: Metadata = {
    title: "SimpleQuiz",
    description: "간단한 퀴즈 사이트",
};


export default function QuizLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}