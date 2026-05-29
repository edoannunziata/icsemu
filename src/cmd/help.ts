import type { ConnectionState } from "../state.ts";
import { writeMessage } from "../stream_utils.ts";
import type { CommandReader, WritableConnection } from "../types.ts";
import type { Command } from "./command.ts";

export class HelpCommand implements Command {
  get description(): string {
    return "Show available commands or detailed help for a command";
  }

  get helpText(): string {
    return (
      "Command:  help\n" +
      "Purpose:  display a list of commands or detailed help for one command\n" +
      "Usage:    help [command]\n" +
      "Examples: help; help finger\n"
    );
  }

  async execute(
    args: string[],
    _reader: CommandReader | null,
    writer: WritableConnection,
    _state: ConnectionState,
  ): Promise<void> {
    const { commandHandlers } = await import("./command_handlers.ts");

    if (args.length === 0) {
      const lines = Object.keys(commandHandlers)
        .sort()
        .map((name) => `  ${name.padEnd(15)} ${commandHandlers[name]!.description}`);
      await writeMessage(writer, `Available commands:\n${lines.join("\n")}\n`);
      return;
    }

    const commandName = args[0]!;
    const command = commandHandlers[commandName];
    if (!command) {
      await writeMessage(writer, `help: no such command "${commandName}".\n`);
      return;
    }

    await writeMessage(writer, command.helpText);
  }
}
