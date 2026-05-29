import { afterEach, describe, expect, test } from "bun:test";
import { games } from "../src/cmd/games.ts";
import { observe } from "../src/cmd/observe.ts";
import { unobserve } from "../src/cmd/unobserve.ts";
import { config } from "../src/config.ts";
import { ConnectionState } from "../src/state.ts";
import { FakeWriter, sleep } from "./helpers.ts";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

const INITIAL_EVENT = {
  id: "abc12345",
  players: {
    white: { user: { name: "Alice" } },
    black: { user: { name: "Bob" } },
  },
  clock: { initial: 300, increment: 3 },
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  status: { name: "started" },
};

const E4_EVENT = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  lm: "e2e4",
  wc: 295,
  bc: 300,
};

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
  config.reload();
});

function state(): ConnectionState {
  return new ConnectionState({ tokenData: { access_token: "t", token_type: "Bearer" } });
}

describe("games command", () => {
  test("TV command parses NDJSON fallback", async () => {
    globalThis.fetch = (async () => new Response('{"id":"alpha"}\n{"id":"beta"}\n')) as typeof fetch;
    const writer = new FakeWriter();

    await games([], null, writer, state());

    const payload = JSON.parse(writer.text());
    expect(payload.map((item: { id: string }) => item.id).sort()).toEqual(["alpha", "beta"]);
  });

  test("falls back to user games when game lookup fails", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/game/export/nonexistent")) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(JSON.stringify({ nowPlaying: [{ id: "g1" }, { id: "g2" }] }));
    }) as typeof fetch;
    const writer = new FakeWriter();

    await games(["nonexistent"], null, writer, state());

    const payload = JSON.parse(writer.text());
    expect(payload.map((item: { id: string }) => item.id).sort()).toEqual(["g1", "g2"]);
  });
});

describe("observe command", () => {
  test("game ID resolves, catch-up emits only final board, and task cleans up", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/game/export/game01")) {
        return new Response(JSON.stringify({ id: "game01" }));
      }
      if (url.includes("/api/stream/game/game01")) {
        return new Response(`${JSON.stringify(INITIAL_EVENT)}\n${JSON.stringify(E4_EVENT)}\n`);
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const writer = new FakeWriter();
    const connectionState = state();
    await observe(["game01"], null, writer, connectionState);
    await sleep(50);

    const output = writer.text();
    expect(output).toContain("Observing game game01.");
    expect(output.match(/<12>/g)?.length).toBe(1);
    expect(output).toContain("P/e2-e4");
    expect(connectionState.observedGames.has("game01")).toBe(false);
  });

  test("username fallback resolves current game", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/game/export/SomeUser")) {
        return new Response("Not Found", { status: 404 });
      }
      if (url.includes("/api/user/SomeUser/current-game")) {
        return new Response(JSON.stringify({ id: "xyz789" }));
      }
      if (url.includes("/api/stream/game/xyz789")) {
        return new Response(`${JSON.stringify(INITIAL_EVENT)}\n`);
      }
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    const writer = new FakeWriter();
    await observe(["SomeUser"], null, writer, state());
    await sleep(50);

    expect(calls.some((url) => url.includes("current-game"))).toBe(true);
    expect(writer.text()).toContain("Observing game xyz789.");
  });

  test("no active game reports error", async () => {
    globalThis.fetch = (async () => new Response("Not Found", { status: 404 })) as typeof fetch;
    const writer = new FakeWriter();

    await observe(["nobody"], null, writer, state());

    expect(writer.text()).toContain("No active game found for 'nobody'.");
  });
});

describe("unobserve command", () => {
  test("unobserve all cancels all tasks", async () => {
    const writer = new FakeWriter();
    const connectionState = state();
    let firstCancelled = false;
    let secondCancelled = false;
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    connectionState.observedGames.set("g1", {
      get cancelled() {
        return firstCancelled;
      },
      cancel() {
        firstCancelled = true;
        resolveFirst();
      },
      promise: new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }),
    });
    connectionState.observedGames.set("g2", {
      get cancelled() {
        return secondCancelled;
      },
      cancel() {
        secondCancelled = true;
        resolveSecond();
      },
      promise: new Promise<void>((resolve) => {
        resolveSecond = resolve;
      }),
    });

    await unobserve([], null, writer, connectionState);

    expect(firstCancelled).toBe(true);
    expect(secondCancelled).toBe(true);
    expect(connectionState.observedGames.size).toBe(0);
    expect(writer.text()).toContain("Stopped observing 2 games.");
  });

  test("unobserve single preserves other tasks", async () => {
    const writer = new FakeWriter();
    const connectionState = state();
    let droppedCancelled = false;
    let resolveDrop!: () => void;

    connectionState.observedGames.set("keep", {
      cancelled: false,
      cancel() {},
      promise: new Promise(() => {}),
    });
    connectionState.observedGames.set("drop", {
      get cancelled() {
        return droppedCancelled;
      },
      cancel() {
        droppedCancelled = true;
        resolveDrop();
      },
      promise: new Promise<void>((resolve) => {
        resolveDrop = resolve;
      }),
    });

    await unobserve(["drop"], null, writer, connectionState);

    expect(connectionState.observedGames.has("keep")).toBe(true);
    expect(connectionState.observedGames.has("drop")).toBe(false);
    expect(droppedCancelled).toBe(true);
    expect(writer.text()).toContain("Stopped observing game drop.");
  });
});
