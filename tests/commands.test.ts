import { describe, expect, test } from "bun:test";
import { HelpCommand } from "../src/cmd/help.ts";
import { SetCommand } from "../src/cmd/set.ts";
import { VariablesCommand } from "../src/cmd/variables.ts";
import { formatFingerResponse } from "../src/cmd/finger.ts";
import { ConnectionState } from "../src/state.ts";
import { FakeWriter } from "./helpers.ts";

function state(): ConnectionState {
  return new ConnectionState({ tokenData: { access_token: "t", token_type: "Bearer" } });
}

describe("basic commands", () => {
  test("help lists registered commands", async () => {
    const writer = new FakeWriter();
    await new HelpCommand().execute([], null, writer, state());

    const output = writer.text();
    expect(output).toContain("Available commands:");
    expect(output).toContain("finger");
    expect(output).toContain("observe");
  });

  test("help for unknown command reports error", async () => {
    const writer = new FakeWriter();
    await new HelpCommand().execute(["nope"], null, writer, state());

    expect(writer.text()).toContain('help: no such command "nope"');
  });

  test("set validates style and accepts unknown variables", async () => {
    const writer = new FakeWriter();
    const connectionState = state();
    const command = new SetCommand();

    await command.execute(["style", "1"], null, writer, connectionState);
    await command.execute(["style", "7"], null, writer, connectionState);
    await command.execute(["custom", "value"], null, writer, connectionState);

    expect(connectionState.variables.style).toBe("1");
    expect(connectionState.variables.custom).toBe("value");
    expect(writer.text()).toContain("style set to 1.");
    expect(writer.text()).toContain("Bad value");
  });

  test("variables command lists sorted variables", async () => {
    const writer = new FakeWriter();
    const connectionState = state();
    connectionState.variables.zzz = "last";
    connectionState.variables.aaa = "first";

    await new VariablesCommand().execute([], null, writer, connectionState);

    const output = writer.text();
    expect(output.indexOf("aaa")).toBeLessThan(output.indexOf("style"));
    expect(output.indexOf("style")).toBeLessThan(output.indexOf("zzz"));
  });

  test("finger response formats user metadata and perfs", () => {
    const output = formatFingerResponse({
      username: "Alice",
      seenAt: 0,
      perfs: {
        blitz: { rating: 1800, rd: 45.5, games: 10 },
      },
    });

    expect(output).toContain("Finger of Alice:");
    expect(output).toContain("Last disconnected: Thu Jan 01, 00:00 UTC 1970");
    expect(output).toContain("Blitz");
    expect(output).toContain("1800");
  });
});
