import { describe, expect, test } from "bun:test";
import { ConnectionState } from "../src/state.ts";
import { DEFAULT_VARIABLES, validateVariable } from "../src/variables.ts";

describe("variables", () => {
  test("known style values are valid", () => {
    expect(validateVariable("style", "1")).toBeNull();
    expect(validateVariable("style", "12")).toBeNull();
  });

  test("bad known values report valid choices", () => {
    const error = validateVariable("style", "7");
    expect(error).toContain("Bad value");
    expect(error).toContain("7");
  });

  test("unknown variables accept any value", () => {
    expect(validateVariable("foobar", "anything")).toBeNull();
    expect(DEFAULT_VARIABLES.style).toBe("12");
  });
});

describe("connection state", () => {
  test("reset clears auth and tokens", () => {
    const state = new ConnectionState({
      authContext: { state: "state-value", codeVerifier: "verifier" },
      tokenData: { access_token: "abc" },
    });

    state.reset();

    expect(state.authContext).toBeNull();
    expect(state.tokenData).toBeNull();
  });

  test("variables are independent per instance", () => {
    const first = new ConnectionState();
    const second = new ConnectionState();
    first.variables.style = "1";
    expect(second.variables.style).toBe("12");
  });

  test("cancelAllObserved cancels and clears", async () => {
    let cancelled = false;
    const state = new ConnectionState();
    state.observedGames.set("g1", {
      cancelled: false,
      cancel() {
        cancelled = true;
      },
      promise: Promise.resolve(),
    });

    await state.cancelAllObserved();

    expect(cancelled).toBe(true);
    expect(state.observedGames.size).toBe(0);
  });
});
