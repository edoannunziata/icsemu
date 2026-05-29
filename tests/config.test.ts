import { afterEach, describe, expect, test } from "bun:test";
import { config } from "../src/config.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  config.reload();
});

describe("config", () => {
  test("defaults are used when environment is empty", () => {
    process.env = {};
    config.reload();

    expect(config.clientId).toBe("icsemu");
    expect(config.lichessHost).toBe("https://lichess.org");
    expect(config.port).toBe(4041);
    expect(config.prompt).toBe("%fics");
    expect(config.tokenPath).toBe("");
    expect(config.encoding).toBe("utf8");
  });

  test("derived URLs reflect configured host and port", () => {
    process.env.ICSEMU_PORT = "8181";
    process.env.ICSEMU_LICHESS_HOST = "https://lichess.dev/";
    config.reload();

    expect(config.redirectUri()).toBe("http://localhost:8181");
    expect(config.authorizeUrl()).toBe("https://lichess.dev/oauth");
    expect(config.tokenUrl()).toBe("https://lichess.dev/api/token");
    expect(config.getEndpoint("/api/account")).toBe("https://lichess.dev/api/account");
  });

  test("invalid port raises", () => {
    process.env.ICSEMU_PORT = "not-a-number";
    expect(() => config.reload()).toThrow("ICSEMU_PORT must be an integer");
  });
});
