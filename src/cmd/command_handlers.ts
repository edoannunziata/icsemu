import type { Command } from "./command.ts";
import { FingerCommand } from "./finger.ts";
import { GamesCommand } from "./games.ts";
import { HelpCommand } from "./help.ts";
import { ObserveCommand } from "./observe.ts";
import { SetCommand } from "./set.ts";
import { UnobserveCommand } from "./unobserve.ts";
import { VariablesCommand } from "./variables.ts";

export const commandHandlers: Record<string, Command> = {
  finger: new FingerCommand(),
  games: new GamesCommand(),
  help: new HelpCommand(),
  observe: new ObserveCommand(),
  set: new SetCommand(),
  unobserve: new UnobserveCommand(),
  variables: new VariablesCommand(),
};
