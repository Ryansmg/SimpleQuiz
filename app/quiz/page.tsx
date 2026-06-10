import { quizzes } from "@/lib/quizzes"
import QuizSetCard from "@/components/QuizSetCard";

export default function Home() {
  return (
      <main>
        <section className="card">
          <h2>문제 세트 선택</h2>
          {/*<p style={{marginBottom: 22}}>원하는 문제 세트를 선택하고, 제한 시간 안에 최대한 높은 점수를 얻어 보세요.</p>*/}

          <div className="grid">
            {quizzes.map((quiz, index) => (
                <QuizSetCard key={`${quiz.id}-${index}`} quiz={quiz} />
            ))}
          </div>
        </section>
      </main>
  );
}
