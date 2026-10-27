import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { api, API_BASE } from './api';

// Fixtures defined IN this test file — the app has no demo data module.
const FIXTURE_PROJECT = {
  project_id: 'proj_fixture_1',
  name: 'Fixture Project',
  description: '',
  pico_json: '{}',
  hypothesis: '',
  research_question: '',
  created_at: '2026-01-01T00:00:00Z',
};

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

  describe('Endpoint Resolution and loud failures', () => {
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

    it.each([
      ["projects", () => api.listProjects()],
      ["studies", () => api.listStudies("proj-123")],
      ["health", () => api.health()],
    ])("rejects failed live %s requests instead of returning fake results", async (_name, call) => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
      await expect(call()).rejects.toThrow("Network error");
    });

    it("propagates backend validation errors", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false, status: 400, json: async () => ({ detail: "Custom error message" }),
      });
      await expect(api.listProjects()).rejects.toThrow("Custom error message");
    });

    it("never returns fabricated projects on any failure mode", async () => {
      // 404
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false, status: 404, json: async () => ({ detail: "Not found" }),
      });
      await expect(api.getProject("proj_real")).rejects.toThrow();
      // network failure
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
      await expect(api.getProject("proj_real")).rejects.toThrow("Network error");
    });

    it("sends feature uploads to the configured backend without a JSON content type", async () => {
      localStorage.setItem("custom_api_base", "https://backend.example/api");
      localStorage.setItem("token", "test-token");
      (global.fetch as Mock).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ view: {} }) });
      await api.scanPdfRigor(new File(["pdf"], "paper.pdf"));
      expect(global.fetch).toHaveBeenCalledWith("https://backend.example/api/rigor-scan/scan-pdf", expect.objectContaining({
        method: "POST", body: expect.any(FormData), headers: { Authorization: "Bearer test-token" },
      }));
    });
  });

  describe('Additional endpoints', () => {
    it("rejects failed login requests", async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
      await expect(api.login("admin", "admin")).rejects.toThrow("Network error");
    });

    it('surfaces PICO extraction failures instead of a client-side fallback', async () => {
      const file = new File(['test text'], 'test.txt', { type: 'text/plain' });
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      await expect(api.extractPico('proj-123', file)).rejects.toThrow('Network error');
    });

    it('surfaces PICO extraction HTTP errors with the backend detail', async () => {
      const file = new File(['test text'], 'test.txt', { type: 'text/plain' });
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false, status: 400, json: async () => ({ detail: 'Unsupported file type' }),
      });

      await expect(api.extractPico('proj-123', file)).rejects.toThrow('Unsupported file type');
    });

    it('should handle /export endpoints gracefully', () => {
      const url = api.exportProject('proj-123', 'csv');
      expect(url).toContain('/projects/proj-123/export?format=csv');
    });
  });
});
