import type { Metadata } from "next";
import CustomHeader from "../CustomHeader";
import styles from "../custom.module.css";
import CustomPuzzleForm from "./CustomPuzzleForm";

export const metadata: Metadata = {
  title: "커스텀 문제 만들기 | minguu.dev",
  description: "나만의 17 만들기 문제를 검증하고 공유하세요.",
};

export default function NewCustomPuzzlePage() {
  return (
    <main className={styles.customPage} lang="ko">
      <CustomHeader />

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            MAKE YOUR OWN
          </div>
          <h1>
            당신만의 <span>17</span>을 올려 보세요.
          </h1>
          <p>
            네 숫자와 정답을 함께 입력하세요. 숫자의 자릿수는 제한하지 않으며,
            서버가 모든 카드를 정확히 한 번 썼는지 확인한 뒤 공개합니다.
          </p>
        </div>
      </section>

      <div className={styles.formLayout}>
        <CustomPuzzleForm />

        <aside className={styles.sidePanel} aria-label="문제 등록 안내">
          <section className={styles.sideSection}>
            <h2>등록 조건</h2>
            <ol>
              <li>네 장의 숫자 카드를 모두 한 번씩 사용합니다.</li>
              <li>답안을 계산한 결과가 정확히 17이어야 합니다.</li>
              <li>이어 붙이기는 원본 카드끼리만 가능합니다.</li>
            </ol>
          </section>
          <section className={styles.sideSection}>
            <h2>사용할 수 있는 연산</h2>
            <p>덧셈, 뺄셈, 곱셈, 나눗셈, 거듭제곱과 괄호를 사용할 수 있습니다.</p>
            <p>예: 카드 1, 1, 7, 1 → 1 × 17 × 1</p>
          </section>
        </aside>
      </div>

      <footer className={styles.footer}>
        <span>MINGUU.DEV / SEVENTEEN CUSTOM</span>
        <span>MAKE · VERIFY · SHARE</span>
      </footer>
    </main>
  );
}