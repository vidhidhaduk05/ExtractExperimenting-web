import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { api, API_BASE } from './api';
import { DEMO_PROJECT, DEMO_STUDIES, DEMO_PRISMA, DEMO_SCREENING_SUMMARY, DEMO_REVIEW_MATRIX } from './demoData';

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
      (global.fetch as Mock).mockRejectedValueOnce(new Error('Network error'));

      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await api.listProjects();

      expect(spy).toHaveBeenCalledWith('[Demo Preview Mode] Serving demo data for: /projects');
      expect(result).toEqual([DEMO_PROJECT]);

      spy.mockRestore();
    });

    it('should fallback to DEMO_STUDIES when fetch fails for /studies', async () => {
      (global.fetch as Mock).mockRejectedValueOnce(new Error('Network error'));
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await api.listStudies('proj-123');

      expect(spy).toHaveBeenCalled();
      expect(result).toEqual(DEMO_STUDIES);

      spy.mockRestore();
    });

    it('should throw an error when fetch fails and no fallback is available', async () => {
      (global.fetch as Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(api.health()).rejects.toThrow('Network error');
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

    it('should throw an error for HTTP errors if no fallback available', async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ detail: 'Custom error message' }),
      });

      await expect(api.health()).rejects.toThrow('Custom error message');
    });
  });
});
