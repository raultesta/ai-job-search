// Live smoke test — hits the real remoteok.com public API. RemoteOK's own
// terms carry no documented strict rate cap (unlike Remotive's ~4/day), but
// this file still makes exactly ONE real network call to stay respectful of
// a high-volume, unauthenticated public endpoint. `detail` is not exercised
// here (it hits the same endpoint again for no additional coverage
// benefit); it is verified manually per SKILL.md.
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
    expect(first.url).toMatch(/^https:\/\/remoteok\.com\/remote-jobs\//i);
  });

  test("a bogus flag exits 1 with a JSON error on stderr (no network hit)", async () => {
    const result = await runCLI(["search", "--jobage", "not-a-number"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ARG");
  });
});
