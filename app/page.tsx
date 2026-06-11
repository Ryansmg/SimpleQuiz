import Link from "next/link";
import "./mainPage.css"

export default function Home() {
    return (
        <main>
            <section className="card">
                <h1>안녕하세요!</h1>
                <p style={{whiteSpace: "pre-line"}}>
                    경기과학고등학교 42기 손민기입니다. (aka minguu, guu, ryanson, ryansmg) <br/>
                    프로그래밍을 합니다. PS도 하고 개발도 합니다.
                </p>
                <br/>
                <h2 style={{marginBottom: 12}}>링크</h2>
                <div className="grid">
                    <Link className="card mainCard" href="https://dojoi.xyz">
                        <p style={
                            {marginBottom: 5, fontSize: "1.4rem", fontWeight: 550}
                        }>DOJ</p>
                        백준을 대체할 차세대 Online Judge입니다. 아마도요.
                    </Link>
                    <Link className="card mainCard" href="/quiz">
                        <p style={
                            {marginBottom: 5, fontSize: "1.4rem", fontWeight: 550}
                        }>퀴즈 풀기</p>
                        영어 단어 시험 수행평가 공부하려고 만들었습니다.
                    </Link>
                    <Link className="card mainCard"
                          href="https://ryansmg.notion.site/Blog-1bb1a171965180c39f50c0aa9bc71359?pvs=4"
                    >
                        <p style={
                            {marginBottom: 5, fontSize: "1.4rem", fontWeight: 550}
                        }>블로그</p>
                        비-프로그래밍 언어도 가끔 씁니다.
                    </Link>
                    <Link className="card mainCard"
                          href="https://solved.ac/profile/ryanson"
                    >
                        <p style={
                            {marginBottom: 5, fontSize: "1.4rem", fontWeight: 550}
                        }>solved.ac</p>
                        ryanson (Ruby IV)
                    </Link>
                    <Link className="card mainCard"
                          href="https://codeforces.com/profile/ryansmg"
                    >
                        <p style={
                            {marginBottom: 5, fontSize: "1.4rem", fontWeight: 550}
                        }>Codeforces</p>
                        고점은 퍼플이고 현재 실력은 민트
                    </Link>
                    <Link className="card mainCard"
                          href="https://atcoder.jp/users/ryanson"
                    >
                        <p style={
                            {marginBottom: 5, fontSize: "1.4rem", fontWeight: 550}
                        }>AtCoder</p>
                        마지막으로 친 지 17년 쯤 됐습니다.
                    </Link>
                </div>
            </section>
        </main>
    )
}
