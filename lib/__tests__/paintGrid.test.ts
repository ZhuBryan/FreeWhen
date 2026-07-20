import { describe, it, expect } from "vitest";
import { blocksToCells, cellsToBlocks } from "@/components/WeekPaintGrid";
import { DAY_START, DAY_END, SLOT, slotsIn } from "@/lib/schedule";
import type { Block } from "@/lib/types";

const SLOTS = slotsIn(DAY_START, DAY_END);

describe("cellsToBlocks", () => {
  it("merges contiguous painted cells into one block per run", () => {
    // Mon 9:00-10:30 (slots 2,3,4 from an 8:00 start) + Wed 8:00-8:30.
    const cells = new Set(["0:2", "0:3", "0:4", "2:0"]);
    expect(cellsToBlocks(cells, DAY_START, SLOTS)).toEqual([
      { day: 0, start: 540, end: 630, label: "Busy" },
      { day: 2, start: 480, end: 510, label: "Busy" },
    ]);
  });

  it("splits non-contiguous runs on the same day", () => {
    const cells = new Set(["1:0", "1:1", "1:3"]);
    const blocks = cellsToBlocks(cells, DAY_START, SLOTS);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ day: 1, start: 480, end: 540 });
    expect(blocks[1]).toMatchObject({ day: 1, start: 570, end: 600 });
  });

  it("a run reaching the last slot closes at day end", () => {
    const cells = new Set([`4:${SLOTS - 1}`]);
    expect(cellsToBlocks(cells, DAY_START, SLOTS)[0]).toMatchObject({
      day: 4,
      start: DAY_END - SLOT,
      end: DAY_END,
    });
  });
});

describe("blocksToCells", () => {
  it("round-trips with cellsToBlocks", () => {
    const blocks: Block[] = [
      { day: 0, start: 540, end: 630, label: "Busy" },
      { day: 6, start: 480, end: 510, label: "Busy" },
    ];
    const cells = blocksToCells(blocks, DAY_START, SLOTS);
    expect(cellsToBlocks(cells, DAY_START, SLOTS)).toEqual(blocks);
  });

  it("skips dated one-offs and clamps to the visible window", () => {
    const cells = blocksToCells(
      [
        { day: 0, start: 540, end: 600, label: "X", date: "2026-07-13" },
        { day: 1, start: 0, end: 510, label: "Early" }, // starts before 8 AM
      ],
      DAY_START,
      SLOTS,
    );
    // Dated block ignored; early block clamped to 8:00-8:30 (slot 0 only).
    expect([...cells]).toEqual(["1:0"]);
  });
});
