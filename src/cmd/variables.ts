import type { ConnectionState } from "../state.ts";
import { writeMessage } from "../stream_utils.ts";
import type { CommandReader, WritableConnection } from "../types.ts";
import type { Command } from "./command.ts";

const VARIABLES_USAGE =
  "Command:  variables\n" +
  "Purpose:  display current variable settings\n" +
  "Usage:    variables\n";

export class VariablesCommand implements Command {
  get description(): string {
    return "Display current variable settings";
  }

  get helpText(): string {
    return VARIABLES_USAGE;
  }

  async execute(
    _args: string[],
    _reader: CommandReader | null,
    writer: WritableConnection,
    state: ConnectionState,
  ): Promise<void> {
    const names = Object.keys(state.variables).sort();
    if (names.length === 0) {
      await writeMessage(writer, "No variables set.\n");
      return;
    }

    const lines = names.map((name) => `  ${name}=${state.variables[name]}`);
    await writeMessage(writer, `Variable settings:\n${lines.join("\n")}\n`);
  }
}
