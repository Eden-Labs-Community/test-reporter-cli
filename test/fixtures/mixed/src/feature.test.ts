import { describe, expect, test } from "vitest";

describe("feature", () => {
  test("works", () => {
    expect(true).toBe(true);
  });

  test.skip("is broken", () => {
    expect(2).toBe(5);
  });

  test.skip("not ready yet", () => {
    expect(1).toBe(1);
  });
});
