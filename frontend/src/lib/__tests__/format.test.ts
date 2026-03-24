import { describe, expect, it } from "vitest";
import { formatTimeLeft, formatNextReview } from "../format";

describe("formatTimeLeft", () => {
  it("returns 'expired' for past dates", () => {
    expect(formatTimeLeft(new Date(Date.now() - 1000))).toBe("expired");
  });

  it("returns minutes only when less than 1 hour", () => {
    const in30min = new Date(Date.now() + 30 * 60 * 1000);
    expect(formatTimeLeft(in30min)).toMatch(/^\d+m left$/);
  });

  it("returns hours and minutes", () => {
    const in3h24m = new Date(Date.now() + (3 * 60 + 24) * 60 * 1000);
    expect(formatTimeLeft(in3h24m)).toMatch(/^3h \d+m left$/);
  });

  it("returns '0m left' for dates just about to expire", () => {
    const inSeconds = new Date(Date.now() + 30 * 1000);
    expect(formatTimeLeft(inSeconds)).toBe("0m left");
  });
});

describe("formatNextReview", () => {
  it("returns empty string for null", () => {
    expect(formatNextReview(null)).toBe("");
  });

  it("returns 'overdue' for past dates", () => {
    const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatNextReview(yesterday)).toBe("overdue");
  });

  it("returns 'today' for a few hours from now", () => {
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const result = formatNextReview(later);
    expect(["today", "tomorrow"]).toContain(result); // depends on time of day
  });

  it("returns 'tomorrow' for ~24h from now", () => {
    const tomorrow = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();
    const result = formatNextReview(tomorrow);
    expect(["tomorrow", "in 2 days"]).toContain(result); // depends on time of day
  });

  it("returns 'in N days' for future dates", () => {
    const in5days = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatNextReview(in5days)).toMatch(/^in \d+ days$/);
  });
});
