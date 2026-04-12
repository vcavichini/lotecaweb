import { describe, expect, it } from "vitest";

import { isAuthenticated, signSessionToken } from "@/lib/auth";

describe("auth helpers", () => {
  it("gera token estável para a mesma senha", () => {
    expect(signSessionToken("segredo")).toBe(signSessionToken("segredo"));
  });

  it("rejeita cookie inválido", () => {
    expect(isAuthenticated("invalido", "segredo")).toBe(false);
  });

  it("aceita cookie assinado corretamente", () => {
    const token = signSessionToken("segredo");
    expect(isAuthenticated(token, "segredo")).toBe(true);
  });
});
