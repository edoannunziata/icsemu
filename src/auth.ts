import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { config } from "./config.ts";
import type { TokenData } from "./types.ts";

export interface AuthContext {
  state: string;
  codeVerifier: string;
}

// Current commands only need authenticated account identity and public reads.
// Lichess accepts an empty OAuth scope list for this behavior.
export const OAUTH_SCOPES: readonly string[] = [];

export function beginAuthorization(openBrowser = true): AuthContext {
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier, "ascii").digest());
  const state = base64Url(randomBytes(32));

  const url = new URL(config.authorizeUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri());
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  if (OAUTH_SCOPES.length > 0) {
    url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  }

  if (openBrowser) {
    openUrl(url.toString());
  }

  return { state, codeVerifier };
}

export async function exchangeCode(context: AuthContext, code: string): Promise<TokenData> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: context.codeVerifier,
    client_id: config.clientId,
    redirect_uri: config.redirectUri(),
  });

  const response = await fetch(config.tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed with HTTP ${response.status}`);
  }

  const tokenData = (await response.json()) as TokenData;
  const expiresIn = Number(tokenData.expires_in);
  if (Number.isFinite(expiresIn) && tokenData.expires_at === undefined) {
    tokenData.expires_at = Date.now() / 1000 + expiresIn;
  }
  return tokenData;
}

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function openUrl(url: string): void {
  const platform = process.platform;
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    console.log(`Open this URL to authenticate: ${url}`);
  }
}
