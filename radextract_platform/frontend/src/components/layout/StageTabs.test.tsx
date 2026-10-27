// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, afterEach } from 'vitest';
import { StageTabs } from './StageTabs';

describe('StageTabs Component', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  afterEach(() => {
    cleanup();
  });

  const renderWithProviders = (initialEntries = ['/projects/test-proj-123/screening']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/projects/:projectId/*" element={<StageTabs />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders all tabs in review order: Protocol · Studies · Screening · Extraction · RoB · GRADE · Meta · Export', () => {
    renderWithProviders(['/projects/test-proj-123/studies']);

    const nav = screen.getByRole('navigation', { name: /Review Workflow Stages/i });
    expect(nav).toBeInTheDocument();

    const expectedOrder = ['Protocol', 'Studies', 'Screening', 'Extraction', 'RoB', 'GRADE', 'Meta', 'Export'];
    const textContent = nav.textContent || '';

    // Verify ordering
    let lastIndex = -1;
    for (const label of expectedOrder) {
      const idx = textContent.indexOf(label);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it('shows why blocked tabs are disabled', () => {
    renderWithProviders(['/projects/test-proj-123/studies']);

    // Initially with 0 studies loaded, screening/extraction/etc. show lock or blocker tooltip
    const lockedTabs = screen.getAllByTitle(/finish Title\/Abstract screening first/i);
    expect(lockedTabs.length).toBeGreaterThan(0);
    expect(lockedTabs[0]).toHaveAttribute('aria-disabled', 'true');
  });

  it('highlights the active stage tab with wine styling', () => {
    renderWithProviders(['/projects/test-proj-123/studies']);

    const studiesLink = screen.getByRole('link', { name: /^Studies$/i });
    expect(studiesLink).toBeInTheDocument();
    expect(studiesLink).toHaveClass('text-[#3a0f34]');
  });
});
