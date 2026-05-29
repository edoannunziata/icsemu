import type { BoardState } from "./board.ts";

export function formatStyle1(board: BoardState): string {
  const lines: string[] = [];

  lines.push(`Game ${board.gameNumber} (${board.whiteName} vs. ${board.blackName})`);
  lines.push("");

  const activeSideName = board.activeColor === "W" ? "White" : "Black";
  const movedSide = board.activeColor === "W" ? "Black" : "White";

  const info = new Map<number, string>();
  info.set(0, `Move # : ${board.fullmoveNumber} (${activeSideName})`);
  if (board.prettyMove !== "none") {
    info.set(1, `${movedSide} Moves : '${board.prettyMove}     ${board.timeTaken}'`);
  } else {
    info.set(1, `${movedSide} Moves : none`);
  }
  info.set(3, `Black Clock : ${formatClock(board.blackTime)}`);
  info.set(4, `White Clock : ${formatClock(board.whiteTime)}`);
  info.set(5, `Black Strength : ${board.blackMaterial}`);
  info.set(6, `White Strength : ${board.whiteMaterial}`);

  const separator = "       ---------------------------------";
  const rowDivider = "       |---+---+---+---+---+---+---+---|";

  lines.push(separator);
  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    const rankNumber = 8 - rankIndex;
    const cells = Array.from(board.ranks[rankIndex] ?? "--------").map(formatCell);
    let row = `    ${rankNumber}  |${cells.join("|")}|`;
    const sideInfo = info.get(rankIndex);
    if (sideInfo) {
      row += `     ${sideInfo}`;
    }
    lines.push(row);
    if (rankIndex < 7) {
      lines.push(rowDivider);
    }
  }
  lines.push(separator);
  lines.push("         a   b   c   d   e   f   g   h");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function formatCell(ch: string): string {
  if (ch === "-") {
    return "   ";
  }
  if (ch >= "A" && ch <= "Z") {
    return ` ${ch} `;
  }
  return ` *${ch.toUpperCase()}`;
}

function formatClock(seconds: number): string {
  return `${Math.trunc(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
