// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
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

  it("renders the shell regions: rail, top chrome bar, center work area, and dock", () => {
    renderWithProviders(["/projects"]);

    // Center work area rendered
    expect(screen.getByText("Projects Work Area")).toBeDefined();

    // Chrome tab for All Projects
    const stageTabs = screen.getByLabelText("Stage Navigation Tabs");
    expect(within(stageTabs).getByText("All Projects")).toBeDefined();

    // Left Rail navigation items: Folder Hub, Study List, Evidence Map
    expect(screen.getByLabelText("All Projects Menu")).toBeDefined();
    expect(screen.getByTitle("Study List")).toBeDefined();
    expect(screen.getByTitle("Evidence Map")).toBeDefined();

    // Right Dock tabs
    expect(screen.getByText("Checklist")).toBeDefined();
    expect(screen.getByText("Results")).toBeDefined();
  });

  it("opens the Folder popover with only All Projects on click", () => {
    renderWithProviders(["/projects/test-proj-456/studies"]);

    const folderButton = screen.getByLabelText("All Projects Menu");
    fireEvent.click(folderButton);

    // Popover dialog opened with only All Projects
    const popover = screen.getByRole("dialog", { name: "All Projects Menu" });
    expect(popover).toBeDefined();
    expect(within(popover).getByText("All Projects")).toBeDefined();
    expect(within(popover).queryByText("Study List")).toBeNull();
    expect(within(popover).queryByText("Evidence Map")).toBeNull();
  });

  it("navigates to landing page when clicking the R monogram logo", () => {
    renderWithProviders(["/projects/test-proj-456/studies"]);

    const brandLink = screen.getByLabelText("RadExtract Landing Page");
    expect(brandLink.getAttribute("href")).toBe("/");
  });

  it("renders all Chrome stage navigation tabs when in a project", () => {
    renderWithProviders(["/projects/test-proj-456/extraction-sheet"]);

    // Chrome stage tabs rendered inside Stage Navigation Tabs container
    const stageTabs = screen.getByLabelText("Stage Navigation Tabs");
    expect(within(stageTabs).getByText("Overview")).toBeDefined();
    expect(within(stageTabs).getByText("Deduplication")).toBeDefined();
    expect(within(stageTabs).getByText("Abstract Screening")).toBeDefined();
    expect(within(stageTabs).getByText("Full-Text Screening")).toBeDefined();
    expect(within(stageTabs).getByText("PDF Extraction")).toBeDefined();
    expect(within(stageTabs).getByText("Extraction Sheet")).toBeDefined();
    expect(within(stageTabs).getByText("Risk of Bias")).toBeDefined();
    expect(within(stageTabs).getByText("Synthesis")).toBeDefined();
    expect(within(stageTabs).getByText("GRADE")).toBeDefined();
    expect(within(stageTabs).getByText("PRISMA")).toBeDefined();
    expect(within(stageTabs).getByText("Export")).toBeDefined();

    // Breadcrumb / Omnibox contains project title and stage name
    expect(screen.getByText(/Project test-pro/i)).toBeDefined();
  });
});
