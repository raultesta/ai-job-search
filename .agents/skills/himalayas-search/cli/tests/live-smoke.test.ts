// Live smoke test — hits the real himalayas.app public API. Himalayas caches
// data for 24h server-side (see ../../url-reference.md), so there's no
// benefit to calling this often; this file makes a small, deliberate number
// of real network calls (one search, one detail lookup).
import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

interface SearchResult {
  meta: { count: number; page: number };
  results: Array<{ id: string | null; title: string | null; url: string | null }>;
}

describe("live: search", () => {
  test("a realistic query returns at least one real result", async () => {
    const result = await runCLI(["search", "-q", "Product Designer", "--limit", "5"]);
    const parsed = parseJSON<SearchResult>(result);
    expect(parsed.results.length).toBeGreaterThan(0);
    const first = parsed.results[0];
    expect(first.id).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.url).toMatch(/^https:\/\/himalayas\.app\//);
  });

  test("a bogus flag exits 1 with a JSON error on stderr (no network hit)", async () => {
    const result = await runCLI(["search", "--jobage", "not-a-number"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ARG");
  });
});

describe("live: detail", () => {
  test("detail on a result from search returns a real description", async () => {
    const searchResult = await runCLI(["search", "-q", "Product Designer", "--limit", "1"]);
    const parsed = parseJSON<SearchResult>(searchResult);
    const id = parsed.results[0].id as string;

    const detailResult = await runCLI(["detail", id]);
    const detail = parseJSON<{ title: string | null; description: string | null; url: string | null }>(detailResult);
    expect(detail.title).toBeTruthy();
    expect(detail.description).toBeTruthy();
    expect(detail.url).toMatch(/^https:\/\/himalayas\.app\//);
  });
});
