import type { Command } from "./command.ts";

export class Match {
  constructor(
    readonly name: string,
    readonly handler: Command,
  ) {}
}

export class NoMatch {
  constructor(readonly prefix: string) {}
}

export class AmbiguousMatch {
  constructor(
    readonly prefix: string,
    readonly candidates: string[],
  ) {}
}

export function resolveCommand(
  prefix: string,
  registry: Record<string, Command>,
): Match | NoMatch | AmbiguousMatch {
  const exact = registry[prefix];
  if (exact) {
    return new Match(prefix, exact);
  }

  const hits = Object.entries(registry).filter(([name]) => name.startsWith(prefix));
  if (hits.length === 1) {
    const [name, handler] = hits[0]!;
    return new Match(name, handler);
  }
  if (hits.length === 0) {
    return new NoMatch(prefix);
  }
  return new AmbiguousMatch(
    prefix,
    hits.map(([name]) => name).sort(),
  );
}
