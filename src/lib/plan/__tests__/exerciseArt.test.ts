import { describe, expect, it } from "vitest";
import { EXERCISE_ART } from "../exerciseArt";
import { ROUTINES, routineForDescription } from "../strength";

describe("exercise art", () => {
  it("has a figure for every routine exercise", () => {
    for (const routine of ROUTINES) {
      for (const ex of routine.exercises) {
        expect(EXERCISE_ART[ex.id], `missing art for ${ex.id}`).toBeDefined();
      }
    }
  });

  it("keeps pose B structurally identical to pose A (needed for path interpolation)", () => {
    for (const [id, art] of Object.entries(EXERCISE_ART)) {
      if (!art.poseB) continue;
      expect(Object.keys(art.poseB.parts).sort(), `${id}: part names differ`).toEqual(
        Object.keys(art.poseA.parts).sort(),
      );
      for (const [name, pts] of Object.entries(art.poseA.parts)) {
        expect(art.poseB.parts[name].length, `${id}/${name}: point count differs`).toBe(pts.length);
      }
    }
  });

  it("keeps every point inside the shared viewBox", () => {
    for (const [id, art] of Object.entries(EXERCISE_ART)) {
      for (const pose of [art.poseA, art.poseB]) {
        if (!pose) continue;
        const points = [pose.head, ...Object.values(pose.parts).flat()];
        for (const [x, y] of points) {
          expect(x, `${id}: x out of bounds`).toBeGreaterThanOrEqual(0);
          expect(x, `${id}: x out of bounds`).toBeLessThanOrEqual(120);
          expect(y, `${id}: y out of bounds`).toBeGreaterThanOrEqual(0);
          expect(y, `${id}: y out of bounds`).toBeLessThanOrEqual(90);
        }
      }
    }
  });
});

describe("routineForDescription", () => {
  it("matches every stored routine description back to its routine", () => {
    for (const routine of ROUTINES) {
      expect(routineForDescription(routine.description)).toBe(routine);
    }
  });

  it("returns null for edited or missing descriptions", () => {
    expect(routineForDescription("My own gym session")).toBeNull();
    expect(routineForDescription(null)).toBeNull();
    expect(routineForDescription("")).toBeNull();
  });
});
