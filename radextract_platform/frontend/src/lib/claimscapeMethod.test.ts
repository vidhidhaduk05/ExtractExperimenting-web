import { describe, it, expect } from "vitest";
import { computeSwarmY } from "./claimscapeMethod";

describe("computeSwarmY algorithm optimization test suite", () => {
  it("handles empty inputs", () => {
    expect(computeSwarmY([])).toEqual([]);
  });

  it("assigns y=0 for a single point", () => {
    expect(computeSwarmY([100])).toEqual([0]);
  });

  it("places isolated points far apart at y=0", () => {
    const xPositions = [10, 100, 200, 300];
    const offsets = computeSwarmY(xPositions);
    expect(offsets).toEqual([0, 0, 0, 0]);
  });

  it("stacks overlapping points vertically without collision", () => {
    const xPositions = [10, 10.1, 10.2];
    const offsets = computeSwarmY(xPositions);
    expect(offsets.length).toBe(3);
    // First point should be at y=0
    expect(offsets[0]).toBe(0);
    // Overlapping points should be pushed away vertically (|y| > 0)
    expect(Math.abs(offsets[1])).toBeGreaterThan(10);
    expect(Math.abs(offsets[2])).toBeGreaterThan(10);
  });

  it("preserves original index ordering in output array regardless of x sort order", () => {
    const xPositions = [50, 10, 10.1];
    const offsets = computeSwarmY(xPositions);
    expect(offsets.length).toBe(3);
    // Position 1 (x=10) should be at y=0, Position 2 (x=10.1) should offset, Position 0 (x=50) should be at y=0
    expect(offsets[0]).toBe(0); // x=50 isolated
    expect(offsets[1]).toBe(0); // x=10 first in swarm cluster
    expect(Math.abs(offsets[2])).toBeGreaterThan(10); // x=10.1 stacked
  });
});
