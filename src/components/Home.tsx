/** @jsxImportSource hono/jsx */
import { getBetsForContest, loadBets } from "../lib/bets";
import { fetchContestData, getLatestContestNumber } from "../lib/lottery";
import { countHits, formatMoney, renameFaixa } from "../lib/utils";
import { getErrorMessage } from "../lib/validation";
import { ContestData, BetsConfig } from "../lib/types";

type HomeProps = {
  contestData: ContestData;
  latestContestNumber: number;
  bets: string[][];
};

export const Home = ({ contestData, latestContestNumber, bets }: HomeProps) => {
  return (
    <main class="page">
      <section class="hero panel">
        <div class="heroMain">
          <p class="eyebrow">Concurso {contestData.numero}</p>
          <p class="heroMeta">{contestData.dataApuracao}</p>

          <div class="drawnGrid">
            {contestData.listaDezenas.map((number) => (
              <span key={number} class="drawnBall">
                {number}
              </span>
            ))}
          </div>

          <div class="navRow">
            <span class="navSpacer" />

            {contestData.numero > 1 ? (
              <a class="navButton" href={`/?concurso=${contestData.numero - 1}`}>
                {contestData.numero - 1}
              </a>
            ) : (
              <span class="navSpacer" />
            )}

            <a class="primaryButton" href="/">
              {contestData.numero}
            </a>

            {contestData.numero < latestContestNumber ? (
              <a class="navButton" href={`/?concurso=${contestData.numero + 1}`}>
                {contestData.numero + 1}
              </a>
            ) : (
              <span class="navSpacer" />
            )}

            {contestData.numero < latestContestNumber ? (
              <a class="navButton" href="/">
                »
              </a>
            ) : (
              <span class="navSpacer" />
            )}
          </div>
        </div>
      </section>

      <section class="content">
        <article class="section panel">
          <h3 class="sectionTitle">Seus jogos no concurso</h3>
          <div class="betsList">
            {bets.length > 0 ? (
              bets.map((bet, index) => {
                const hits = countHits(contestData.listaDezenas, bet);

                return (
                  <div key={`${bet.join("-")}-${index}`} class="betRow">
                    {bet.map((number) => (
                      <span
                        key={`${index}-${number}`}
                        class={`betBall ${
                          contestData.listaDezenas.includes(number) ? "betBallHit" : ""
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

        <article class="section panel">
          <h3 class="sectionTitle">Premiação</h3>
          <table class="prizeTable">
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

      <section class="panel footerStats">
        <div class="footerStatsGrid">
          <div class="infoRow">
            <span class="infoLabel">Próximo concurso</span>
            <span class="infoValue">{contestData.dataProximoConcurso || "A definir"}</span>
          </div>
          <div class="infoRow">
            <span class="infoLabel">Estimativa</span>
            <span class="infoValue">{formatMoney(contestData.valorEstimadoProximoConcurso || 0)}</span>
          </div>
          <div class="infoRow">
            <span class="infoLabel">Status</span>
            <span class="infoValue">{contestData.acumulado ? "Acumulado" : "Não acumulado"}</span>
          </div>
        </div>
      </section>
    </main>
  );
};

export const ErrorPage = ({ message }: { message: string }) => {
  return (
    <main class="page">
      <section class="panel errorBox">
        <h1>Erro ao carregar dados</h1>
        <p>{message}</p>
        <a class="primaryButton" href="/">
          Tentar novamente
        </a>
      </section>
    </main>
  );
};
