import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminCookieName, isAuthenticated } from "@/lib/auth";
import { loadBets, saveBets } from "@/lib/bets";
import { getAdminPassword } from "@/lib/env";
import type { BetsConfig } from "@/lib/types";
import { getErrorMessage } from "@/lib/validation";

async function ensureAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(getAdminCookieName())?.value;
  return isAuthenticated(cookie, getAdminPassword());
}

export async function GET() {
  if (!(await ensureAuth())) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    return NextResponse.json(await loadBets());
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!(await ensureAuth())) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as BetsConfig;
    await saveBets(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
