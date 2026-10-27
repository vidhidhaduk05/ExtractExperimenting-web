import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApiBase, shouldUseDemoFallback } from "./api";
import { listBookmarks, saveBookmark } from "./bookmarks";

vi.mock("./api", () => ({ getApiBase: vi.fn(() => "/api"), shouldUseDemoFallback: vi.fn(() => true) }));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(getApiBase).mockReturnValue("/api");
  vi.mocked(shouldUseDemoFallback).mockReturnValue(true);
});

describe("personal bookmarks", () => {
  it("persists, deduplicates and removes saved studies", async () => {
    await saveBookmark("p1", "s1", true);
    await saveBookmark("p1", "s1", true);
    expect(await listBookmarks("p1")).toEqual(["s1"]);
    await saveBookmark("p1", "s1", false);
    expect(await listBookmarks("p1")).toEqual([]);
  });

  it("separates demo users and projects", async () => {
    localStorage.setItem("username", "alice");
    await saveBookmark("p1", "s1", true);
    expect(await listBookmarks("p2")).toEqual([]);
    localStorage.setItem("username", "bob");
    expect(await listBookmarks("p1")).toEqual([]);
    localStorage.setItem("username", "alice");
    expect(await listBookmarks("p1")).toEqual(["s1"]);
  });

  it("reports storage failure instead of claiming success", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
    await expect(saveBookmark("p1", "s1", true)).rejects.toThrow("Storage full");
  });

  it("sends authenticated saves and never falls back after server failure", async () => {
    vi.mocked(shouldUseDemoFallback).mockReturnValue(false);
    localStorage.setItem("token", "test-token");
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, json: async () => ({ detail: "Access denied" }),
    } as Response);
    await expect(saveBookmark("p1", "s1", true)).rejects.toThrow("Access denied");
    expect(request).toHaveBeenCalledWith("/api/studies/s1/bookmark", expect.objectContaining({
      method: "PUT", body: '{"bookmarked":true}',
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    }));
    expect(localStorage.length).toBe(1);
  });

  it("requires authentication in live mode", async () => {
    vi.mocked(shouldUseDemoFallback).mockReturnValue(false);
    await expect(listBookmarks("p1")).rejects.toThrow("Sign in");
  });
});
