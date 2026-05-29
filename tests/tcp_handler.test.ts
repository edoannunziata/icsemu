import { describe, expect, test } from "bun:test";
import type { Command } from "../src/cmd/command.ts";
import { ConnectionState } from "../src/state.ts";
import { handleTcp, splitCommandLine } from "../src/tcp_handler.ts";
import { FakeReader, FakeWriter } from "./helpers.ts";

function state(): ConnectionState {
  return new ConnectionState({ tokenData: { access_token: "t", token_type: "Bearer" } });
}

function command(fn: Command["execute"]): Command {
  return {
    description: "",
    helpText: "",
    execute: fn,
  };
}

describe("splitCommandLine", () => {
  test("handles spaces and quotes", () => {
    expect(splitCommandLine('set note "hello world"')).toEqual(["set", "note", "hello world"]);
  });

  test("unterminated quotes throw", () => {
    expect(() => splitCommandLine('set note "oops')).toThrow();
  });
});

describe("handleTcp", () => {
  test("dispatches a command and says goodbye", async () => {
    const writer = new FakeWriter();
    await handleTcp(
      new FakeReader(["ok"]),
      writer,
      state(),
      {
        ok: command(async (_args, _reader, commandWriter) => {
          commandWriter.write("ran\n");
        }),
      },
    );

    const output = writer.text();
    expect(output).toContain("%fics ");
    expect(output).toContain("ran");
    expect(output).toContain("Goodbye!");
    expect(writer.ended).toBe(true);
  });

  test("unknown and ambiguous commands report errors", async () => {
    const writer = new FakeWriter();
    await handleTcp(
      new FakeReader(["z", "g"]),
      writer,
      state(),
      {
        games: command(async () => {}),
        greet: command(async () => {}),
      },
    );

    const output = writer.text();
    expect(output).toContain("z: Command not found.");
    expect(output).toContain("g: Ambiguous command. Matches: games, greet");
  });

  test("malformed commands report parse error", async () => {
    const writer = new FakeWriter();
    await handleTcp(new FakeReader(['set "unterminated']), writer, state(), {});

    expect(writer.text()).toContain("Malformed command.");
  });

  test("handler syntax and network errors are translated", async () => {
    const writer = new FakeWriter();
    const networkError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    await handleTcp(
      new FakeReader(["json", "net", "boom"]),
      writer,
      state(),
      {
        json: command(async () => {
          throw new SyntaxError("bad json");
        }),
        net: command(async () => {
          throw networkError;
        }),
        boom: command(async () => {
          throw new Error("oops");
        }),
      },
    );

    const output = writer.text();
    expect(output).toContain("Error: json failed - unexpected response.");
    expect(output).toContain("Error: net failed - network error.");
    expect(output).toContain("Error: boom failed.");
  });

  test("connection errors from handlers close cleanly without user-facing error", async () => {
    const writer = new FakeWriter();
    const error = Object.assign(new Error("gone"), { code: "EPIPE" });
    await handleTcp(
      new FakeReader(["boom"]),
      writer,
      state(),
      {
        boom: command(async () => {
          throw error;
        }),
      },
    );

    expect(writer.text()).not.toContain("Error:");
    expect(writer.ended).toBe(true);
  });
});
