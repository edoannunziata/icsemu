import type { ConnectionState } from "../state.ts";
import { writeMessage } from "../stream_utils.ts";
import type { CommandReader, WritableConnection } from "../types.ts";
import { makeRequest } from "../req.ts";
import type { Command } from "./command.ts";

const FINGER_USAGE =
  "Command:  finger\n" +
  "Purpose:  display ratings and/or notes about yourself or another user\n" +
  "Usage:    finger [user] [/[b][s][l][w][B][S]] [r][n]\n" +
  "Examples: finger; finger TheViking; finger TheViking r; finger TheViking n;\n" +
  "          finger TheViking /wS r\n";

export class FingerCommand implements Command {
  get description(): string {
    return "Display ratings and notes about a user";
  }

  get helpText(): string {
    return FINGER_USAGE;
  }

  async execute(
    args: string[],
    reader: CommandReader | null,
    writer: WritableConnection,
    state: ConnectionState,
  ): Promise<void> {
    await finger(args, reader, writer, state);
  }
}

export async function finger(
  args: string[],
  _reader: CommandReader | null,
  writer: WritableConnection,
  state: ConnectionState,
): Promise<void> {
  if (args.length === 0) {
    const response = await makeRequest("GET", "/api/account", { tokenData: state.tokenData });
    await writeMessage(writer, formatFingerResponse(await response.json()));
    return;
  }

  if (args.length === 1) {
    const user = encodeURIComponent(args[0]!);
    const response = await makeRequest("GET", `/api/user/${user}`, { tokenData: state.tokenData });
    await writeMessage(writer, formatFingerResponse(await response.json()));
    return;
  }

  await writeMessage(writer, FINGER_USAGE);
}

export function formatFingerResponse(payload: unknown): string {
  const username = safeGetString(payload, "username");
  const seenAt = safeGetNumber(payload, "seenAt");
  const perfs = isRecord(payload) ? payload.perfs : undefined;

  const lines = [username ? `Finger of ${username}:` : "Finger:", "", formatSeenAt(seenAt), ""];
  const table = formatPerfsTable(perfs);
  if (table.length > 0) {
    lines.push(...table);
  } else {
    lines.push("No performance data available.");
  }
  lines.push("");
  return lines.join("\n");
}

function safeGetString(payload: unknown, key: string): string | null {
  if (isRecord(payload) && typeof payload[key] === "string") {
    return payload[key];
  }
  return null;
}

function safeGetNumber(payload: unknown, key: string): number | null {
  if (isRecord(payload) && typeof payload[key] === "number") {
    return Math.trunc(payload[key]);
  }
  return null;
}

function formatSeenAt(seenAt: number | null): string {
  if (seenAt === null) {
    return "Last disconnected: Unknown";
  }

  const date = new Date(seenAt);
  if (Number.isNaN(date.getTime())) {
    return "Last disconnected: Unknown";
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formatted = `${weekdays[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${String(
    date.getUTCDate(),
  ).padStart(2, "0")}, ${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")} UTC ${date.getUTCFullYear()}`;
  return `Last disconnected: ${formatted}`;
}

function formatPerfsTable(perfs: unknown): string[] {
  if (!isRecord(perfs)) {
    return [];
  }

  const rows: Array<Record<"name" | "rating" | "rd" | "total", string>> = [];
  for (const [key, perf] of Object.entries(perfs).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isRecord(perf)) {
      continue;
    }
    const rating = perf.rating;
    const rd = perf.rd;
    const games = perf.games;
    if (typeof rating !== "number" || typeof rd !== "number" || typeof games !== "number") {
      continue;
    }
    if (games === 0) {
      continue;
    }
    rows.push({
      name: formatVariantName(key),
      rating: String(Math.trunc(rating)),
      rd: String(rd),
      total: String(Math.trunc(games)),
    });
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = { name: "", rating: "rating", rd: "RD", total: "total" };
  const minWidths = { name: 10, rating: 6, rd: 6, total: 6 };
  const widths = {
    name: Math.max(minWidths.name, headers.name.length, ...rows.map((row) => row.name.length)),
    rating: Math.max(minWidths.rating, headers.rating.length, ...rows.map((row) => row.rating.length)),
    rd: Math.max(minWidths.rd, headers.rd.length, ...rows.map((row) => row.rd.length)),
    total: Math.max(minWidths.total, headers.total.length, ...rows.map((row) => row.total.length)),
  };

  const spacer = "  ";
  const lines = [
    [
      headers.name.padEnd(widths.name),
      headers.rating.padStart(widths.rating),
      headers.rd.padStart(widths.rd),
      headers.total.padStart(widths.total),
    ].join(spacer),
  ];

  for (const row of rows) {
    lines.push(
      [
        row.name.padEnd(widths.name),
        row.rating.padStart(widths.rating),
        row.rd.padStart(widths.rd),
        row.total.padStart(widths.total),
      ].join(spacer),
    );
  }

  return lines;
}

function formatVariantName(key: string): string {
  if (!key) {
    return "--";
  }
  if (key.toUpperCase() === key) {
    return key;
  }
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
