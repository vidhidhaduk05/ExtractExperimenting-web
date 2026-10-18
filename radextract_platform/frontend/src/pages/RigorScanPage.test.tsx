import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { RigorScanPage } from "./RigorScanPage";
import { api } from "../lib/api";
import type { RigorScanResult } from "../lib/rigorTypes";

vi.mock("../lib/api", () => ({ api: { scanPdfRigor: vi.fn(), getRigorExample: vi.fn() } }));

const result: RigorScanResult = {
  engine: "rules-fallback",
  view: {
    paper: { title: "Uploaded research manuscript", pages: 3 },
    checks: [{ id: "hypothesis", label: "Hypothesis", question: "Was a hypothesis reported?", domain: "design", polarity: "good", applies: true, p: 0.7, evidence: 0, outcome: "mid", status: "Unclear" }],
    index: 50, domains: [], gates: [], judgments: [], software: [],
    counts: { good: 0, mid: 1, bad: 0, skipped: 0 },
  },
};

beforeEach(() => vi.resetAllMocks());

function upload() {
  const file = new File(["%PDF-1.7"], "research.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Upload PDF for Rigor Scan"), { target: { files: [file] } });
  return file;
}

it("starts empty and renders a real upload response with the returned engine", async () => {
  vi.mocked(api.scanPdfRigor).mockResolvedValue(result);
  render(<MemoryRouter><RigorScanPage /></MemoryRouter>);
  expect(api.getRigorExample).not.toHaveBeenCalled();
  expect(screen.getByText(/No manuscript has been scanned yet/)).toBeInTheDocument();
  const file = upload();
  expect(await screen.findByText("Uploaded research manuscript")).toBeInTheDocument();
  expect(api.scanPdfRigor).toHaveBeenCalledWith(file);
  expect(screen.getByText("Engine: rules-fallback")).toBeInTheDocument();
  expect(screen.getByText("Uploaded Manuscript")).toBeInTheDocument();
});

it("clears previous results on a failing scan and enables retry", async () => {
  vi.mocked(api.scanPdfRigor).mockResolvedValueOnce(result).mockRejectedValueOnce(new Error("Backend unavailable"));
  render(<MemoryRouter><RigorScanPage /></MemoryRouter>);
  upload();
  await screen.findByText("Uploaded research manuscript");
  upload();
  expect(screen.queryByText("Uploaded research manuscript")).not.toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent("Backend unavailable");
  expect(screen.getByLabelText("Upload PDF for Rigor Scan")).toBeEnabled();
});

it("rejects empty server results instead of claiming a completed scan", async () => {
  vi.mocked(api.scanPdfRigor).mockResolvedValue({ view: { ...result.view, checks: [] } });
  render(<MemoryRouter><RigorScanPage /></MemoryRouter>);
  upload();
  expect(await screen.findByRole("alert")).toHaveTextContent("The server returned no reporting checks");
  expect(screen.queryByText("Uploaded research manuscript")).not.toBeInTheDocument();
});

it("disables upload and examples until the current request finishes", async () => {
  let resolveScan!: (value: RigorScanResult) => void;
  vi.mocked(api.scanPdfRigor).mockReturnValue(new Promise(resolve => { resolveScan = resolve; }));
  render(<MemoryRouter><RigorScanPage /></MemoryRouter>);
  upload();
  expect(screen.getByLabelText("Upload PDF for Rigor Scan")).toBeDisabled();
  expect(screen.getByRole("button", { name: /View reference example/ })).toBeDisabled();
  resolveScan(result);
  await waitFor(() => expect(screen.getByLabelText("Upload PDF for Rigor Scan")).toBeEnabled());
});
