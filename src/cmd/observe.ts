import type { BoardState } from "../board.ts";
import { boardFromInitialEvent, boardFromMoveEvent } from "../board.ts";
import { formatBoard } from "../format_board.ts";
import { LichessResponse, makeRequest, makeRequestStreaming } from "../req.ts";
import type { ConnectionState, ObservedTask } from "../state.ts";
import { writeMessage } from "../stream_utils.ts";
import type { CommandReader, TokenData, WritableConnection } from "../types.ts";
import type { Command } from "./command.ts";

const STREAM_ENDPOINT = "/api/stream/game/{game_id}";
const GAME_ENDPOINT = "/game/export/{game_id}";
const CURRENT_GAME_ENDPOINT = "/api/user/{username}/current-game";

const CATCHUP_TIMEOUT_MS = 1000;
const TIMEOUT = Symbol("timeout");

const OBSERVE_USAGE =
  "Command:  observe\n" +
  "Purpose:  watch a game in progress and receive board updates\n" +
  "Usage:    observe <game_id | username>\n" +
  "Examples: observe abcd1234; observe DrNykterstein\n";

export class ObserveCommand implements Command {
  get description(): string {
    return "Watch a game in progress with live board updates";
  }

  get helpText(): string {
    return OBSERVE_USAGE;
  }

  async execute(
    args: string[],
    reader: CommandReader | null,
    writer: WritableConnection,
    state: ConnectionState,
  ): Promise<void> {
    await observe(args, reader, writer, state);
  }
}

export async function observe(
  args: string[],
  _reader: CommandReader | null,
  writer: WritableConnection,
  state: ConnectionState,
): Promise<void> {
  if (args.length !== 1) {
    await writeMessage(writer, OBSERVE_USAGE);
    return;
  }

  const identifier = args[0]!;
  const gameId = await resolveGameId(identifier, state.tokenData);
  if (gameId === null) {
    await writeMessage(writer, `No active game found for '${identifier}'.\n`);
    return;
  }

  if (state.observedGames.has(gameId)) {
    await writeMessage(writer, `Already observing game ${gameId}.\n`);
    return;
  }

  const task = createObservedTask(gameId, writer, state);
  state.observedGames.set(gameId, task);
  task.promise.finally(() => {
    state.observedGames.delete(gameId);
  });

  await writeMessage(writer, `Observing game ${gameId}.\n`);
}

export async function resolveGameId(identifier: string, tokenData: TokenData | null): Promise<string | null> {
  const gameResponse = await makeRequest("GET", GAME_ENDPOINT.replace("{game_id}", encodeURIComponent(identifier)), {
    accept: "application/json",
    tokenData,
  });
  const gamePayload = await safeJson(gameResponse);
  if (isRecord(gamePayload)) {
    const id = gamePayload.id;
    if (typeof id === "string" && id.toLowerCase() === identifier.toLowerCase()) {
      return id;
    }
  }

  const userResponse = await makeRequest(
    "GET",
    CURRENT_GAME_ENDPOINT.replace("{username}", encodeURIComponent(identifier)),
    {
      accept: "application/json",
      tokenData,
    },
  );
  const userPayload = await safeJson(userResponse);
  if (isRecord(userPayload) && typeof userPayload.id === "string") {
    return userPayload.id;
  }

  return null;
}

function createObservedTask(gameId: string, writer: WritableConnection, state: ConnectionState): ObservedTask {
  const abortController = new AbortController();
  let cancelled = false;
  const promise = streamGame(gameId, writer, state, abortController.signal);

  return {
    promise,
    cancel() {
      cancelled = true;
      abortController.abort();
    },
    get cancelled() {
      return cancelled;
    },
  };
}

export async function streamGame(
  gameId: string,
  writer: WritableConnection,
  state: ConnectionState,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  let response: LichessResponse | null = null;
  const closeResponse = (): void => response?.close();

  try {
    response = await makeRequestStreaming("GET", STREAM_ENDPOINT.replace("{game_id}", encodeURIComponent(gameId)), {
      accept: "application/x-ndjson",
      tokenData: state.tokenData,
    });
    signal.addEventListener("abort", closeResponse, { once: true });

    const iterator = response.ndjson()[Symbol.asyncIterator]();
    let board: BoardState | null = null;
    let caughtUp = false;

    while (!signal.aborted) {
      const future = iterator.next();
      let result: IteratorResult<unknown>;

      if (!caughtUp && board !== null) {
        const timed = await withTimeout(future, CATCHUP_TIMEOUT_MS, signal);
        if (timed === TIMEOUT) {
          caughtUp = true;
          await writeBoard(writer, state, board);
          result = await abortable(future, signal);
        } else {
          result = timed;
        }
      } else {
        result = await abortable(future, signal);
      }

      if (result.done) {
        if (!caughtUp && board !== null) {
          await writeBoard(writer, state, board);
        }
        break;
      }

      const event = result.value;
      if (!isRecord(event)) {
        continue;
      }

      if (board === null) {
        board = boardFromInitialEvent(event);
      } else if ("lm" in event) {
        board = boardFromMoveEvent(board, event);
      } else {
        continue;
      }

      if (caughtUp) {
        await writeBoard(writer, state, board);
      }
    }
  } catch (error) {
    if (!signal.aborted && !isAbortError(error)) {
      console.error(`Error streaming game ${gameId}`, error);
    }
  } finally {
    signal.removeEventListener("abort", closeResponse);
    response?.close();
  }
}

async function writeBoard(
  writer: WritableConnection,
  state: ConnectionState,
  board: BoardState,
): Promise<void> {
  const line = formatBoard(board, state.variables.style ?? "12");
  await state.writeLock.run(() => writeMessage(writer, line));
}

async function safeJson(response: LichessResponse): Promise<Record<string, unknown> | null> {
  if (response.statusCode >= 400) {
    return null;
  }
  try {
    const payload = await response.json();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<T | typeof TIMEOUT> {
  return Promise.race([abortable(promise, signal), abortableDelay(timeoutMs, signal).then(() => TIMEOUT)]);
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(abortError());
  }

  return new Promise<T>((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    const onAbort = (): void => {
      cleanup();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function abortableDelay(timeoutMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    const onAbort = (): void => {
      cleanup();
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
