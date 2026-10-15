import { describe, expect, it } from "vitest";

import { greet } from "../src/greeting.js";

describe("greet", () => {
  it("greets a name", () => {
    expect(greet("Rupam")).toBe("Hello, Rupam!");
  });

  it("trims surrounding whitespace", () => {
    expect(greet("  Rupam  ")).toBe("Hello, Rupam!");
  });

  it("shouts when asked", () => {
    expect(greet("Rupam", { shout: true })).toBe("HELLO, RUPAM!");
  });

  it("rejects an empty name", () => {
    expect(() => greet("   ")).toThrow("name is required");
  });
});
