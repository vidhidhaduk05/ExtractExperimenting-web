import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect } from 'vitest';
import { AppLayout } from './AppLayout';

describe('AppLayout Component', () => {
  const queryClient = new QueryClient();

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
    expect(screen.getByText('RadExtract')).toBeInTheDocument();
    expect(screen.getByText('RadExtract Platform')).toBeInTheDocument(); // In top bar
  });

  it('renders global navigation links', () => {
    renderWithProviders(<AppLayout />);

    // Using getAllByText or finding by role if needed, but simple getByText should work for these
    expect(screen.getByRole('link', { name: /Projects/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Code Graph/i })).toBeInTheDocument();
  });

  it('renders project-specific navigation links when projectId is in URL', () => {
    const projectId = 'test-project-123';
    renderWithProviders(<AppLayout />, [`/projects/${projectId}`]);

    expect(screen.getByText('Current Project')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PICO & Hypothesis/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Studies/i })).toBeInTheDocument();

    // Top bar should show project ID
    expect(screen.getByText(`Project: ${projectId.substring(0, 20)}`)).toBeInTheDocument();
  });

  it('does not render project-specific navigation links when no projectId', () => {
    renderWithProviders(<AppLayout />, ['/projects']);

    expect(screen.queryByText('Current Project')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Dashboard/i })).not.toBeInTheDocument();
  });
});
