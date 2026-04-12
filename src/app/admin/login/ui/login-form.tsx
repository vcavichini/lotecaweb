"use client";

import type { CSSProperties, FormEvent } from "react";
import { useState } from "react";

const cardStyle: CSSProperties = {
  width: "min(420px, calc(100% - 32px))",
  margin: "10vh auto",
  padding: 32,
  borderRadius: 28,
  background: "var(--panel-bg)",
  border: "1px solid var(--stroke)",
  boxShadow: "var(--shadow)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 8,
  marginBottom: 16,
  borderRadius: 16,
  border: "1px solid var(--stroke)",
  background: "var(--panel-strong)",
  color: "var(--text-main)",
  padding: "14px 16px",
};

const buttonStyle: CSSProperties = {
  width: "100%",
  border: 0,
  borderRadius: 999,
  padding: "14px 18px",
  background: "var(--accent)",
  color: "#fff",
  fontWeight: 700,
};

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error || "Falha ao entrar.");
      setSubmitting(false);
      return;
    }

    window.location.assign("/admin");
  }

  return (
    <main style={cardStyle}>
      <p style={{ letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-soft)" }}>
        Área administrativa
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={inputStyle}
        />
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
