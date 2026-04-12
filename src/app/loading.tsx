import styles from "./page.module.css";

export default function Loading() {
  return (
    <main className={styles.page}>
      <section className={`${styles.hero} ${styles.panel}`}>
        <div className={styles.heroMain}>
          <p className={styles.eyebrow}>Carregando...</p>
          <div className={styles.drawnGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className={styles.drawnBall} style={{ opacity: 0.3 }}>
                --
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
