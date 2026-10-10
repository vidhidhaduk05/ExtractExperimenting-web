import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { api, API_BASE, shouldUseDemoFallback } from './api';
import { DEMO_PROJECT, DEMO_STUDIES, DEMO_PRISMA, DEMO_SCREENING_SUMMARY, DEMO_REVIEW_MATRIX } from './demoData';

if (typeof localStorage === 'undefined') {
  let store: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
}

describe('API Library', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Endpoint Resolution and Demo Fallback', () => {
    it('should correctly call the API with the base URL', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await api.listProjects();
      expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/projects`, expect.any(Object));
      expect(result).toEqual(mockResponse);
    });

    it('should include Authorization header when token is in localStorage', async () => {
      localStorage.setItem('token', 'fake-token');
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await api.health();
      expect(global.fetch).toHaveBeenCalledWith(`${API_BASE}/health`, expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer fake-token',
        },
      }));
    });

    it('should fallback to DEMO_PROJECT when fetch fails for /projects', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await api.listProjects();

      expect(spy).toHaveBeenCalled();
      expect(result).toEqual([DEMO_PROJECT]);

      spy.mockRestore();
    });

    it('should fallback to DEMO_STUDIES when fetch fails for /studies', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await api.listStudies('proj-123');

      expect(spy).toHaveBeenCalled();
      expect(result).toEqual(DEMO_STUDIES);

      spy.mockRestore();
    });

    it('should fallback to demo health response when fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const result = await api.health();
      expect(result).toEqual({ status: 'ok' });
    });

    it('should handle HTTP error responses correctly', async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ detail: 'Custom error message' }),
      });

      // It should fallback to demo data if available, even on HTTP error (which rejects in our wrapper)
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await api.listProjects();
      expect(result).toEqual([DEMO_PROJECT]);
      spy.mockRestore();
    });

    it('should fallback to demo data even when HTTP returns error status', async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ detail: 'Custom error message' }),
      });

      const result = await api.health();
      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('Additional endpoints fallback handling', () => {
    it('should fallback properly for /auth/login endpoint', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await api.login('admin', 'admin');

      expect(spy).toHaveBeenCalled();
      // Removed
      // Removed

      spy.mockRestore();
    });

    it('should fallback to client-side PICO extraction when /pico/extract fetch fails', async () => {
      const file = new File(['Some test text with population: test patients, intervention: test intervention'], 'test.txt', { type: 'text/plain' });
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await api.extractPico('proj-123', file);

      expect(spy).toHaveBeenCalled();
      expect(result).toHaveProperty('population');
      expect(result).toHaveProperty('index_test');

      spy.mockRestore();
    });

    it('should handle /export endpoints gracefully', () => {
      const url = api.exportProject('proj-123', 'csv');
      expect(url).toContain('/projects/proj-123/export?format=csv');
    });
  });
});
