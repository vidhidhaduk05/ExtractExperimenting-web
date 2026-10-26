import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CitationTelephonePage } from './CitationTelephonePage';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: {
  auditCitationTelephoneText: vi.fn(),
  uploadCitationTelephoneManuscript: vi.fn(),
  evaluateCitationTelephoneClaim: vi.fn(),
} }));

beforeEach(() => vi.clearAllMocks());

describe('Citation Telephone live workflow', () => {
  it('starts without a fabricated trace and requires a source passage', () => {
    render(<MemoryRouter><CitationTelephonePage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Compare passage' })).toBeDisabled();
    expect(screen.queryByText(/Traced to origin/)).not.toBeInTheDocument();
  });

  it('does not pass extracted bibliography entries as source text', async () => {
    vi.mocked(api.auditCitationTelephoneText).mockResolvedValue({
      claims: [{ sentenceIndex: 0, citingSentence: 'Treatment helped [1].', refNumber: 1, refText: 'Smith. Paper title.' }],
      references: { 1: 'Smith. Paper title.' }, totalClaimsFound: 1, totalReferencesFound: 1,
    });
    render(<MemoryRouter><CitationTelephonePage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Manuscript text'), { target: { value: 'Treatment helped [1].' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract citations' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Compare this claim with source text' }));
    expect(screen.getByLabelText('Citing claim')).toHaveValue('Treatment helped [1].');
    expect(screen.getByLabelText('Actual source passage')).toHaveValue('');
    expect(api.evaluateCitationTelephoneClaim).not.toHaveBeenCalled();
  });

  it('reports backend failure without presenting an evaluation', async () => {
    vi.mocked(api.evaluateCitationTelephoneClaim).mockRejectedValue(new Error('Co-Scientist service is currently unavailable'));
    render(<MemoryRouter><CitationTelephonePage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Citing claim'), { target: { value: 'Treatment helped.' } });
    fireEvent.change(screen.getByLabelText('Actual source passage'), { target: { value: 'No difference was observed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare passage' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Co-Scientist service is currently unavailable');
    expect(api.evaluateCitationTelephoneClaim).toHaveBeenCalledWith('Treatment helped.', 'No difference was observed.', '');
    expect(screen.queryByText('Matches Source')).not.toBeInTheDocument();
  });
});
