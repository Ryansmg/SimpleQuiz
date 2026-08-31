import Link from "next/link";
import { quizzes } from "@/lib/quizzes"


const quizGroups = Array.from(
    quizzes.reduce((groups, quiz) => {
        const groupName = quiz.group ?? "기타";
        const groupQuizzes = groups.get(groupName) ?? [];

        groups.set(groupName, [...groupQuizzes, quiz]);

        return groups;
    }, new Map<string, typeof quizzes>())
);

export default function Home() {
  return (
      <main>
        <section className="card stack">
          <h2>문제 세트 선택</h2>
          {/*<p style={{marginBottom: 22}}>원하는 문제 세트를 선택하고, 제한 시간 안에 최대한 높은 점수를 얻어 보세요.</p>*/}

          <div className="quizGroupList">
            {quizGroups.map(([groupName, groupQuizzes]) => (
                <section className="quizGroupCard" key={groupName}>
                    <h3 className="cardTitle">{groupName}</h3>

                    <div className="quizStageList">
                        {groupQuizzes.map((quiz) => (
                            <Link
                                className="quizStageLink"
                                href={`/quiz/${quiz.id}/start`}
                                key={quiz.id}
                            >
                                <span>
                                    <strong>{quiz.name}</strong>
                                    <span>{quiz.description}</span>
                                </span>
                                <span className="badge">{quiz.length}문제</span>
                            </Link>
                        ))}
                    </div>
                </section>
            ))}
          </div>
        </section>
      </main>
  );
}
