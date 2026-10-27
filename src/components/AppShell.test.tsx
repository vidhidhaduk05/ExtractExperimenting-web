// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, afterEach } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell Component", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  afterEach(() => {
    cleanup();
  });

  const renderWithProviders = (initialEntries = ["/projects"]) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/projects" element={<div>Projects Work Area</div>} />
              <Route path="/projects/:projectId/*" element={<div>Project Detail Work Area</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("renders the 4 shell regions: rail, wine top bar, center work area, and dock", () => {
    renderWithProviders(["/projects"]);

    // Center work area rendered
    expect(screen.getByText("Projects Work Area")).toBeInTheDocument();

    // Top bar elements
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();

    // Left Rail navigation items
    expect(screen.getByTitle("Projects")).toBeInTheDocument();
    expect(screen.getByTitle("Screening")).toBeInTheDocument();
    expect(screen.getByTitle("Extraction")).toBeInTheDocument();
    expect(screen.getByTitle("Risk of Bias")).toBeInTheDocument();
    expect(screen.getByTitle("GRADE")).toBeInTheDocument();
    expect(screen.getByTitle("Meta-analysis")).toBeInTheDocument();
    expect(screen.getByTitle("PRISMA")).toBeInTheDocument();

    // Right Dock tabs
    expect(screen.getByText("To-dos")).toBeInTheDocument();
    expect(screen.getByText("Results")).toBeInTheDocument();
    expect(screen.getByText("PRISMA")).toBeInTheDocument();
  });

  it("displays project breadcrumb when projectId is present in route", () => {
    renderWithProviders(["/projects/test-proj-456/screening"]);
    expect(screen.getByText(/test-proj-456/i)).toBeInTheDocument();
  });
});
