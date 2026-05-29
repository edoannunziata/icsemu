import type { ConnectionState } from "../state.ts";
import { writeMessage } from "../stream_utils.ts";
import type { CommandReader, WritableConnection } from "../types.ts";
import type { Command } from "./command.ts";

const UNOBSERVE_USAGE =
  "Command:  unobserve\n" +
  "Purpose:  stop observing one or all games\n" +
  "Usage:    unobserve [game_id]\n" +
  "Examples: unobserve; unobserve abcd1234\n";

export class UnobserveCommand implements Command {
  get description(): string {
    return "Stop observing one or all games";
  }

  get helpText(): string {
    return UNOBSERVE_USAGE;
  }

  async execute(
    args: string[],
    reader: CommandReader | null,
    writer: WritableConnection,
    state: ConnectionState,
  ): Promise<void> {
    await unobserve(args, reader, writer, state);
  }
}

export async function unobserve(
  args: string[],
  _reader: CommandReader | null,
  writer: WritableConnection,
  state: ConnectionState,
): Promise<void> {
  if (args.length > 1) {
    await writeMessage(writer, UNOBSERVE_USAGE);
    return;
  }

  if (args.length === 0) {
    if (state.observedGames.size === 0) {
      await writeMessage(writer, "Not observing any games.\n");
      return;
    }
    const count = state.observedGames.size;
    await state.cancelAllObserved();
    await writeMessage(writer, `Stopped observing ${count} game${count === 1 ? "" : "s"}.\n`);
    return;
  }

  const gameId = args[0]!;
  const task = state.observedGames.get(gameId);
  if (!task) {
    await writeMessage(writer, `Not observing game ${gameId}.\n`);
    return;
  }

  state.observedGames.delete(gameId);
  task.cancel();
  await Promise.allSettled([task.promise]);
  await writeMessage(writer, `Stopped observing game ${gameId}.\n`);
}
