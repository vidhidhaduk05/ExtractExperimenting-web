import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExtractionSheetPage } from './ExtractionSheetPage';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    getProject: vi.fn().mockImplementation(() => Promise.reject(new Error('Demo fallback'))),
    listVariables: vi.fn().mockImplementation(() => Promise.reject(new Error('Demo fallback'))),
    listExtractions: vi.fn().mockImplementation(() => Promise.reject(new Error('Demo fallback'))),
    listStudies: vi.fn().mockImplementation(() => Promise.reject(new Error('Demo fallback'))),
    recordExtractionDecision: vi.fn().mockResolvedValue({ status: 'ok' }),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/proj1/extraction-sheet']}>
        <Routes>
          <Route path="/projects/:projectId/extraction-sheet" element={<ExtractionSheetPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getProject).mockImplementation(() => Promise.reject(new Error('Demo fallback')));
  vi.mocked(api.listVariables).mockImplementation(() => Promise.reject(new Error('Demo fallback')));
  vi.mocked(api.listExtractions).mockImplementation(() => Promise.reject(new Error('Demo fallback')));
  vi.mocked(api.listStudies).mockImplementation(() => Promise.reject(new Error('Demo fallback')));
  vi.mocked(api.recordExtractionDecision).mockResolvedValue({ status: 'ok' } as any);

  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

it('renders extraction data sheet page and handles matrix CSV export without error', async () => {
  let filename = '';
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    filename = this.download;
  });

  renderPage();

  expect(await screen.findByText('Study Extraction Data Sheet')).toBeInTheDocument();

  const exportMatrixBtn = screen.getByRole('button', { name: /Export Matrix CSV/i });
  fireEvent.click(exportMatrixBtn);

  expect(filename).toContain('full_matrix_benchmark_studies_');
  expect(URL.createObjectURL).toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');

  click.mockRestore();
});

it('batch accepts high confidence variables concurrently with Promise.all', async () => {
  vi.mocked(api.listExtractions).mockResolvedValue([
    { extraction_id: 'e1', variable_id: 'v1_vessel_involved', value: 'Accessory MCA', confidence: 0.98, is_verified: false },
    { extraction_id: 'e2', variable_id: 'v9_associated_aneurysm', value: 'Present', confidence: 0.97, is_verified: false },
  ] as any);

  renderPage();

  expect(await screen.findByText('Study Extraction Data Sheet')).toBeInTheDocument();

  // Wait for extractions query to resolve and update state
  await screen.findByText('Accessory MCA');

  const acceptAllBtn = screen.getByRole('button', { name: /Accept All >95%/i });
  fireEvent.click(acceptAllBtn);

  await waitFor(() => expect(api.recordExtractionDecision).toHaveBeenCalledTimes(2));
});
