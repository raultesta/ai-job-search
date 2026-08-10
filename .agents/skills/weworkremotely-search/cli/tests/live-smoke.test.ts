// Live smoke test — hits the real weworkremotely.com RSS feed. Keep this file's request
// volume minimal (two `search` calls, no `detail`, since `detail` also just re-fetches the
// same feed and is already exercised manually per url-reference.md / SKILL.md notes).
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
    expect(first.url).toMatch(/^https:\/\/weworkremotely\.com\/remote-jobs\//);
  });

  test("a bogus flag exits 1 with a JSON error on stderr", async () => {
    const result = await runCLI(["search", "--jobage", "not-a-number"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ARG");
  });
});
