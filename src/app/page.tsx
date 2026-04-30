import Link from "next/link";

import { getBetsForContest, loadBets } from "@/lib/bets";
import { fetchContestData, getLatestContestNumber } from "@/lib/lottery";
import { countHits, formatMoney, renameFaixa } from "@/lib/utils";
import { getErrorMessage } from "@/lib/validation";

import styles from "./page.module.css";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const contest = typeof params.concurso === "string" ? params.concurso : "";

  try {
    const [contestData, latestContestNumber, betsConfig] = await Promise.all([
      fetchContestData(contest),
      getLatestContestNumber(),
      loadBets(),
    ]);

    const bets = getBetsForContest(betsConfig, contestData.numero);

    return (
      <main className={styles.page}>
        <section className={`${styles.hero} ${styles.panel}`}>
          <div className={styles.heroMain}>
            <p className={styles.eyebrow}>Concurso {contestData.numero}</p>
            <p className={styles.heroMeta}>{contestData.dataApuracao}</p>

            <div className={styles.drawnGrid}>
              {contestData.listaDezenas.map((number) => (
                <span key={number} className={styles.drawnBall}>
                  {number}
                </span>
              ))}
            </div>

            <div className={styles.navRow}>
              <span className={styles.navSpacer} />

              {contestData.numero > 1 ? (
                <Link className={styles.navButton} href={`/?concurso=${contestData.numero - 1}`}>
                  {contestData.numero - 1}
                </Link>
              ) : (
                <span className={styles.navSpacer} />
              )}

              <Link className={styles.primaryButton} href="/">
                {contestData.numero}
              </Link>

              {contestData.numero < latestContestNumber ? (
                <Link className={styles.navButton} href={`/?concurso=${contestData.numero + 1}`}>
                  {contestData.numero + 1}
                </Link>
              ) : (
                <span className={styles.navSpacer} />
              )}

              {contestData.numero < latestContestNumber ? (
                <Link className={styles.navButton} href="/">
                  »
                </Link>
              ) : (
                <span className={styles.navSpacer} />
              )}
            </div>
          </div>
        </section>

        <section className={styles.content}>
          <article className={`${styles.section} ${styles.panel}`}>
            <h3 className={styles.sectionTitle}>Seus jogos no concurso</h3>
            <div className={styles.betsList}>
              {bets.length > 0 ? (
                bets.map((bet, index) => {
                  const hits = countHits(contestData.listaDezenas, bet);

                  return (
                    <div key={`${bet.join("-")}-${index}`} className={styles.betRow}>
                      {bet.map((number) => (
                        <span
                          key={`${index}-${number}`}
                          className={`${styles.betBall} ${
                            contestData.listaDezenas.includes(number) ? styles.betBallHit : ""
                          }`}
                        >
                          {number}
                        </span>
                      ))}
                    </div>
                  );
                })
              ) : (
                <p>Nenhuma aposta cadastrada para este concurso.</p>
              )}
            </div>
          </article>

          <article className={`${styles.section} ${styles.panel}`}>
            <h3 className={styles.sectionTitle}>Premiação</h3>
            <table className={styles.prizeTable}>
              <tbody>
                {contestData.listaRateioPremio.map((tier) => (
                  <tr key={tier.descricaoFaixa}>
                    <td>{renameFaixa(tier.descricaoFaixa)}</td>
                    <td>{tier.numeroDeGanhadores}</td>
                    <td>{formatMoney(tier.valorPremio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </section>

        <section className={`${styles.panel} ${styles.footerStats}`}>
          <div className={styles.footerStatsGrid}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Próximo concurso</span>
              <span className={styles.infoValue}>{contestData.dataProximoConcurso || "A definir"}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Estimativa</span>
              <span className={styles.infoValue}>{formatMoney(contestData.valorEstimadoProximoConcurso || 0)}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Status</span>
              <span className={styles.infoValue}>{contestData.acumulado ? "Acumulado" : "Não acumulado"}</span>
            </div>
          </div>
        </section>
      </main>
    );
  } catch (error) {
    return (
      <main className={styles.page}>
        <section className={`${styles.panel} ${styles.errorBox}`}>
          <h1>Erro ao carregar dados</h1>
          <p>{getErrorMessage(error)}</p>
          <Link className={styles.primaryButton} href="/">
            Tentar novamente
          </Link>
        </section>
      </main>
    );
  }
}
