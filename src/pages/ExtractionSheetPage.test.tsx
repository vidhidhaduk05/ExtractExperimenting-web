import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExtractionSheetPage } from './ExtractionSheetPage';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    getExtractionGrid: vi.fn(),
    batchUpdateExtractions: vi.fn(),
    updateExtraction: vi.fn(),
    exportTemplateUrl: vi.fn((pid) => `/mock/export/template-${pid}.xlsx`),
    exportProjectXlsxUrl: vi.fn((pid) => `/mock/export/project-${pid}.xlsx`),
  },
}));

const mockGridData = {
  project_id: 'proj1',
  variables: [
    { variable_id: 'v1_vessel_involved', name: 'Year', section: 'Bibliographic', field_type: 'numeric', order_index: 0 },
    { variable_id: 'v2_author', name: 'Author', section: 'Bibliographic', field_type: 'text', order_index: 1 },
  ],
  studies: [
    { study_id: 's1', study_label: 'Smith 2024', title: 'Study of PAM', authors: 'Smith et al.', publication_year: 2024 },
  ],
  cells: {
    s1: {
      v1_vessel_involved: { extraction_id: 'e1', value: '2024', confidence: 0.98, is_verified: false },
      v2_author: { extraction_id: 'e2', value: 'Smith et al.', confidence: 0.97, is_verified: false },
    },
  },
};

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
  vi.mocked(api.getExtractionGrid).mockResolvedValue(mockGridData as any);
  vi.mocked(api.batchUpdateExtractions).mockResolvedValue({ saved_count: 2, skipped_verified_count: 0, failed_count: 0, details: [] });
  vi.mocked(api.updateExtraction).mockResolvedValue({ status: 'ok' });
  vi.mocked(api.exportTemplateUrl).mockReturnValue('/mock/export/template.xlsx');
  vi.mocked(api.exportProjectXlsxUrl).mockReturnValue('/mock/export/project.xlsx');
});

it('renders extraction spreadsheet workspace and export links', async () => {
  renderPage();

  expect(await screen.findByText(/Extraction Spreadsheet Workspace/i)).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /Blank Template/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Completed Results/i })).toBeInTheDocument();
});

it('prefills bibliographic metadata across unverified cells', async () => {
  renderPage();

  expect(await screen.findByText(/Extraction Spreadsheet Workspace/i)).toBeInTheDocument();
  await screen.findByText('Smith 2024');

  const prefillBtn = screen.getByRole('button', { name: /Prefill Metadata/i });
  fireEvent.click(prefillBtn);

  await waitFor(() => {
    expect(api.batchUpdateExtractions).toHaveBeenCalledWith('proj1', expect.arrayContaining([
      expect.objectContaining({ study_id: 's1', verification_status: 'verified' }),
    ]));
  });
});
