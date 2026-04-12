"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useState } from "react";

import type { BetsConfig } from "@/lib/types";

import styles from "./admin-editor.module.css";

type AdminEditorProps = {
  initialConfig: BetsConfig;
};

function blankBet(): string[] {
  return ["", "", "", "", "", ""];
}

function normalizeConfig(config: BetsConfig): BetsConfig {
  return {
    permanent: config.permanent.map((bet) => [...bet]),
    one_off: Object.fromEntries(
      Object.entries(config.one_off).map(([contest, bets]) => [contest, bets.map((bet) => [...bet])]),
    ),
  };
}

export function AdminEditor({ initialConfig }: AdminEditorProps) {
  const router = useRouter();
  const [config, setConfig] = useState<BetsConfig>(() => normalizeConfig(initialConfig));
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = "Você tem alterações não salvas.";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function updatePermanent(betIndex: number, numberIndex: number, value: string) {
    setConfig((current) => {
      const next = normalizeConfig(current);
      next.permanent[betIndex][numberIndex] = value;
      return next;
    });
    setDirty(true);
  }

  function addPermanent() {
    setConfig((current) => ({
      ...current,
      permanent: [...current.permanent, blankBet()],
    }));
    setDirty(true);
  }

  function removePermanent(index: number) {
    setConfig((current) => ({
      ...current,
      permanent: current.permanent.filter((_, itemIndex) => itemIndex !== index),
    }));
    setDirty(true);
  }

  function updateOneOff(contest: string, betIndex: number, numberIndex: number, value: string) {
    setConfig((current) => {
      const next = normalizeConfig(current);
      next.one_off[contest][betIndex][numberIndex] = value;
      return next;
    });
    setDirty(true);
  }

  function addContest() {
    const contest = window.prompt("Número do concurso");
    if (!contest) {
      return;
    }

    setConfig((current) => ({
      ...current,
      one_off: {
        ...current.one_off,
        [contest]: current.one_off[contest] ?? [blankBet()],
      },
    }));
    setDirty(true);
  }

  function addOneOffBet(contest: string) {
    setConfig((current) => ({
      ...current,
      one_off: {
        ...current.one_off,
        [contest]: [...(current.one_off[contest] ?? []), blankBet()],
      },
    }));
    setDirty(true);
  }

  function removeContest(contest: string) {
    setConfig((current) => {
      const next = normalizeConfig(current);
      delete next.one_off[contest];
      return next;
    });
    setDirty(true);
  }

  function removeOneOffBet(contest: string, betIndex: number) {
    setConfig((current) => {
      const next = normalizeConfig(current);
      next.one_off[contest] = next.one_off[contest].filter((_, index) => index !== betIndex);
      if (next.one_off[contest].length === 0) {
        delete next.one_off[contest];
      }
      return next;
    });
    setDirty(true);
  }

  async function saveAll() {
    setStatus("Salvando...");

    const payload: BetsConfig = {
      permanent: config.permanent
        .map((bet) => bet.map((value) => value.trim()).filter(Boolean))
        .filter((bet) => bet.length > 0),
      one_off: Object.fromEntries(
        Object.entries(config.one_off)
          .map(([contest, bets]) => [
            contest.trim(),
            bets.map((bet) => bet.map((value) => value.trim()).filter(Boolean)).filter((bet) => bet.length > 0),
          ])
          .filter(([, bets]) => bets.length > 0),
      ),
    };

    const response = await fetch("/api/admin/bets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus(body?.error || "Erro ao salvar");
      return;
    }

    setConfig(normalizeConfig(payload));
    setStatus("Salvo com sucesso");
    setDirty(false);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const sortedOneOff = Object.entries(config.one_off).sort(([left], [right]) => Number(left) - Number(right));

  return (
    <main className={styles.shell}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Administração</p>
          <h1 className={styles.title}>Gerenciar apostas</h1>
        </div>
        <div className={styles.headerActions}>
          <a href="/" className={styles.ghostLink}>
            Ver site
          </a>
          <button type="button" onClick={logout} className={styles.button}>
            Sair
          </button>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Apostas permanentes</h2>
          <button type="button" onClick={addPermanent} className={styles.button}>
            Adicionar aposta
          </button>
        </div>

        {config.permanent.map((bet, betIndex) => (
          <div key={`permanent-${betIndex}`} className={styles.betRow}>
            {bet.map((value, numberIndex) => (
              <input
                key={`permanent-${betIndex}-${numberIndex}`}
                value={value}
                maxLength={2}
                onChange={(event) => updatePermanent(betIndex, numberIndex, event.target.value)}
                className={styles.numberInput}
              />
            ))}
            <button type="button" onClick={() => removePermanent(betIndex)} className={styles.dangerButton}>
              Remover
            </button>
          </div>
        ))}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Apostas pontuais</h2>
          <button type="button" onClick={addContest} className={styles.button}>
            Novo concurso
          </button>
        </div>

        {sortedOneOff.map(([contest, bets]) => (
          <div key={contest} className={styles.contestBlock}>
            <div className={styles.contestHeader}>
              <h3 className={styles.contestTitle}>Concurso {contest}</h3>
              <button type="button" onClick={() => removeContest(contest)} className={styles.dangerButton}>
                Remover bloco
              </button>
            </div>

            {bets.map((bet, betIndex) => (
              <div key={`${contest}-${betIndex}`} className={styles.betRow}>
                {bet.map((value, numberIndex) => (
                  <input
                    key={`${contest}-${betIndex}-${numberIndex}`}
                    value={value}
                    maxLength={2}
                    onChange={(event) => updateOneOff(contest, betIndex, numberIndex, event.target.value)}
                    className={styles.numberInput}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => removeOneOffBet(contest, betIndex)}
                  className={styles.dangerButton}
                >
                  Remover jogo
                </button>
              </div>
            ))}

            <button type="button" onClick={() => addOneOffBet(contest)} className={styles.button}>
              Adicionar jogo
            </button>
          </div>
        ))}
      </section>

      <div className={styles.footerBar}>
        <div className={`${styles.status} ${dirty ? styles.statusDirty : ""}`}>
          {dirty ? "Alterações não salvas" : "Sem alterações pendentes"}
        </div>
        <div className={styles.headerActions}>
          <span className={styles.status}>{status}</span>
          <button type="button" onClick={saveAll} className={styles.primaryButton}>
            Salvar alterações
          </button>
        </div>
      </div>
    </main>
  );
}
