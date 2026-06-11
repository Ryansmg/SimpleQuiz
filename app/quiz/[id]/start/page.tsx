import { quizzes } from "@/lib/quizzes";
import {notFound} from "next/navigation";
import Link from "next/link";

type Props = {
    params: Promise<{
        id: string;
    }>;
};


export default async function StartQuiz({ params }: Props) {
    const { id } = await params;
    const quiz = quizzes.find((quiz) => quiz.id === id);

    if(!quiz) notFound();


    return (
        <main>
            <section className="card stack">
                <h1>{quiz.name}</h1>
                <div className="startMeta">
                    <span className="badge">{quiz.length}문제</span>
                </div>
                <p className="startDesc">{quiz.description}</p>
                <h4 style={{marginBottom: -5}}>안내</h4>
                <p>
                    문제를 맞히면 걸린 시간에 따라 {quiz.minScore}~{quiz.maxScore}점을 획득하고,
                    틀리면 {-quiz.penalty}점을 잃습니다.<br/>
                    객관식 문제의 경우 답안의 번호를, 주관식 문제의 경우 알맞은 답안을 입력하시면 됩니다.<br/>
                    그 후 Enter를 한 번 더 누르면 다음 문제로 넘어갑니다.
                </p>
                <div className="buttonRow">
                    <Link href={`/quiz/${id}`} className="button">
                        시작하기
                    </Link>

                    <Link href={`/quiz`} className="button buttonSecondary">
                        돌아가기
                    </Link>
                </div>
            </section>
        </main>
    )
}