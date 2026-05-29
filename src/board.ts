import { Chess } from "chess.js";

export const RELATION_OBSERVING = 0;
export const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

export interface BoardState {
  ranks: [string, string, string, string, string, string, string, string];
  activeColor: "W" | "B";
  doublePawnPushFile: number;
  whiteCanCastleShort: boolean;
  whiteCanCastleLong: boolean;
  blackCanCastleShort: boolean;
  blackCanCastleLong: boolean;
  irreversibleMoveCount: number;
  fullmoveNumber: number;
  gameNumber: number;
  whiteName: string;
  blackName: string;
  relation: number;
  initialTimeSeconds: number;
  incrementSeconds: number;
  whiteMaterial: number;
  blackMaterial: number;
  whiteTime: number;
  blackTime: number;
  verboseMove: string;
  timeTaken: string;
  prettyMove: string;
  flip: boolean;
}

export function boardFromInitialEvent(event: Record<string, unknown>, gameNumber = 1): BoardState {
  const fen = getString(event, "fen", STARTING_FEN);
  const parsed = parseFen(fen);

  const clock = objectValue(event.clock);
  const initialMs = getNumber(clock, "initial", 0);
  const incrementMs = getNumber(clock, "increment", 0);
  const initialSeconds = initialMs > 300 ? Math.trunc(initialMs / 1000) : initialMs;
  const incrementSeconds = incrementMs > 300 ? Math.trunc(incrementMs / 1000) : incrementMs;

  const whiteTime = getNumber(event, "wc", initialSeconds);
  const blackTime = getNumber(event, "bc", initialSeconds);

  const players = objectValue(event.players);

  return {
    ranks: parsed.ranks,
    activeColor: parsed.activeColor,
    doublePawnPushFile: parsed.doublePawnPushFile,
    whiteCanCastleShort: parsed.castling.includes("K"),
    whiteCanCastleLong: parsed.castling.includes("Q"),
    blackCanCastleShort: parsed.castling.includes("k"),
    blackCanCastleLong: parsed.castling.includes("q"),
    irreversibleMoveCount: parsed.halfmoveClock,
    fullmoveNumber: parsed.fullmoveNumber,
    gameNumber,
    whiteName: extractPlayerName(players, "white"),
    blackName: extractPlayerName(players, "black"),
    relation: RELATION_OBSERVING,
    initialTimeSeconds: initialSeconds,
    incrementSeconds,
    whiteMaterial: computeMaterial(parsed.ranks, "white"),
    blackMaterial: computeMaterial(parsed.ranks, "black"),
    whiteTime,
    blackTime,
    verboseMove: "none",
    timeTaken: "(0:00)",
    prettyMove: "none",
    flip: false,
  };
}

export function boardFromMoveEvent(previous: BoardState, event: Record<string, unknown>): BoardState {
  const newFen = getString(event, "fen", "");
  if (!newFen) {
    return previous;
  }

  const uci = getString(event, "lm", "");
  const preFen = boardStateToFen(previous);
  const parsed = parseFen(newFen);

  let verbose = "none";
  let pretty = "none";
  if (uci) {
    verbose = uciToVerbose(uci, preFen);
    pretty = uciToSan(uci, preFen);
  }

  const whiteTime = getNumber(event, "wc", previous.whiteTime);
  const blackTime = getNumber(event, "bc", previous.blackTime);
  const elapsed =
    previous.activeColor === "W"
      ? Math.max(previous.whiteTime - whiteTime, 0)
      : Math.max(previous.blackTime - blackTime, 0);

  return {
    ranks: parsed.ranks,
    activeColor: parsed.activeColor,
    doublePawnPushFile: parsed.doublePawnPushFile,
    whiteCanCastleShort: parsed.castling.includes("K"),
    whiteCanCastleLong: parsed.castling.includes("Q"),
    blackCanCastleShort: parsed.castling.includes("k"),
    blackCanCastleLong: parsed.castling.includes("q"),
    irreversibleMoveCount: parsed.halfmoveClock,
    fullmoveNumber: parsed.fullmoveNumber,
    gameNumber: previous.gameNumber,
    whiteName: previous.whiteName,
    blackName: previous.blackName,
    relation: previous.relation,
    initialTimeSeconds: previous.initialTimeSeconds,
    incrementSeconds: previous.incrementSeconds,
    whiteMaterial: computeMaterial(parsed.ranks, "white"),
    blackMaterial: computeMaterial(parsed.ranks, "black"),
    whiteTime,
    blackTime,
    verboseMove: verbose,
    timeTaken: `(${Math.trunc(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")})`,
    prettyMove: pretty,
    flip: previous.flip,
  };
}

export function boardStateToFen(state: BoardState): string {
  const boardPart = state.ranks.map(compressRank).join("/");
  const color = state.activeColor === "W" ? "w" : "b";
  let castling = "";
  if (state.whiteCanCastleShort) {
    castling += "K";
  }
  if (state.whiteCanCastleLong) {
    castling += "Q";
  }
  if (state.blackCanCastleShort) {
    castling += "k";
  }
  if (state.blackCanCastleLong) {
    castling += "q";
  }
  if (!castling) {
    castling = "-";
  }

  const ep =
    state.doublePawnPushFile < 0
      ? "-"
      : `${String.fromCharCode("a".charCodeAt(0) + state.doublePawnPushFile)}${
          state.activeColor === "W" ? "6" : "3"
        }`;

  return `${boardPart} ${color} ${castling} ${ep} ${state.irreversibleMoveCount} ${state.fullmoveNumber}`;
}

function parseFen(fen: string): {
  ranks: BoardState["ranks"];
  activeColor: "W" | "B";
  castling: string;
  doublePawnPushFile: number;
  halfmoveClock: number;
  fullmoveNumber: number;
} {
  const parts = normaliseFen(fen).split(/\s+/);
  const boardPart = parts[0] ?? STARTING_FEN.split(" ", 1)[0];
  const active = parts[1] === "b" ? "B" : "W";
  const castling = parts[2] && parts[2] !== "-" ? parts[2] : "";
  const ep = parts[3] ?? "-";
  const halfmoveClock = parseInteger(parts[4], 0);
  const fullmoveNumber = parseInteger(parts[5], 1);

  const expanded = boardPart.split("/").map(expandRank);
  while (expanded.length < 8) {
    expanded.push("--------");
  }

  return {
    ranks: expanded.slice(0, 8) as BoardState["ranks"],
    activeColor: active,
    castling,
    doublePawnPushFile: /^[a-h][36]$/.test(ep) ? ep.charCodeAt(0) - "a".charCodeAt(0) : -1,
    halfmoveClock,
    fullmoveNumber,
  };
}

function normaliseFen(fen: string): string {
  const parts = fen.trim().split(/\s+/).filter(Boolean);
  while (parts.length < 6) {
    if (parts.length === 4) {
      parts.push("0");
    } else if (parts.length === 5) {
      parts.push("1");
    } else {
      parts.push("-");
    }
  }
  return parts.join(" ");
}

function expandRank(rank: string): string {
  let out = "";
  for (const ch of rank) {
    if (/^[1-8]$/.test(ch)) {
      out += "-".repeat(Number(ch));
    } else {
      out += ch;
    }
  }
  return out.padEnd(8, "-").slice(0, 8);
}

function compressRank(rank: string): string {
  let out = "";
  let empty = 0;
  for (const ch of rank) {
    if (ch === "-") {
      empty += 1;
    } else {
      if (empty) {
        out += String(empty);
        empty = 0;
      }
      out += ch;
    }
  }
  if (empty) {
    out += String(empty);
  }
  return out;
}

function computeMaterial(ranks: readonly string[], color: "white" | "black"): number {
  let total = 0;
  for (const rank of ranks) {
    for (const ch of rank) {
      if (ch === "-") {
        continue;
      }
      const isWhite = ch >= "A" && ch <= "Z";
      if ((color === "white" && !isWhite) || (color === "black" && isWhite)) {
        continue;
      }
      total += PIECE_VALUES[ch.toLowerCase()] ?? 0;
    }
  }
  return total;
}

function uciToVerbose(uci: string, fen: string): string {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.slice(4, 5);
  const chess = new Chess(fen);
  const piece = chess.get(from);
  const pieceLetter = piece?.type.toUpperCase() ?? "?";

  if (piece?.type === "k" && Math.abs(fileIndex(from) - fileIndex(to)) === 2) {
    return fileIndex(to) > fileIndex(from) ? "o-o" : "o-o-o";
  }

  const legalMove = chess
    .moves({ verbose: true })
    .find((move) => move.from === from && move.to === to && (!promotion || move.promotion === promotion));
  const separator = legalMove?.flags.includes("c") || legalMove?.flags.includes("e") || chess.get(to) ? "x" : "-";
  return `${pieceLetter}/${from}${separator}${to}${promotion ? `=${promotion.toUpperCase()}` : ""}`;
}

function uciToSan(uci: string, fen: string): string {
  const chess = new Chess(fen);
  const move = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4, 5) || undefined,
  });
  return move?.san ?? "none";
}

function fileIndex(square: string): number {
  return square.charCodeAt(0) - "a".charCodeAt(0);
}

function extractPlayerName(players: Record<string, unknown>, color: "white" | "black"): string {
  const player = objectValue(players[color]);
  const user = objectValue(player.user);
  if (typeof user.name === "string") {
    return user.name;
  }
  return typeof player.name === "string" ? player.name : "?";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getString(obj: Record<string, unknown>, key: string, defaultValue: string): string {
  const value = obj[key];
  return typeof value === "string" ? value : defaultValue;
}

function getNumber(obj: Record<string, unknown>, key: string, defaultValue: number): number {
  const value = obj[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return defaultValue;
}

function parseInteger(value: string | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
