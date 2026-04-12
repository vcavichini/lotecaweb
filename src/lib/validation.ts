import type { BetsConfig } from "@/lib/types";

const contestNumberRegex = /^\d+$/;

export function validateContestNumber(contestNumber: string): void {
  if (contestNumber === "") {
    return;
  }

  if (!contestNumberRegex.test(contestNumber)) {
    throw new Error("número do concurso deve ser numérico");
  }

  const parsed = Number(contestNumber);
  if (!Number.isInteger(parsed)) {
    throw new Error("número do concurso inválido");
  }

  if (parsed < 1 || parsed > 9999) {
    throw new Error("número do concurso deve estar entre 1 e 9999");
  }
}

export function validateBet(bet: string[]): void {
  if (bet.length < 6 || bet.length > 20) {
    throw new Error(`aposta deve ter entre 6 e 20 números (recebido: ${bet.length})`);
  }

  const seen = new Set<string>();

  for (const value of bet) {
    if (value.length !== 2) {
      throw new Error(`número '${value}' deve ter 2 dígitos`);
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new Error(`número '${value}' não é válido`);
    }

    if (parsed < 1 || parsed > 60) {
      throw new Error(`número ${parsed} deve estar entre 01 e 60`);
    }

    if (seen.has(value)) {
      throw new Error(`número ${value} está duplicado`);
    }

    seen.add(value);
  }
}

export function validateBetsConfig(config: BetsConfig): void {
  for (const [index, bet] of config.permanent.entries()) {
    try {
      validateBet(bet);
    } catch (error) {
      throw new Error(`aposta permanente #${index + 1} inválida: ${getErrorMessage(error)}`);
    }
  }

  for (const [contestNumber, bets] of Object.entries(config.one_off)) {
    try {
      validateContestNumber(contestNumber);
    } catch (error) {
      throw new Error(`concurso '${contestNumber}' inválido: ${getErrorMessage(error)}`);
    }

    for (const [index, bet] of bets.entries()) {
      try {
        validateBet(bet);
      } catch (error) {
        throw new Error(
          `aposta one-off concurso ${contestNumber} #${index + 1} inválida: ${getErrorMessage(error)}`,
        );
      }
    }
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "erro desconhecido";
}
