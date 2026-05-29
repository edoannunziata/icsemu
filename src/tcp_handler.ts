import { config } from "./config.ts";
import { commandHandlers } from "./cmd/command_handlers.ts";
import { AmbiguousMatch, NoMatch, resolveCommand } from "./cmd/prefix_match.ts";
import type { Command } from "./cmd/command.ts";
import type { ConnectionState } from "./state.ts";
import { isConnectionError, writeMessage } from "./stream_utils.ts";
import type { CommandReader, WritableConnection } from "./types.ts";

export async function handleTcp(
  reader: CommandReader,
  writer: WritableConnection,
  state: ConnectionState,
  registry: Record<string, Command> = commandHandlers,
): Promise<void> {
  try {
    while (true) {
      try {
        await writeMessage(writer, `${config.prompt} `);
      } catch (error) {
        if (isConnectionError(error)) {
          break;
        }
        throw error;
      }

      const commandLine = await reader.readLine();
      if (commandLine === null) {
        break;
      }

      if (commandLine === "") {
        await writeMessage(writer, "\n");
        continue;
      }

      let tokens: string[];
      try {
        tokens = splitCommandLine(commandLine);
      } catch {
        tokens = [];
      }

      if (tokens.length === 0) {
        await writeMessage(writer, "Malformed command.\n");
        continue;
      }

      const [commandName, ...args] = tokens;
      const result = resolveCommand(commandName!, registry);

      if (result instanceof NoMatch) {
        await writeMessage(writer, `${commandName}: Command not found.\n`);
        continue;
      }

      if (result instanceof AmbiguousMatch) {
        await writeMessage(
          writer,
          `${commandName}: Ambiguous command. Matches: ${result.candidates.join(", ")}\n`,
        );
        continue;
      }

      try {
        await result.handler.execute(args, reader, writer, state);
      } catch (error) {
        if (isConnectionError(error)) {
          break;
        }

        const message =
          error instanceof SyntaxError
            ? `Error: ${result.name} failed - unexpected response.\n`
            : isLikelyNetworkError(error)
              ? `Error: ${result.name} failed - network error.\n`
              : `Error: ${result.name} failed.\n`;

        try {
          await writeMessage(writer, message);
        } catch (writeError) {
          if (isConnectionError(writeError)) {
            break;
          }
          throw writeError;
        }
      }
    }
  } finally {
    await state.cancelAllObserved();
    try {
      await writeMessage(writer, "Goodbye!\n");
    } catch (error) {
      if (!isConnectionError(error)) {
        throw error;
      }
    }
    writer.end();
  }
}

export function splitCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  const pushCurrent = (): void => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (const ch of input) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (ch === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      pushCurrent();
      continue;
    }

    current += ch;
  }

  if (escaping) {
    current += "\\";
  }
  if (quote) {
    throw new Error("Unterminated quote");
  }
  pushCurrent();
  return tokens;
}

function isLikelyNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    error.name === "AbortError" ||
    error.name === "TypeError"
  );
}
