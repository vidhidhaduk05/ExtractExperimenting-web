import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShimmerSkeleton } from "./ShimmerSkeleton";
import { LoaderScreen } from "./LoaderScreen";

describe("ShimmerSkeleton and LoaderScreen", () => {
  it("renders ShimmerSkeleton with correct classes and styles", () => {
    const { container } = render(
      <ShimmerSkeleton width={200} height={40} borderRadius={8} className="custom-test" />
    );
    const el = container.querySelector(".shimmer-skeleton");
    expect(el).toBeTruthy();
    expect(el?.classList.contains("custom-test")).toBe(true);
    expect(el?.getAttribute("aria-hidden")).toBe("true");
    expect((el as HTMLElement).style.width).toBe("200px");
    expect((el as HTMLElement).style.height).toBe("40px");
    expect((el as HTMLElement).style.borderRadius).toBe("8px");
  });

  it("renders circular ShimmerSkeleton with 50% border radius", () => {
    const { container } = render(<ShimmerSkeleton circle width={50} height={50} />);
    const el = container.querySelector(".shimmer-skeleton");
    expect((el as HTMLElement).style.borderRadius).toBe("50%");
  });

  it("renders LoaderScreen with requested preset and accessibility attributes", () => {
    render(<LoaderScreen preset="cards" title="Custom Loading Header" />);
    expect(screen.getByRole("status", { name: "Custom Loading Header" })).toBeTruthy();
    expect(screen.getByText("Custom Loading Header")).toBeTruthy();
  });
});
