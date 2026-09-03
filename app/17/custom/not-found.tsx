import Link from "next/link";
import CustomHeader from "./CustomHeader";
import styles from "./custom.module.css";

export default function CustomPuzzleNotFound() {
  return (
    <main className={styles.customPage} lang="ko">
      <CustomHeader />
      <section className={styles.emptyState}>
        <span className={styles.emptyMark}>?</span>
        <h1>이 문제를 찾을 수 없어요.</h1>
        <p>삭제되었거나 존재하지 않는 커스텀 문제입니다.</p>
        <Link href="/17/custom" className={styles.primaryLink}>다른 문제 보기</Link>
      </section>
    </main>
  );
}