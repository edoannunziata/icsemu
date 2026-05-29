import type { ConnectionState } from "../state.ts";
import type { CommandReader, WritableConnection } from "../types.ts";

export interface Command {
  readonly description: string;
  readonly helpText: string;
  execute(
    args: string[],
    reader: CommandReader | null,
    writer: WritableConnection,
    state: ConnectionState,
  ): Promise<void>;
}
