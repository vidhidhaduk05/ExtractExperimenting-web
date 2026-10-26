import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClaimscapePage } from './ClaimscapePage';
import { ProjectCreate } from './ProjectCreate';
import { api } from '../lib/api';

class Observer { observe() {} disconnect() {} unobserve() {} }
global.ResizeObserver = Observer as unknown as typeof ResizeObserver;

function setup(path = '/claimscape') {
  return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>
    <MemoryRouter initialEntries={[path]}><Routes>
      <Route path='/claimscape' element={<ClaimscapePage />} />
      <Route path='/projects/new' element={<ProjectCreate />} />
      <Route path='/projects/:id/pico' element={<p>Review setup</p>} />
    </Routes></MemoryRouter>
  </QueryClientProvider>);
}

describe('ClaimScape entry and workspace handoff', () => {
  it('places the claim before the explanation and keeps filters, inventory and counts consistent', () => {
    const {container} = setup();
    expect(screen.getByLabelText('Claim statement').compareDocumentPosition(screen.getByRole('heading',{name:'How to read the evidence map'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const count = () => Number(screen.getByText(/papers mapped ·/).textContent?.match(/\d+/)?.[0]);
    const inventoryCount = () => Number(screen.getByRole('heading',{name:/Literature Inventory/}).textContent?.match(/\d+/)?.[0]);
    const initial = count();
    expect(container.querySelector('[data-tier="review"]')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Show reviews & commentary'));
    expect(container.querySelector('[data-tier="review"]')).toBeNull();
    expect(container.querySelector('[data-tier="meta"]')).not.toBeNull();
    expect(count()).toBeLessThan(initial);
    expect(inventoryCount()).toBe(count());
    const withoutReviews = count();
    fireEvent.click(screen.getByLabelText('Direct evidence only'));
    expect(count()).toBeLessThan(withoutReviews);
    expect(inventoryCount()).toBe(count());
    fireEvent.click(screen.getByLabelText('Direct evidence only'));
    fireEvent.click(screen.getByLabelText('Show reviews & commentary'));
    expect(count()).toBe(initial);
  });

  it('offers editable prefill and saves the edited hypothesis with the project', async () => {
    const create = vi.spyOn(api,'createProject').mockResolvedValue({project_id:'new-review'} as never);
    vi.spyOn(api,'updateProjectSettings').mockResolvedValue({} as never);
    setup();
    const claim = 'Exercise & diet reduce risk + improve recovery?';
    fireEvent.change(screen.getByLabelText('Claim statement'),{target:{value:claim}});
    fireEvent.click(screen.getByRole('link',{name:/Launch in Review Workspace/}));
    expect(screen.getByText(claim)).toBeInTheDocument();
    expect(screen.getByLabelText('Project Name *')).toHaveValue('');
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Use claim to prefill name and hypothesis'}));
    expect(screen.getByLabelText('Project Name *')).toHaveValue(claim);
    expect(screen.getByLabelText('Primary hypothesis')).toHaveValue(claim);
    fireEvent.change(screen.getByLabelText('Project Name *'),{target:{value:'Exercise review'}});
    fireEvent.change(screen.getByLabelText('Primary hypothesis'),{target:{value:'Edited hypothesis'}});
    fireEvent.click(screen.getByRole('button',{name:'Create Project'}));
    await waitFor(()=>expect(create).toHaveBeenCalledWith({name:'Exercise review',description:'',hypothesis:'Edited hypothesis'}));
    await screen.findByText('Review setup');
    vi.restoreAllMocks();
  });

  it('keeps normal project setup blank and retains edits after a failed save', async () => {
    vi.spyOn(api,'createProject').mockRejectedValue(new Error('Save failed'));
    setup('/projects/new');
    expect(screen.queryByText('Continue from your claim')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Primary hypothesis')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Project Name *'),{target:{value:'My review'}});
    fireEvent.change(screen.getByLabelText('Primary hypothesis'),{target:{value:'My hypothesis'}});
    fireEvent.click(screen.getByRole('button',{name:'Create Project'}));
    await screen.findByText('Error: Save failed');
    expect(screen.getByLabelText('Primary hypothesis')).toHaveValue('My hypothesis');
    vi.restoreAllMocks();
  });
});
