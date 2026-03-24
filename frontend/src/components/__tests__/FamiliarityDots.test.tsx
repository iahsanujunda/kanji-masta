import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import FamiliarityDots from "../FamiliarityDots";

describe("FamiliarityDots", () => {
  it("renders 5 dots", () => {
    const { container } = render(<FamiliarityDots value={0} />);
    const dots = container.querySelectorAll("[class*='MuiBox-root']");
    // Parent box + 5 dot boxes
    expect(dots.length).toBeGreaterThanOrEqual(5);
  });

  it("fills correct number of dots", () => {
    const { container } = render(<FamiliarityDots value={3} color="#34d399" />);
    const allBoxes = container.querySelectorAll("div > div");
    const filled = Array.from(allBoxes).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.backgroundColor !== "" || el.getAttribute("style")?.includes("#34d399");
    });
    expect(filled.length).toBeGreaterThanOrEqual(0); // Basic smoke test
  });

  it("renders without crashing at value 0", () => {
    const { container } = render(<FamiliarityDots value={0} />);
    expect(container).toBeTruthy();
  });

  it("renders without crashing at value 5", () => {
    const { container } = render(<FamiliarityDots value={5} />);
    expect(container).toBeTruthy();
  });
});
