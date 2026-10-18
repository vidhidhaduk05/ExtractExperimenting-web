import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from './api';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
const decision = { project_id: 'p', decision: 'maybe', stage: 'ta' };

it('rejects anonymous writes without sending a request or fabricating demo success', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(api.screeningDecision('s', decision)).rejects.toThrow('Sign in');
  expect(fetch).not.toHaveBeenCalled();
});

it.each([401, 403, 500])('surfaces HTTP %s rather than returning a demo decision', async status => {
  localStorage.setItem('token', 'signed-token');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ detail: 'Rejected save' }) }));
  await expect(api.screeningDecision('s', decision)).rejects.toThrow('Rejected save');
});

it('sends the authentication token and obtains the authoritative saved reviewer', async () => {
  localStorage.setItem('token', 'signed-token');
  localStorage.setItem('username', 'fake reviewer');
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reviewer_id: 'real-id', reviewer_name: 'Real reviewer' }) });
  vi.stubGlobal('fetch', fetch);
  const saved = await api.screeningDecision('s', decision);
  expect(saved.reviewer_id).toBe('real-id');
  const options = fetch.mock.calls[0][1];
  expect(options.headers.Authorization).toBe('Bearer signed-token');
  expect(JSON.parse(options.body)).not.toHaveProperty('reviewer_id');
  expect(JSON.parse(options.body)).not.toHaveProperty('reviewer_name');
});

it('never substitutes a demo identity when fetching the signed-in user fails', async () => {
  localStorage.setItem('token', 'expired-token');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: 'Session expired' }) }));
  await expect(api.getCurrentUser()).rejects.toThrow('Session expired');
});
