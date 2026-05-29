import { mkdir, readFile, rename, chmod, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { config } from "./config.ts";
import type { TokenData } from "./types.ts";

const TOKEN_FILENAME = "token.json";

export function credentialsPath(): string {
  if (config.tokenPath) {
    return config.tokenPath.replace(/^~/, homedir());
  }

  if (platform() === "win32") {
    const base = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(base, "icsemu", TOKEN_FILENAME);
  }

  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "icsemu", TOKEN_FILENAME);
}

export async function loadTokenData(): Promise<TokenData | null> {
  const path = credentialsPath();
  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    await deletePath(path);
    return null;
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    await deletePath(path);
    return null;
  }

  const tokenData = data as TokenData;
  if (tokenIsExpired(tokenData)) {
    await deletePath(path);
    return null;
  }

  return tokenData;
}

export async function saveTokenData(tokenData: TokenData): Promise<void> {
  const path = credentialsPath();
  try {
    await mkdir(dirname(path), { recursive: true });
  } catch {
    // Keep parity with the Python version: creation errors are ignored here,
    // and the final write decides whether persistence is possible.
  }

  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, JSON.stringify(tokenData, null, 2), "utf8");
  await rename(tempPath, path);

  try {
    await chmod(path, 0o600);
  } catch {
    // Best effort on platforms/filesystems that support chmod.
  }
}

export async function clearTokenData(): Promise<void> {
  await deletePath(credentialsPath());
}

function tokenIsExpired(tokenData: TokenData): boolean {
  const expiresAt = tokenData.expires_at;
  if (expiresAt === undefined || expiresAt === null) {
    return false;
  }

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry)) {
    return true;
  }

  return expiry <= Date.now() / 1000;
}

async function deletePath(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Missing or undeletable credentials should not crash startup.
  }
}
