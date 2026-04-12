export function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function renameFaixa(faixa: string): string {
  switch (faixa) {
    case "6 acertos":
      return "Sena";
    case "5 acertos":
      return "Quina";
    case "4 acertos":
      return "Quadra";
    default:
      return faixa;
  }
}

export function buildSet(items: string[]): Set<string> {
  return new Set(items);
}

export function countHits(drawn: string[], bet: string[]): number {
  const drawnSet = buildSet(drawn);
  return bet.reduce((total, number) => total + (drawnSet.has(number) ? 1 : 0), 0);
}
