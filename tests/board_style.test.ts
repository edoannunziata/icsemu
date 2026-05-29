import { describe, expect, test } from "bun:test";
import type { BoardState } from "../src/board.ts";
import { boardFromInitialEvent, boardFromMoveEvent, boardStateToFen } from "../src/board.ts";
import { formatBoard } from "../src/format_board.ts";
import { formatStyle1 } from "../src/style1.ts";
import { formatStyle12 } from "../src/style12.ts";

const STARTING_EVENT = {
  id: "abc12345",
  players: {
    white: { user: { name: "Alice" }, rating: 1500 },
    black: { user: { name: "Bob" }, rating: 1600 },
  },
  clock: { initial: 300, increment: 3 },
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  status: { name: "started" },
};

const E4_EVENT = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  lm: "e2e4",
  wc: 295,
  bc: 300,
};

const E5_EVENT = {
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
  lm: "e7e5",
  wc: 295,
  bc: 296,
};

const NF3_EVENT = {
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
  lm: "g1f3",
  wc: 292,
  bc: 296,
};

describe("board conversion", () => {
  test("initial event produces ranks, metadata, clocks, and material", () => {
    const board = boardFromInitialEvent(STARTING_EVENT, 42);

    expect(board.ranks[0]).toBe("rnbqkbnr");
    expect(board.ranks[7]).toBe("RNBQKBNR");
    expect(board.activeColor).toBe("W");
    expect(board.whiteCanCastleShort).toBe(true);
    expect(board.blackCanCastleLong).toBe(true);
    expect(board.whiteMaterial).toBe(39);
    expect(board.blackMaterial).toBe(39);
    expect(board.whiteName).toBe("Alice");
    expect(board.blackName).toBe("Bob");
    expect(board.gameNumber).toBe(42);
    expect(board.verboseMove).toBe("none");
  });

  test("millisecond clocks are normalized", () => {
    const board = boardFromInitialEvent({
      ...STARTING_EVENT,
      clock: { initial: 300000, increment: 3000 },
    });

    expect(board.initialTimeSeconds).toBe(300);
    expect(board.incrementSeconds).toBe(3);
  });

  test("move event updates position, notation, time, and FEN", () => {
    const afterE4 = boardFromMoveEvent(boardFromInitialEvent(STARTING_EVENT), E4_EVENT);

    expect(afterE4.activeColor).toBe("B");
    expect(afterE4.doublePawnPushFile).toBe(4);
    expect(afterE4.ranks[4]).toBe("----P---");
    expect(afterE4.ranks[6]).toBe("PPPP-PPP");
    expect(afterE4.verboseMove).toBe("P/e2-e4");
    expect(afterE4.prettyMove).toBe("e4");
    expect(afterE4.timeTaken).toBe("(0:05)");
    expect(boardStateToFen(afterE4)).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    );
  });

  test("knight move and fullmove updates match SAN", () => {
    const afterE4 = boardFromMoveEvent(boardFromInitialEvent(STARTING_EVENT), E4_EVENT);
    const afterE5 = boardFromMoveEvent(afterE4, E5_EVENT);
    const afterNf3 = boardFromMoveEvent(afterE5, NF3_EVENT);

    expect(afterE5.fullmoveNumber).toBe(2);
    expect(afterNf3.verboseMove).toBe("N/g1-f3");
    expect(afterNf3.prettyMove).toBe("Nf3");
  });

  test("castling verbose notation is preserved", () => {
    const pre = boardFromInitialEvent({
      id: "cast01",
      players: { white: { user: { name: "W" } }, black: { user: { name: "B" } } },
      clock: { initial: 300, increment: 0 },
      fen: "rnbqkbnr/pppppppp/8/8/8/5NP1/PPPPPPBP/RNBQK2R w KQkq - 4 3",
    });

    const post = boardFromMoveEvent(pre, {
      fen: "rnbqkbnr/pppppppp/8/8/8/5NP1/PPPPPPBP/RNBQ1RK1 b kq - 5 3",
      lm: "e1g1",
      wc: 290,
      bc: 300,
    });

    expect(post.verboseMove).toBe("o-o");
    expect(post.prettyMove).toBe("O-O");
  });
});

describe("board formatting", () => {
  test("formatBoard dispatches style 12, style 1, and fallback", () => {
    const board = boardFromInitialEvent(STARTING_EVENT);

    expect(formatBoard(board, "12").startsWith("<12>")).toBe(true);
    expect(formatBoard(board, "1")).toContain("Game 1");
    expect(formatBoard(board, "99").startsWith("<12>")).toBe(true);
  });

  test("style 12 field layout matches reference", () => {
    const board: BoardState = {
      ranks: [
        "rnbqkb-r",
        "pppppppp",
        "-----n--",
        "--------",
        "----P---",
        "--------",
        "PPPPKPPP",
        "RNBQ-BNR",
      ],
      activeColor: "B",
      doublePawnPushFile: -1,
      whiteCanCastleShort: false,
      whiteCanCastleLong: false,
      blackCanCastleShort: true,
      blackCanCastleLong: true,
      irreversibleMoveCount: 0,
      fullmoveNumber: 2,
      gameNumber: 7,
      whiteName: "Newton",
      blackName: "Einstein",
      relation: 1,
      initialTimeSeconds: 2,
      incrementSeconds: 12,
      whiteMaterial: 39,
      blackMaterial: 39,
      whiteTime: 119,
      blackTime: 122,
      verboseMove: "K/e1-e2",
      timeTaken: "(0:06)",
      prettyMove: "Ke2",
      flip: false,
    };

    expect(formatStyle12(board)).toBe(
      "<12> rnbqkb-r pppppppp -----n-- -------- ----P--- -------- " +
        "PPPPKPPP RNBQ-BNR B -1 0 0 1 1 0 7 Newton Einstein " +
        "1 2 12 39 39 119 122 2 K/e1-e2 (0:06) Ke2 0 1\n",
    );
  });

  test("style 1 contains board, clocks, and last move", () => {
    const afterE4 = boardFromMoveEvent(boardFromInitialEvent(STARTING_EVENT), E4_EVENT);
    const output = formatStyle1(afterE4);

    expect(output).toContain("Game 1 (Alice vs. Bob)");
    expect(output).toContain("| *R|");
    expect(output).toContain("| P |");
    expect(output).toContain("White Moves : 'e4     (0:05)'");
    expect(output).toContain("Black Clock : 5:00");
    expect(output).toContain("White Clock : 4:55");
    expect(output.endsWith("\n")).toBe(true);
  });
});
