import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clearTokenData, credentialsPath, loadTokenData, saveTokenData } from "../src/credentials.ts";
import { config } from "../src/config.ts";

const ORIGINAL_ENV = { ...process.env };
let tempDir: string | null = null;

async function useTempTokenPath(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "icsemu-test-"));
  const tokenPath = join(tempDir, "token.json");
  process.env.ICSEMU_TOKEN_PATH = tokenPath;
  config.reload();
  return tokenPath;
}

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  config.reload();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("credentials", () => {
  test("saves and loads token data", async () => {
    const tokenPath = await useTempTokenPath();
    await saveTokenData({ access_token: "abc", token_type: "Bearer" });

    expect(credentialsPath()).toBe(tokenPath);
    expect(await loadTokenData()).toEqual({ access_token: "abc", token_type: "Bearer" });
    expect(JSON.parse(await readFile(tokenPath, "utf8")).access_token).toBe("abc");
  });

  test("invalid JSON is deleted and ignored", async () => {
    const tokenPath = await useTempTokenPath();
    await writeFile(tokenPath, "{not json", "utf8");

    expect(await loadTokenData()).toBeNull();
    expect(await loadTokenData()).toBeNull();
  });

  test("expired token is deleted and ignored", async () => {
    await useTempTokenPath();
    await saveTokenData({ access_token: "old", expires_at: 1 });

    expect(await loadTokenData()).toBeNull();
  });

  test("clear removes stored token", async () => {
    await useTempTokenPath();
    await saveTokenData({ access_token: "abc" });
    await clearTokenData();

    expect(await loadTokenData()).toBeNull();
  });
});
