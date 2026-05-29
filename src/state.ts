import { AsyncLock } from "./async_lock.ts";
import type { AuthContext } from "./auth.ts";
import type { TokenData } from "./types.ts";
import { DEFAULT_VARIABLES } from "./variables.ts";

export interface ObservedTask {
  promise: Promise<void>;
  cancel(): void;
  readonly cancelled: boolean;
}

export class ConnectionState {
  authContext: AuthContext | null;
  tokenData: TokenData | null;
  observedGames: Map<string, ObservedTask>;
  writeLock: AsyncLock;
  variables: Record<string, string>;

  constructor(init: Partial<Pick<ConnectionState, "authContext" | "tokenData">> = {}) {
    this.authContext = init.authContext ?? null;
    this.tokenData = init.tokenData ?? null;
    this.observedGames = new Map();
    this.writeLock = new AsyncLock();
    this.variables = { ...DEFAULT_VARIABLES };
  }

  reset(): void {
    this.authContext = null;
    this.tokenData = null;
  }

  async cancelAllObserved(): Promise<void> {
    const tasks = Array.from(this.observedGames.values());
    this.observedGames.clear();
    for (const task of tasks) {
      task.cancel();
    }
    await Promise.allSettled(tasks.map((task) => task.promise));
  }
}
