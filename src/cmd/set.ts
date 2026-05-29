import type { ConnectionState } from "../state.ts";
import { writeMessage } from "../stream_utils.ts";
import type { CommandReader, WritableConnection } from "../types.ts";
import { validateVariable } from "../variables.ts";
import type { Command } from "./command.ts";

const SET_USAGE =
  "Command:  set\n" +
  "Purpose:  set a variable value\n" +
  "Usage:    set <variable> <value>\n" +
  "Examples: set style 12; set style 1\n";

export class SetCommand implements Command {
  get description(): string {
    return "Set a variable value";
  }

  get helpText(): string {
    return SET_USAGE;
  }

  async execute(
    args: string[],
    _reader: CommandReader | null,
    writer: WritableConnection,
    state: ConnectionState,
  ): Promise<void> {
    if (args.length !== 2) {
      await writeMessage(writer, SET_USAGE);
      return;
    }

    const [name, value] = args as [string, string];
    const error = validateVariable(name, value);
    if (error) {
      await writeMessage(writer, error);
      return;
    }

    state.variables[name] = value;
    await writeMessage(writer, `${name} set to ${value}.\n`);
  }
}
