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

    it.each([
      ["projects", () => api.listProjects()],
      ["studies", () => api.listStudies("proj-123")],
      ["health", () => api.health()],
    ])("rejects failed live %s requests instead of returning demo results", async (_name, call) => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await expect(call()).rejects.toThrow("Network error");
    });

    it("propagates backend validation errors", async () => {
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false, status: 400, json: async () => ({ detail: "Custom error message" }),
      });
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await expect(api.listProjects()).rejects.toThrow("Custom error message");
    });

    it("uses demo results only after explicit opt-in", async () => {
      localStorage.setItem("demo_mode", "true");
      expect(shouldUseDemoFallback()).toBe(true);
      expect(await api.listProjects()).toEqual([DEMO_PROJECT]);
      expect(global.fetch).not.toHaveBeenCalled();
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

  describe('Additional endpoints fallback handling', () => {
    it("rejects failed login requests", async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await expect(api.login("admin", "admin")).rejects.toThrow("Network error");
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

it('retains a newly created demo project hypothesis for subsequent reads', async () => {
  localStorage.clear();
  localStorage.setItem('demo_mode', 'true');
  try {
    const project = await api.createProject({name:'Claim review',hypothesis:'A reduces B'});
    const hypothesis = await api.getHypothesis(project.project_id);
    expect(hypothesis.hypothesis).toBe('A reduces B');
    expect(JSON.parse(localStorage.getItem(`radextract_hyp_${project.project_id}`)!)).toMatchObject({hypothesis:'A reduces B'});
  } finally { localStorage.clear(); }
});
