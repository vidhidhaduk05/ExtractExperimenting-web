import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApiBase, shouldUseDemoFallback } from "./api";
import { collaborationKey, matchesTag, recordCollaboration } from "./recordCollaboration";

vi.mock("./api", () => ({ getApiBase: vi.fn(() => "/api"), shouldUseDemoFallback: vi.fn(() => false) }));
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(getApiBase).mockReturnValue("/api");
  vi.mocked(shouldUseDemoFallback).mockReturnValue(false);
});

describe("record collaboration requests", () => {
  it("requires an authenticated backend and never stores private notes in demo storage", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(recordCollaboration.listAnnotations("s1")).rejects.toThrow("Sign in");
    localStorage.setItem("token", "alice");
    vi.mocked(shouldUseDemoFallback).mockReturnValue(true);
    await expect(recordCollaboration.listAnnotations("s1")).rejects.toThrow("connected backend");
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(1);
  });
  it("surfaces server failures and sends only the supplied text, visibility and retry ID", async () => {
    localStorage.setItem("token", "alice");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 403,
      json: async () => ({ detail: "Access denied" }) } as Response);
    const body = { text: "Personal assessment", visibility: "private" as const, request_id: "same-id" };
    await expect(recordCollaboration.addAnnotation("s/1", body)).rejects.toThrow("Access denied");
    expect(fetch).toHaveBeenCalledWith("/api/studies/s%2F1/annotations", expect.objectContaining({ method: "POST",
      body: JSON.stringify(body), headers: expect.objectContaining({ Authorization: "Bearer alice" }) }));
    expect(localStorage.length).toBe(1);
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
