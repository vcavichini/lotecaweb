import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let cachedLocalEnv: Record<string, string> | null = null;

function parseLocalEnvFile(): Record<string, string> {
  const filePath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf-8");
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

function getLocalEnv(): Record<string, string> {
  if (cachedLocalEnv === null) {
    cachedLocalEnv = parseLocalEnvFile();
  }

  return cachedLocalEnv;
}

export function getEnvValue(name: string): string {
  const localValue = getLocalEnv()[name];
  if (typeof localValue === "string" && localValue !== "") {
    return localValue;
  }

  return process.env[name] ?? "";
}

export function getAdminPassword(): string {
  return getEnvValue("ADMIN_PASSWORD").trim();
}

export function getSessionSecret(): string {
  return getEnvValue("SESSION_SECRET").trim();
}
