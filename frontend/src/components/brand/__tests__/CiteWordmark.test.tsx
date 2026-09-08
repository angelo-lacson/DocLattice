import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { CiteWordmark } from "../CiteWordmark";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

describe("CiteWordmark", () => {
  it("renders the bracketed [DocLattice] text as inline SVG", () => {
    const { container } = render(<CiteWordmark />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "DocLattice");
    expect(svg).toHaveAttribute("viewBox", "0 0 360 80");
    expect(svg?.textContent).toBe("[DocLattice]");
  });

  it("scales width to 4.5x size to match the source viewBox aspect", () => {
    const { container } = render(<CiteWordmark size={40} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("height", "40");
    expect(svg).toHaveAttribute("width", "180");
  });

  // The dark/light split is the only conditional in the component — exercise
  // both so the ternary doesn't show up as a partial in coverage. Compare
  // against the OS_LEGAL_COLORS source-of-truth rather than re-typing the
  // hex values so the test stays in lockstep with brand-palette edits.
  it("uses the slate ink fill in the default dark variant", () => {
    const { container } = render(<CiteWordmark variant="dark" />);
    const text = container.querySelector("text");
    expect(text).toHaveStyle({ fill: OS_LEGAL_COLORS.textPrimary });
  });

  it("uses the warm-paper fill for the light variant (for navy chrome)", () => {
    const { container } = render(<CiteWordmark variant="light" />);
    const text = container.querySelector("text");
    expect(text).toHaveStyle({ fill: OS_LEGAL_COLORS.warmPaper });
  });

  it("propagates className, style, and ariaLabel onto the root SVG", () => {
    const { container } = render(
      <CiteWordmark
        className="brand-wordmark"
        style={{ opacity: 0.75 }}
        ariaLabel="DocLattice (brand)"
      />
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-label", "DocLattice (brand)");
    expect(svg).toHaveClass("brand-wordmark");
    expect(svg).toHaveStyle({ opacity: "0.75" });
  });
});
