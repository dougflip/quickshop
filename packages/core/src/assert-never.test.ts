import { describe, expect, it } from "vitest";
import { assertNever } from "./assert-never.ts";

type Shape = { kind: "circle"; r: number } | { kind: "square"; side: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.r ** 2;
    case "square":
      return shape.side ** 2;
  }
}

describe("assertNever", () => {
  it("throws with the unexpected value", () => {
    // Deliberately lying to the type checker to reach the runtime path.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    expect(() => assertNever("oops" as never)).toThrow('Unexpected value: "oops"');
  });

  it("is not needed when a switch covers every variant", () => {
    expect(area({ kind: "square", side: 3 })).toBe(9);
  });
});
