import { describe, expect, test } from "bun:test";
import type { Command } from "../src/cmd/command.ts";
import { AmbiguousMatch, Match, NoMatch, resolveCommand } from "../src/cmd/prefix_match.ts";

const stub: Command = {
  description: "",
  helpText: "",
  async execute() {},
};

const registry = {
  finger: stub,
  games: stub,
  help: stub,
};

describe("resolveCommand", () => {
  test("exact match wins", () => {
    const result = resolveCommand("finger", registry);
    expect(result).toBeInstanceOf(Match);
    expect((result as Match).name).toBe("finger");
  });

  test("unique prefix resolves", () => {
    const result = resolveCommand("ga", registry);
    expect(result).toBeInstanceOf(Match);
    expect((result as Match).name).toBe("games");
  });

  test("ambiguous prefix returns sorted candidates", () => {
    const result = resolveCommand("g", { games: stub, greet: stub });
    expect(result).toBeInstanceOf(AmbiguousMatch);
    expect((result as AmbiguousMatch).candidates).toEqual(["games", "greet"]);
  });

  test("missing prefix returns NoMatch", () => {
    expect(resolveCommand("xyz", registry)).toBeInstanceOf(NoMatch);
  });

  test("empty prefix is ambiguous", () => {
    const result = resolveCommand("", registry);
    expect(result).toBeInstanceOf(AmbiguousMatch);
    expect((result as AmbiguousMatch).candidates).toEqual(["finger", "games", "help"]);
  });
});
