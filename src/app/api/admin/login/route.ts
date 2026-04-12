import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminCookieName, signSessionToken } from "@/lib/auth";
import { getAdminPassword } from "@/lib/env";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  const inputPassword = (body.password ?? "").trim();
  const envPassword = getAdminPassword();

  console.log("[admin/login]", {
    hasEnvPassword: envPassword.length > 0,
    inputLength: inputPassword.length,
    isMatch: inputPassword === envPassword,
    inputPassword,
    expectedPassword: envPassword,
  });

  if (!envPassword || inputPassword !== envPassword) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(getAdminCookieName(), signSessionToken(envPassword), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return NextResponse.json({ ok: true });
}
