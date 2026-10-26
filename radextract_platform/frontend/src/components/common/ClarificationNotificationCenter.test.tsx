import { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ClarificationQuestion, type ClarificationAnswerResponse } from '../../lib/api';
import { ClarificationNotificationCenter } from './ClarificationNotificationCenter';

vi.mock('../../lib/api', () => ({ api: { listClarifications: vi.fn(), answerClarification: vi.fn() } }));

const question = (id: string, project: string): ClarificationQuestion => ({
  question_id: id, project_id: project, study_id: `study-${id}`, study_title: `Study ${id}`,
  stage: 'abstract', question_type: 'eligibility', question_text: `Does question ${id} meet the population criteria?`,
  options: [{ value: 'yes', label: 'Eligible population' }, { value: 'no', label: 'Ineligible population' }],
  context_excerpt: 'Study context', pico_aspect: 'population', ai_interim_decision: 'uncertain',
  ai_interim_confidence: 0.5, ai_interim_reason: 'Needs review', status: 'pending', created_at: '2026-10-26',
});

function Harness({ project, initiallyOpen = false }: { project: string; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const { data = [] } = useQuery({ queryKey: ['pending-clarifications', project], queryFn: () => api.listClarifications(project, 'pending') });
  return <><button aria-label={`Clarification inbox, ${data.length} pending`} onClick={() => setOpen(true)}>Inbox</button>
    <ClarificationNotificationCenter projectId={project} isDrawerOpen={open} onToggleDrawer={setOpen} /></>;
}

describe('clarification toast and persistent inbox', () => {
  let client: QueryClient;
  let project: string;
  let pending: ClarificationQuestion[];
  let history: ClarificationQuestion[];
  let sequence = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    project = `notification-project-${++sequence}`;
    pending = [question('one', project)];
    history = [];
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    vi.mocked(api.listClarifications).mockImplementation(async (_id, status) => status === 'pending' ? pending : [...pending, ...history]);
    vi.mocked(api.answerClarification).mockReset();
  });
  afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

  const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };
  const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
  const mount = async (initiallyOpen = false) => {
    const view = render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={[`/projects/${project}/screening`]}>
      <Harness project={project} initiallyOpen={initiallyOpen} />
    </MemoryRouter></QueryClientProvider></StrictMode>);
    await flush(); await flush(); return view;
  };
  const toast = () => screen.queryByRole('region', { name: 'New clarification' });
  const openInbox = async () => { fireEvent.click(screen.getByRole('button', { name: /Clarification inbox,/ })); await flush(); };

  it('announces on screening without stealing focus and minimizes after five seconds, retaining the question and badge', async () => {
    await mount();
    expect(toast()).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Clarification needed');
    expect(document.activeElement).toBe(document.body);
    expect(within(toast()!).queryByRole('radio')).not.toBeInTheDocument();
    await advance(4900);
    expect(toast()).toBeInTheDocument();
    await advance(100);
    expect(toast()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clarification inbox, 1 pending' })).toBeInTheDocument();
    await openInbox();
    expect(screen.getByRole('dialog')).toHaveTextContent(pending[0].question_text);
    await advance(30000);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.answerClarification).not.toHaveBeenCalled();
  });

  it('pauses while hovered or keyboard-focused and resumes the remaining time', async () => {
    await mount(); await advance(2000);
    fireEvent.mouseEnter(toast()!); await advance(8000);
    fireEvent.mouseLeave(toast()!);
    const review = screen.getByRole('button', { name: 'Review question' });
    act(() => review.focus()); await advance(8000);
    expect(toast()).toBeInTheDocument();
    act(() => review.blur()); await advance(2900);
    expect(toast()).toBeInTheDocument();
    await advance(100); expect(toast()).not.toBeInTheDocument();
  });

  it('counts only visibility time while the browser tab is hidden', async () => {
    await mount(); await advance(2000);
    const visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange')); await advance(10000);
    expect(toast()).toBeInTheDocument();
    visibility.mockReturnValue(false); fireEvent(document, new Event('visibilitychange'));
    await advance(3000); expect(toast()).not.toBeInTheDocument();
  });

  it('minimizes without resolving and does not repeat on polling or remount', async () => {
    const view = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Minimize clarification notification' }));
    await advance(20000); expect(toast()).not.toBeInTheDocument();
    view.unmount(); await mount(); expect(toast()).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(`clarification-announced:${project}`)!)).toEqual(['one']);
    await openInbox(); expect(screen.getByRole('dialog')).toHaveTextContent('Study one');
    expect(api.answerClarification).not.toHaveBeenCalled();
  });

  it('honors persisted announcement IDs after a reload while fetching pending questions', async () => {
    localStorage.setItem(`clarification-announced:${project}`, JSON.stringify(['one']));
    await mount(); expect(toast()).not.toBeInTheDocument();
    await openInbox(); expect(screen.getByRole('dialog')).toHaveTextContent('Study one');
  });

  it('groups simultaneous arrivals and queues later batches one at a time', async () => {
    pending = ['one', 'two', 'three'].map(id => question(id, project));
    await mount();
    expect(toast()).toHaveTextContent('3 clarifications need your review.');
    pending = [...pending, question('four', project)];
    await act(async () => { await client.invalidateQueries({ queryKey: ['pending-clarifications', project] }); });
    await flush();
    expect(screen.getAllByRole('region', { name: 'New clarification' })).toHaveLength(1);
    expect(toast()).toHaveTextContent('3 clarifications');
    await advance(5000); expect(toast()).toHaveTextContent('Study four');
    await advance(5000); expect(toast()).not.toBeInTheDocument();
  });

  it('updates an open inbox without covering it or replaying questions on close', async () => {
    await mount(true);
    pending = [...pending, question('two', project)];
    await act(async () => { await client.invalidateQueries({ queryKey: ['pending-clarifications', project] }); });
    await flush();
    expect(toast()).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Study two');
    fireEvent.click(screen.getByRole('button', { name: 'Close clarification inbox' }));
    await advance(10000); expect(toast()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clarification inbox, 2 pending' })).toBeInTheDocument();
  });

  it('opens review in the persistent inbox and restores focus on Escape', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Review question' })); await flush();
    expect(toast()).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await openInbox();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps focused notification and inbox keys away from screening shortcuts', async () => {
    const screeningShortcut = vi.fn();
    window.addEventListener('keydown', screeningShortcut);
    try {
      await mount();
      fireEvent.keyDown(screen.getByRole('button', { name: 'Review question' }), { key: '1' });
      expect(screeningShortcut).not.toHaveBeenCalled();
      await openInbox();
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'e' });
      expect(screeningShortcut).not.toHaveBeenCalled();
      expect(api.answerClarification).not.toHaveBeenCalled();
    } finally { window.removeEventListener('keydown', screeningShortcut); }
  });

  it('keeps a failed answer pending, then decrements the badge only after successful save and retains history', async () => {
    let resolveSave: (value: ClarificationAnswerResponse) => void = () => {};
    vi.mocked(api.answerClarification).mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    await mount(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Eligible population' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Decision' })); await flush(); await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('still pending');
    expect(screen.getByRole('button', { name: 'Clarification inbox, 1 pending' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Decision' })); await flush();
    expect(screen.getByRole('button', { name: 'Clarification inbox, 1 pending' })).toBeInTheDocument();
    history = [{ ...pending[0], status: 'answered', answer: 'yes', answer_label: 'Eligible population' }];
    pending = [];
    await act(async () => { resolveSave({ question_id: 'one', study_id: 'study-one', status: 'answered', final_decision: 'include', final_confidence: 1, final_reason_text: 'Confirmed', conflict_detected: false }); });
    await flush(); await flush();
    expect(screen.getByRole('button', { name: 'Clarification inbox, 0 pending' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Answered History' })); await flush();
    expect(screen.getByRole('dialog')).toHaveTextContent('Recorded Answer: Eligible population');
  });

  it('isolates announcement tracking between projects even when question IDs match', async () => {
    const view = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Minimize clarification notification' }));
    view.unmount(); project = `${project}-other`; pending = [question('one', project)];
    await mount(); expect(toast()).toBeInTheDocument();
  });

  it('does not render a resolved question waiting in the toast queue', async () => {
    await mount(); pending = [];
    await act(async () => { await client.invalidateQueries({ queryKey: ['pending-clarifications', project] }); });
    await flush(); expect(toast()).not.toBeInTheDocument();
  });
});
