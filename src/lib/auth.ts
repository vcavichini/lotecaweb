import { createHmac, timingSafeEqual } from "node:crypto";

import { getSessionSecret } from "@/lib/env";

const ADMIN_COOKIE_NAME = "loteca_admin";

export function getAdminCookieName(): string {
  return ADMIN_COOKIE_NAME;
}

export function signSessionToken(password: string): string {
  return createHmac("sha256", getSessionSecret() || "newloteca_session_v1")
    .update(password)
    .digest("hex");
}

export function isAuthenticated(cookieValue: string | undefined, adminPassword: string | undefined): boolean {
  if (!cookieValue || !adminPassword) {
    return false;
  }

  const expected = signSessionToken(adminPassword);
  const left = Buffer.from(cookieValue);
  const right = Buffer.from(expected);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
