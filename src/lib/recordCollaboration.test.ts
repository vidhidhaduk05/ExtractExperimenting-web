import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApiBase } from "./api";
import { collaborationKey, matchesTag, recordCollaboration } from "./recordCollaboration";

vi.mock("./api", () => ({ getApiBase: vi.fn(() => "/api") }));
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(getApiBase).mockReturnValue("/api");
});

describe("record collaboration requests", () => {
  it("always targets the connected backend and never demo storage", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ annotations: [], can_write: false }),
    } as Response);
    await recordCollaboration.listAnnotations("s1");
    expect(fetch).toHaveBeenCalledWith("/api/studies/s1/annotations", expect.any(Object));
    expect(localStorage.length).toBe(0);
  });
  it("surfaces server failures and sends only the supplied text, visibility and retry ID", async () => {
    localStorage.setItem("token", "alice");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 403,
      json: async () => ({ detail: "Access denied" }) } as Response);
    const body = { text: "Personal assessment", visibility: "private" as const, request_id: "same-id" };
    await expect(recordCollaboration.addAnnotation("s/1", body)).rejects.toThrow("Access denied");
    expect(fetch).toHaveBeenCalledWith("/api/studies/s%2F1/annotations", expect.objectContaining({ method: "POST",
      body: JSON.stringify(body), headers: expect.objectContaining({ Authorization: "Bearer alice" }) }));
  });
  it("namespaces private caches by backend, user session, project and record", () => {
    localStorage.setItem("token", "alice");
    const alice = collaborationKey("p1", "s1");
    localStorage.setItem("token", "bob");
    expect(collaborationKey("p1", "s1")).not.toEqual(alice);
    localStorage.setItem("token", "alice");
    vi.mocked(getApiBase).mockReturnValue("http://localhost:8001/api");
    expect(collaborationKey("p1", "s1")).not.toEqual(alice);
  });
  it("filters studies using tag IDs so renaming does not break assignments", () => {
    const index = { can_write: true, tags: [], study_tags: { s1: ["t1", "t2"], s2: ["t2"] } };
    expect(matchesTag(index, "s1", "t1")).toBe(true);
    expect(matchesTag(index, "s2", "t1")).toBe(false);
    expect(matchesTag(undefined, "s2", "t1")).toBe(false);
    expect(matchesTag(undefined, "s2", "")).toBe(true);
  });
});
