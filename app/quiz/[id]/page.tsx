
export default function QuizPage() {
    return (
        <>
            <header className="quizTopBar">
                <div className="quizTopBarInfo">
                    <div>
                        현재 문제 시간{" "}
                        <span className="quizTopBarStrong">12초</span>
                    </div>
                    <div>
                        전체 시간{" "}
                        <span className="quizTopBarStrong">1분 04초</span>
                    </div>
                    <div>
                        문제{" "}
                        <span className="quizTopBarStrong">3 / 10</span>
                    </div>
                    <div>
                        점수{" "}
                        <span className="quizTopBarStrong">2400</span>
                    </div>
                </div>

                <div className="progressBar">
                    <div className="progressFill" style={{ width: "30%" }} />
                    <div className="progressText">3 / 10</div>
                </div>
            </header>

            <main>
                <section className="card questionPanel">
                    <div className="questionNumber">문제 3</div>
                    <p className="questionText">
                        {"2 + 3은?\n2 + 3은?"}
                    </p>

                    <div className="choiceGrid">
                        <button className="choiceButton">4</button>
                        <button className="choiceButton">5</button>
                        <button className="choiceButton">6</button>
                        <button className="choiceButton">7</button>
                    </div>
                </section>
            </main>
        </>
    );
}