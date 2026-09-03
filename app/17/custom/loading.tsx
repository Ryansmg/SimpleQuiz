import CustomHeader from "./CustomHeader";
import styles from "./custom.module.css";

export default function CustomLoading() {
  return (
    <main className={styles.customPage} lang="ko">
      <CustomHeader />
      <div className={styles.emptyState} role="status">
        <span className={`${styles.emptyMark} ${styles.loadingPulse}`}>17</span>
        <h1>커스텀 문제를 불러오는 중…</h1>
        <p>잠시만 기다려 주세요.</p>
      </div>
    </main>
  );
}