import React from "react";
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
    expect(screen.getByText(/SENIOR MODE:/i)).toBeTruthy();
  });

  it("activates Senior Mode on one click and reveals transparent Co-Scientist process trace", () => {
    render(<ExploratoryScreeningView />);

    const seniorButton = screen.getAllByRole("button", { name: /SENIOR MODE:/i })[0];
    expect(seniorButton).toBeTruthy();

    // Click Senior Mode
    fireEvent.click(seniorButton);

    // Prompt banner should not be visible per user instruction
    expect(screen.queryByText(/Senior Clinician View Active:/i)).toBeNull();

    // SHOW PROCESS trace (Rose Section 2) should automatically activate
    expect(screen.getByText(/Co-Scientist Reasoning Trace/i)).toBeTruthy();
    expect(screen.getByText(/Step 1 — Ingestion:/i)).toBeTruthy();
  });

  it("supports discrete toggle between Rose Cards and Heatmap view in left panel", () => {
    render(<ExploratoryScreeningView />);

    const heatmapBtn = screen.getAllByRole("button", { name: /Heatmap/i })[0];
    expect(heatmapBtn).toBeTruthy();

    fireEvent.click(heatmapBtn);

    const cardsBtn = screen.getAllByRole("button", { name: /Cards/i })[0];
    expect(cardsBtn).toBeTruthy();
    fireEvent.click(cardsBtn);
  });

  it("allows clinician to record screening decision for the selected study", async () => {
    const handleScreen = vi.fn().mockResolvedValue({ status: "success" });
    render(<ExploratoryScreeningView onScreenStudy={handleScreen} />);

    // Click Include (Keep)
    const includeBtn = screen.getAllByRole("button", { name: /Include \(Keep\)/i })[0];
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

    const backButton = screen.getAllByRole("button", { name: /Back to Standard Workspace/i })[0];
    expect(backButton).toBeTruthy();
    fireEvent.click(backButton);
    expect(handleSwitch).toHaveBeenCalledTimes(1);
  });

  it("renders 6 KPI boxes matching Velvet Editorial standard", () => {
    render(<ExploratoryScreeningView />);

    expect(screen.getAllByText("TOTAL PAPERS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JUDGMENTS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("INCLUDED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("UNCERTAIN").length).toBeGreaterThan(0);
    expect(screen.getAllByText("EXCLUDED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DECISION RATE").length).toBeGreaterThan(0);
  });

  it("removes the bar when a PICO element like comparator is not given", () => {
    const studyWithoutComparator = [
      {
        study_id: "ST-01",
        title: "Single arm trial of drug X",
        abstract: "In patients with disease Y, drug X achieved remission.",
        pico_population: "patients with disease Y",
        pico_intervention: "drug X",
        pico_comparator: "", // NOT GIVEN
        pico_outcome: "remission",
        pico_p_score: 85,
        pico_i_score: 90,
        pico_c_score: 0,
        pico_o_score: 80,
        ai_confidence: 0.88,
        screening_status: "pending",
      } as any,
    ];

    render(<ExploratoryScreeningView projectStudies={studyWithoutComparator} />);

    // P and I and O should be present
    expect(screen.getAllByText("P — Population").length).toBeGreaterThan(0);
    expect(screen.getAllByText("I — Intervention").length).toBeGreaterThan(0);
    expect(screen.getAllByText("O — Outcome").length).toBeGreaterThan(0);

    // C — Comparator MUST NOT BE IN THE DOCUMENT (removed because not given)
    expect(screen.queryByText("C — Comparator")).toBeNull();
  });
});
