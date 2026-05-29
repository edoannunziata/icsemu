import type { BoardState } from "./board.ts";
import { formatStyle1 } from "./style1.ts";
import { formatStyle12 } from "./style12.ts";

export function formatBoard(board: BoardState, style: string): string {
  if (style === "1") {
    return formatStyle1(board);
  }
  return formatStyle12(board);
}
