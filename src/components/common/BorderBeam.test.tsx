import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BorderBeam } from "./BorderBeam";
import { Card, CardHeader, CardTitle, CardContent } from "./Card";

describe("BorderBeam and Card", () => {
  it("renders wrapped Card with active={false} without rotating beam", () => {
    const { container } = render(
      <BorderBeam active={false}>
        <Card data-testid="test-card">
          <CardHeader>
            <CardTitle>Test Title</CardTitle>
          </CardHeader>
          <CardContent>Content</CardContent>
        </Card>
      </BorderBeam>
    );

    expect(screen.getByTestId("test-card")).toBeTruthy();
    expect(screen.getByText("Test Title")).toBeTruthy();
    expect(screen.getByText("Content")).toBeTruthy();

    const overlay = container.querySelector('[data-testid="border-beam-overlay"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.getAttribute("data-active")).toBe("false");
    expect(overlay?.classList.contains("opacity-0")).toBe(true);

    const rotator = container.querySelector('[data-testid="border-beam-rotator"]');
    expect(rotator).toBeNull();
  });

  it("renders with active={true} and active rotating beam", () => {
    const { container } = render(
      <BorderBeam active={true} colorFrom="#814d75" colorTo="#ffdea6">
        <Card>Active Beam Content</Card>
      </BorderBeam>
    );

    const overlay = container.querySelector('[data-testid="border-beam-overlay"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.getAttribute("data-active")).toBe("true");

    const rotator = container.querySelector('[data-testid="border-beam-rotator"]');
    expect(rotator).toBeTruthy();
  });

  it("renders standalone BorderBeam overlay when used without children", () => {
    const { container } = render(
      <div className="relative">
        <BorderBeam active={true} />
        <div>Standalone Card Body</div>
      </div>
    );

    expect(screen.getByText("Standalone Card Body")).toBeTruthy();
    const rotator = container.querySelector('[data-testid="border-beam-rotator"]');
    expect(rotator).toBeTruthy();
  });

  it("renders Card with paper and editorial variants conforming to Master Theme", () => {
    const { container, rerender } = render(
      <Card variant="paper">Paper Surface</Card>
    );
    expect(container.firstChild).toHaveClass("bg-[#fbf9f4]");

    rerender(<Card variant="editorial">Editorial Surface</Card>);
    expect(container.firstChild).toHaveClass("border-[#814d75]/30");
  });
});
