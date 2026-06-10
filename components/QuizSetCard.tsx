import Link from "next/link";
import type { QuizInfo } from "@/types/quiz";

type Props = {
    quiz: QuizInfo;
};

export default function QuizSetCard({quiz} : Props) {
  return (
      <Link href={`/quiz/${quiz.id}/start`} className="card">
          <h3 className="cardTitle">{quiz.name}</h3>
          <p className="cardDescription">{quiz.description}</p>

          <div className="resultMeta">
              <span className="badge">{quiz.length}문제</span>
          </div>
      </Link>
  )
}
