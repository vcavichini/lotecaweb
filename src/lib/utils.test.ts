import { describe, expect, it } from "vitest";

import { countHits, formatMoney, renameFaixa } from "@/lib/utils";

describe("utils", () => {
  it("conta acertos corretamente", () => {
    expect(countHits(["01", "02", "03", "04", "05", "06"], ["01", "02", "30", "40", "50", "60"])).toBe(2);
  });

  it("formata dinheiro em pt-BR", () => {
    expect(formatMoney(1234.5)).toBe("R$ 1.234,50");
  });

  it("renomeia faixas conhecidas", () => {
    expect(renameFaixa("6 acertos")).toBe("Sena");
    expect(renameFaixa("3 acertos")).toBe("3 acertos");
  });
});
