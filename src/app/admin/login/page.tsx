import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAdminCookieName, isAuthenticated } from "@/lib/auth";
import { getAdminPassword } from "@/lib/env";

import { LoginForm } from "./ui/login-form";

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(getAdminCookieName())?.value;
  const adminPassword = getAdminPassword();

  if (isAuthenticated(cookie, adminPassword)) {
    redirect("/admin");
  }

  return <LoginForm />;
}
