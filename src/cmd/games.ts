import type { ConnectionState } from "../state.ts";
import { writeMessage } from "../stream_utils.ts";
import type { CommandReader, WritableConnection } from "../types.ts";
import { LichessResponse, makeRequest } from "../req.ts";
import type { Command } from "./command.ts";

const TV_ENDPOINT = "/api/tv/blitz";
const GAME_ENDPOINT_TEMPLATE = "/game/export/{game_id}";
const USER_GAMES_ENDPOINT_TEMPLATE = "/api/user/{user_handle}/games/ongoing";

const GAMES_USAGE =
  "Command:  games\n" +
  "Purpose:  display current games from Lichess TV or look up a specific game/user\n" +
  "Usage:    games [game_id | username]\n" +
  "Examples: games; games abcd1234; games DrNykterstein\n";

export class GamesCommand implements Command {
  get description(): string {
    return "List current games or look up a game/user";
  }

  get helpText(): string {
    return GAMES_USAGE;
  }

  async execute(
    args: string[],
    reader: CommandReader | null,
    writer: WritableConnection,
    state: ConnectionState,
  ): Promise<void> {
    await games(args, reader, writer, state);
  }
}

export async function games(
  args: string[],
  _reader: CommandReader | null,
  writer: WritableConnection,
  state: ConnectionState,
): Promise<void> {
  if (args.length === 0) {
    const response = await makeRequest("GET", TV_ENDPOINT, {
      accept: "application/x-ndjson",
      tokenData: state.tokenData,
    });
    let payload = await safeJson(response);
    if (payload === null) {
      payload = parseNdjson(await response.text());
    }
    await writeGames(writer, extractFromTv(payload));
    return;
  }

  const identifier = args[0]!;
  const gameResponse = await makeRequest(
    "GET",
    GAME_ENDPOINT_TEMPLATE.replace("{game_id}", encodeURIComponent(identifier)),
    {
      accept: "application/json",
      tokenData: state.tokenData,
    },
  );
  const gamePayload = await safeJson(gameResponse);
  if (isMatchingGame(identifier, gamePayload)) {
    await writeGames(writer, [gamePayload]);
    return;
  }

  const userResponse = await makeRequest(
    "GET",
    USER_GAMES_ENDPOINT_TEMPLATE.replace("{user_handle}", encodeURIComponent(identifier)),
    {
      accept: "application/json",
      tokenData: state.tokenData,
    },
  );
  const userPayload = await safeJson(userResponse);
  await writeGames(writer, extractFromUserGames(userPayload));
}

export async function safeJson(response: LichessResponse): Promise<unknown | null> {
  if (response.statusCode >= 400) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isMatchingGame(identifier: string, payload: unknown): payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const id = (payload as Record<string, unknown>).id;
  return typeof id === "string" && id.toLowerCase() === identifier.toLowerCase();
}

function extractFromTv(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (isRecord(payload)) {
    const channels = payload.channels;
    if (isRecord(channels)) {
      return Object.values(channels).filter(isRecord);
    }
    if (Array.isArray(channels)) {
      return channels.filter(isRecord);
    }
    if (Array.isArray(payload.games)) {
      return payload.games.filter(isRecord);
    }
  }

  return [];
}

function extractFromUserGames(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (isRecord(payload)) {
    if (Array.isArray(payload.nowPlaying)) {
      return payload.nowPlaying.filter(isRecord);
    }
    if (Array.isArray(payload.games)) {
      return payload.games.filter(isRecord);
    }
  }

  return [];
}

function parseNdjson(raw: string): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (isRecord(parsed)) {
        items.push(parsed);
      }
    } catch {
      // Ignore malformed NDJSON rows, matching the prototype.
    }
  }
  return items;
}

async function writeGames(writer: WritableConnection, gamesPayload: Record<string, unknown>[]): Promise<void> {
  await writeMessage(writer, `${JSON.stringify(gamesPayload, null, 2)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
