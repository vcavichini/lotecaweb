import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAdminCookieName, isAuthenticated } from "@/lib/auth";
import { getAdminPassword } from "@/lib/env";
import { loadBets } from "@/lib/bets";

import { AdminEditor } from "./ui/admin-editor";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(getAdminCookieName())?.value;
  const adminPassword = getAdminPassword();

  if (!isAuthenticated(cookie, adminPassword)) {
    redirect("/admin/login");
  }

  const config = await loadBets();
  return <AdminEditor initialConfig={config} />;
}
