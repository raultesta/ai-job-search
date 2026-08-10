import { describe, test, expect } from "bun:test";
import { cleanDescription, filterAndRankJobs, toJobCard, toJobDetail, type RemotiveJob } from "../src/helpers";

function job(overrides: Partial<RemotiveJob> = {}): RemotiveJob {
  return {
    id: 1,
    url: "https://remotive.com/remote-jobs/design/product-designer-1",
    title: "Product Designer",
    company_name: "Acme",
    category: "Design",
    tags: ["figma", "ux"],
    job_type: "full_time",
    publication_date: "2026-08-01T00:00:00",
    candidate_required_location: "Worldwide",
    salary: "",
    description: "<p>Design great things.</p>",
    ...overrides,
  };
}

describe("cleanDescription", () => {
  test("strips tags and preserves paragraph breaks", () => {
    const html = "<p>First para.</p><p>Second para.</p>";
    expect(cleanDescription(html)).toBe("First para.\nSecond para.");
  });

  test("decodes HTML entities", () => {
    expect(cleanDescription("<p>Caf&eacute; &amp; Co</p>")).toContain("&");
    expect(cleanDescription("<p>Caf&#233; team</p>")).toBe("Café team");
  });

  test("returns null for empty input", () => {
    expect(cleanDescription("")).toBeNull();
  });

  test("converts <br> to newlines", () => {
    expect(cleanDescription("Line one<br>Line two")).toBe("Line one\nLine two");
  });
});

describe("filterAndRankJobs", () => {
  test("returns all jobs unchanged when query is empty", () => {
    const jobs = [job({ id: 1 }), job({ id: 2 })];
    expect(filterAndRankJobs(jobs, "")).toEqual(jobs);
    expect(filterAndRankJobs(jobs, undefined)).toEqual(jobs);
  });

  test("keeps jobs matching any query word in the title", () => {
    const jobs = [
      job({ id: 1, title: "Product Designer" }),
      job({ id: 2, title: "Backend Engineer" }),
    ];
    const result = filterAndRankJobs(jobs, "Product Designer");
    expect(result.map((j) => j.id)).toEqual([1]);
  });

  test("word-level OR match: 'Product Designer' matches a title with only 'Designer'", () => {
    const jobs = [job({ id: 1, title: "Senior Graphic Designer" })];
    const result = filterAndRankJobs(jobs, "Product Designer");
    expect(result).toHaveLength(1);
  });

  test("matches against description and tags too, not just title", () => {
    const jobs = [
      job({ id: 1, title: "Engineer", description: "<p>Loves UX research</p>", tags: [] }),
      job({ id: 2, title: "Engineer", description: "<p>Backend only</p>", tags: ["ux"] }),
      job({ id: 3, title: "Engineer", description: "<p>Backend only</p>", tags: [] }),
    ];
    const result = filterAndRankJobs(jobs, "UX");
    expect(result.map((j) => j.id).sort()).toEqual([1, 2]);
  });

  test("ranks title matches above description-only matches", () => {
    const jobs = [
      job({ id: 1, title: "Backend Engineer", description: "<p>designer friendly team</p>" }),
      job({ id: 2, title: "Product Designer", description: "<p>backend</p>" }),
    ];
    const result = filterAndRankJobs(jobs, "designer");
    expect(result[0].id).toBe(2);
  });

  test("falls back to unfiltered when the whole query is short/noise words", () => {
    const jobs = [job({ id: 1, title: "UI Engineer" })];
    // "a" and "in" are both too short (<3 chars) to produce any match word,
    // so filtering degrades to a no-op rather than silently returning nothing.
    const result = filterAndRankJobs(jobs, "a in");
    expect(result).toEqual(jobs);
  });
});

describe("toJobCard / toJobDetail", () => {
  test("maps Remotive fields to the portal-skill contract shape", () => {
    const card = toJobCard(job({ id: 42, title: "Designer", company_name: "Acme", candidate_required_location: "USA", publication_date: "2026-08-01T00:00:00", url: "https://remotive.com/remote-jobs/design/x-42" }));
    expect(card).toEqual({
      id: "42",
      title: "Designer",
      company: "Acme",
      location: "USA",
      date: "2026-08-01T00:00:00",
      url: "https://remotive.com/remote-jobs/design/x-42",
    });
  });

  test("null-safe: missing company/location become null, never omitted", () => {
    const card = toJobCard(job({ company_name: "" as unknown as string, candidate_required_location: "" as unknown as string }));
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
  });

  test("toJobDetail includes cleaned description, category, jobType, salary", () => {
    const detail = toJobDetail(job({ description: "<p>Hello</p>", category: "Design", job_type: "full_time", salary: "$100k" }));
    expect(detail.description).toBe("Hello");
    expect(detail.category).toBe("Design");
    expect(detail.jobType).toBe("full_time");
    expect(detail.salary).toBe("$100k");
  });
});
