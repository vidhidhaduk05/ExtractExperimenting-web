import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExploratoryScreeningView } from "./ExploratoryScreeningView";

describe("ExploratoryScreeningView", () => {
  it("renders with exact original Rose title and 5 prominent screening controls", () => {
    render(<ExploratoryScreeningView />);

    expect(screen.getByText(/steal the/i)).toBeTruthy();
    expect(screen.getByText(/whole literature/i)).toBeTruthy();

    // Check the 5 toggles
    expect(screen.getByText(/LIVE STREAM:/i)).toBeTruthy();
    expect(screen.getByText(/SHOW PROCESS:/i)).toBeTruthy();
    expect(screen.getByText(/PICO HIGHLIGHTS:/i)).toBeTruthy();
    expect(screen.getByText(/FAST MODE:/i)).toBeTruthy();
    expect(screen.getByText(/READING COMFORT MODE:/i)).toBeTruthy();
  });

  it("activates READING COMFORT MODE on one click and reveals transparent AI Reviewer process trace", () => {
    render(<ExploratoryScreeningView />);

    const seniorButton = screen.getByRole("button", { name: /READING COMFORT MODE:/i });
    expect(seniorButton).toBeTruthy();

    // Click READING COMFORT MODE
    fireEvent.click(seniorButton);

    // Prompt banner should not be visible per user instruction
    expect(screen.queryByText(/Senior Clinician View Active:/i)).toBeNull();

    // SHOW PROCESS trace (Rose Section 2) should automatically activate
    expect(screen.getByText(/AI Reviewer Reasoning Trace/i)).toBeTruthy();
    expect(screen.getByText(/Step 1 — Ingestion:/i)).toBeTruthy();
  });

  it("supports discrete toggle between Rose Cards and Heatmap view in left panel", () => {
    render(<ExploratoryScreeningView />);

    const heatmapBtn = screen.getByRole("button", { name: /Heatmap/i });
    expect(heatmapBtn).toBeTruthy();

    fireEvent.click(heatmapBtn);

    const cardsBtn = screen.getByRole("button", { name: /Cards/i });
    expect(cardsBtn).toBeTruthy();
    fireEvent.click(cardsBtn);
  });

  it("allows clinician to record screening decision for the selected study", async () => {
    const handleScreen = vi.fn().mockResolvedValue({ status: "success" });
    render(<ExploratoryScreeningView onScreenStudy={handleScreen} />);

    // Click Include (Keep)
    const includeBtn = screen.getByRole("button", { name: /Include \(Keep\)/i });
    expect(includeBtn).toBeTruthy();

    fireEvent.click(includeBtn);

    await waitFor(() => {
      expect(handleScreen).toHaveBeenCalledTimes(1);
      expect(handleScreen).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: "included",
        })
      );
    });
  });

  it("supports switching back to the standard workspace", () => {
    const handleSwitch = vi.fn();
    render(<ExploratoryScreeningView onSwitchToStandard={handleSwitch} />);

    const backButton = screen.getByRole("button", { name: /Back to Standard Workspace/i });
    expect(backButton).toBeTruthy();
    fireEvent.click(backButton);
    expect(handleSwitch).toHaveBeenCalledTimes(1);
  });

  it("renders 6 KPI boxes matching Academic Editorial standard", () => {
    render(<ExploratoryScreeningView />);

    expect(screen.getByText("TURN / PAPERS")).toBeTruthy();
    expect(screen.getByText("JUDGMENTS")).toBeTruthy();
    expect(screen.getAllByText("INCLUDED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("UNCERTAIN").length).toBeGreaterThan(0);
    expect(screen.getAllByText("EXCLUDED").length).toBeGreaterThan(0);
    expect(screen.getByText("JUDG / SEC")).toBeTruthy();
  });
});
