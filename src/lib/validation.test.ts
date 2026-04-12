import { describe, expect, it } from "vitest";

import { validateBet, validateBetsConfig, validateContestNumber } from "@/lib/validation";

describe("validateContestNumber", () => {
  it("aceita string vazia para último concurso", () => {
    expect(() => validateContestNumber("")).not.toThrow();
  });

  it("rejeita concurso não numérico", () => {
    expect(() => validateContestNumber("12a")).toThrow("número do concurso deve ser numérico");
  });
});

describe("validateBet", () => {
  it("aceita aposta mínima válida", () => {
    expect(() => validateBet(["01", "02", "03", "04", "05", "06"])).not.toThrow();
  });

  it("rejeita número duplicado", () => {
    expect(() => validateBet(["01", "01", "03", "04", "05", "06"])).toThrow("duplicado");
  });
});

describe("validateBetsConfig", () => {
  it("aceita configuração com permanent e one_off válidos", () => {
    expect(() =>
      validateBetsConfig({
        permanent: [["01", "02", "03", "04", "05", "06"]],
        one_off: {
          "2955": [["10", "20", "30", "40", "50", "60"]],
        },
      }),
    ).not.toThrow();
  });

  it("rejeita chave inválida em one_off", () => {
    expect(() =>
      validateBetsConfig({
        permanent: [],
        one_off: {
          abc: [["01", "02", "03", "04", "05", "06"]],
        },
      }),
    ).toThrow("concurso 'abc' inválido");
  });
});
