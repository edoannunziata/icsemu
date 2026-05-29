import type { BoardState } from "./board.ts";

export function formatStyle12(board: BoardState): string {
  const fields = [
    "<12>",
    ...board.ranks,
    board.activeColor,
    String(board.doublePawnPushFile),
    boolField(board.whiteCanCastleShort),
    boolField(board.whiteCanCastleLong),
    boolField(board.blackCanCastleShort),
    boolField(board.blackCanCastleLong),
    String(board.irreversibleMoveCount),
    String(board.gameNumber),
    board.whiteName,
    board.blackName,
    String(board.relation),
    String(board.initialTimeSeconds),
    String(board.incrementSeconds),
    String(board.whiteMaterial),
    String(board.blackMaterial),
    String(board.whiteTime),
    String(board.blackTime),
    String(board.fullmoveNumber),
    board.verboseMove,
    board.timeTaken,
    board.prettyMove,
    boolField(board.flip),
    board.verboseMove !== "none" ? "1" : "0",
  ];

  return `${fields.join(" ")}\n`;
}

function boolField(value: boolean): string {
  return value ? "1" : "0";
}
