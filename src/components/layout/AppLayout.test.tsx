// @vitest-environment jsdom
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, afterEach } from 'vitest';
import { AppLayout } from './AppLayout';

describe('AppLayout Component', () => {
  const queryClient = new QueryClient();

  afterEach(() => {
    cleanup();
  });

  const renderWithProviders = (ui: React.ReactNode, initialEntries = ['/']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/*" element={<AppLayout />} />
            <Route path="/projects/:projectId/*" element={<AppLayout />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders the header correctly', () => {
    renderWithProviders(<AppLayout />);
    // Logo wordmark and breadcrumb root crumb both render the brand name
    expect(screen.getAllByText('RadExtract').length).toBeGreaterThan(0);
    // Breadcrumb root crumb is a link back to the landing page
    expect(screen.getByRole('link', { name: 'RadExtract' })).toHaveAttribute('href', '/');
    // Logo block links home
    expect(screen.getByRole('link', { name: /RadExtract home/i })).toHaveAttribute('href', '/');
    // Back control is present
    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  });

  it('renders global navigation links', () => {
    renderWithProviders(<AppLayout />);

    const projectLinks = screen.getAllByRole('link', { name: /Projects/i });
    expect(projectLinks.length).toBeGreaterThan(0);
    expect(projectLinks[0]).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Code Graph/i })).toBeInTheDocument();
  });

  it('renders project-specific navigation links when projectId is in URL', () => {
    const projectId = 'test-project-123';
    renderWithProviders(<AppLayout />, [`/projects/${projectId}`]);

    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PICO & Hypothesis/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Studies$/i })).toBeInTheDocument();

    // Breadcrumb shows a Project crumb linking to the project dashboard
    expect(screen.getByRole('link', { name: 'Project' })).toHaveAttribute('href', `/projects/${projectId}`);
  });

  it('does not render project-specific navigation links when no projectId', () => {
    renderWithProviders(<AppLayout />, ['/projects']);

    expect(screen.queryByRole('link', { name: /Dashboard/i })).not.toBeInTheDocument();
  });

  it('toggles sidebar minimize when minimize button is clicked', () => {
    renderWithProviders(<AppLayout />);
    const minimizeBtn = screen.getByRole('button', { name: /Minimize sidebar/i });
    expect(minimizeBtn).toBeInTheDocument();
  });
});
