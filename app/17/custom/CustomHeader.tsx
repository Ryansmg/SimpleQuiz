import Link from "next/link";
import styles from "./custom.module.css";

export default function CustomHeader() {
  return (
    <header className={styles.siteHeader}>
      <Link href="/17" className={styles.brand} aria-label="17 만들기 홈">
        <span className={styles.brandMark}>17</span>
        <span>minguu.dev</span>
      </Link>

      <nav className={styles.headerActions} aria-label="17 만들기 메뉴">
        <Link href="/17" className={styles.headerLinkQuiet}>
          랜덤 문제
        </Link>
        <Link href="/17/custom" className={styles.headerLink}>
          커스텀 문제
        </Link>
      </nav>
    </header>
  );
}