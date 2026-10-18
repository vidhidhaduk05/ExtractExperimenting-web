import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ExportPage } from './ExportPage';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { exportReferences: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

function showExport() {
  render(<MemoryRouter initialEntries={['/projects/p/export']}><Routes>
    <Route path='/projects/:projectId/export' element={<ExportPage />} />
  </Routes></MemoryRouter>);
}

it('downloads included studies as a .bib attachment and releases the object URL', async () => {
  vi.mocked(api.exportReferences).mockResolvedValue(new Blob(['@article{ref, title={Test}}']));
  let filename = '';
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { filename = this.download; });
  showExport();
  fireEvent.click(screen.getByRole('button', { name: 'Download included studies (.bib)' }));
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(api.exportReferences).toHaveBeenCalledWith('p', 'bibtex', 'included');
  expect(filename).toBe('included_references_p.bib');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  click.mockRestore();
});

it('shows failures and permits retry without downloading an error response', async () => {
  vi.mocked(api.exportReferences).mockRejectedValue(new Error('No included studies found'));
  showExport();
  fireEvent.click(screen.getByRole('button', { name: 'Download included studies (.bib)' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No included studies found');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Download included studies (.bib)' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Download included studies (.bib)' }));
  await waitFor(() => expect(api.exportReferences).toHaveBeenCalledTimes(2));
});
