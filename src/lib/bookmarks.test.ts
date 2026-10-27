import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApiBase } from "./api";
import { listBookmarks, saveBookmark, bookmarkScope } from "./bookmarks";

vi.mock("./api", () => ({ getApiBase: vi.fn(() => "/api") }));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(getApiBase).mockReturnValue("/api");
});

describe("personal bookmarks", () => {
  it("scopes bookmarks to the signed-in user from the JWT subject", () => {
    localStorage.setItem("token", "x." + btoa(JSON.stringify({ sub: "alice" })).replace(/=/g, "") + ".z");
    expect(bookmarkScope()).toBe("user:alice");
    localStorage.removeItem("token");
    expect(bookmarkScope()).toBe("anonymous");
  });

  it("sends authenticated saves and never falls back after server failure", async () => {
    localStorage.setItem("token", "test-token");
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, json: async () => ({ detail: "Access denied" }),
    } as Response);
    await expect(saveBookmark("p1", "s1", true)).rejects.toThrow("Access denied");
    expect(request).toHaveBeenCalledWith("/api/studies/s1/bookmark", expect.objectContaining({
      method: "PUT", body: '{"bookmarked":true}',
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    }));
  });

  it("lists bookmarks from the backend", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ study_ids: ["s1", "s2"] }),
    } as Response);
    expect(await listBookmarks("p1")).toEqual(["s1", "s2"]);
  });

  it("surfaces backend failures instead of returning local data", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    await expect(listBookmarks("p1")).rejects.toThrow("Network error");
  });
});
