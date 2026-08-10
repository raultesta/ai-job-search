import { describe, test, expect } from "bun:test";
import { cleanDescription, filterAndRankJobs, toJobCard, toJobDetail, type RemoteOKJob } from "../src/helpers";

function job(overrides: Partial<RemoteOKJob> = {}): RemoteOKJob {
  return {
    id: "1",
    slug: "product-designer-1",
    url: "https://remoteOK.com/remote-jobs/product-designer-1",
    apply_url: "https://remoteOK.com/remote-jobs/product-designer-1",
    position: "Product Designer",
    company: "Acme",
    tags: ["design", "figma"],
    date: "2026-08-01T00:00:00+00:00",
    location: "Worldwide",
    salary_min: 0,
    salary_max: 0,
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
    const jobs = [job({ id: "1" }), job({ id: "2" })];
    expect(filterAndRankJobs(jobs, "")).toEqual(jobs);
    expect(filterAndRankJobs(jobs, undefined)).toEqual(jobs);
  });

  test("keeps jobs matching any query word in the title", () => {
    const jobs = [
      job({ id: "1", position: "Product Designer" }),
      job({ id: "2", position: "Backend Engineer" }),
    ];
    const result = filterAndRankJobs(jobs, "Product Designer");
    expect(result.map((j) => j.id)).toEqual(["1"]);
  });

  test("word-level OR match: 'Product Designer' matches a title with only 'Designer'", () => {
    const jobs = [job({ id: "1", position: "Senior Graphic Designer" })];
    const result = filterAndRankJobs(jobs, "Product Designer");
    expect(result).toHaveLength(1);
  });

  test("matches against description and tags too, not just title", () => {
    const jobs = [
      job({ id: "1", position: "Engineer", description: "<p>Loves UX research</p>", tags: [] }),
      job({ id: "2", position: "Engineer", description: "<p>Backend only</p>", tags: ["ux"] }),
      job({ id: "3", position: "Engineer", description: "<p>Backend only</p>", tags: [] }),
    ];
    const result = filterAndRankJobs(jobs, "UX");
    expect(result.map((j) => j.id).sort()).toEqual(["1", "2"]);
  });

  test("ranks title matches above description-only matches", () => {
    const jobs = [
      job({ id: "1", position: "Backend Engineer", description: "<p>designer friendly team</p>" }),
      job({ id: "2", position: "Product Designer", description: "<p>backend</p>" }),
    ];
    const result = filterAndRankJobs(jobs, "designer");
    expect(result[0].id).toBe("2");
  });

  test("falls back to unfiltered when the whole query is short/noise words", () => {
    const jobs = [job({ id: "1", position: "UI Engineer" })];
    // "a" and "in" are both too short (<3 chars incl "in") to survive
    // filtering, so filtering degrades to a no-op rather than silently
    // returning nothing.
    const result = filterAndRankJobs(jobs, "a in");
    expect(result).toEqual(jobs);
  });
});

describe("toJobCard / toJobDetail", () => {
  test("maps RemoteOK fields to the portal-skill contract shape", () => {
    const card = toJobCard(
      job({
        id: "42",
        position: "Designer",
        company: "Acme",
        location: "USA",
        date: "2026-08-01T00:00:00+00:00",
        url: "https://remoteOK.com/remote-jobs/x-42",
      }),
    );
    expect(card).toEqual({
      id: "42",
      title: "Designer",
      company: "Acme",
      location: "USA",
      date: "2026-08-01T00:00:00+00:00",
      url: "https://remoteOK.com/remote-jobs/x-42",
    });
  });

  test("null-safe: missing company/location become null, never omitted", () => {
    const card = toJobCard(job({ company: "", location: "" }));
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
  });

  test("trailing-comma-only location (e.g. 'Toronto, ') is trimmed", () => {
    const card = toJobCard(job({ location: "Toronto, " }));
    expect(card.location).toBe("Toronto");
  });

  test("embedded newlines/control chars in position are collapsed to spaces (live-observed quirk)", () => {
    const card = toJobCard(job({ position: "IDEAS THAT\nSTICK.\nliterally" }));
    expect(card.title).toBe("IDEAS THAT STICK. literally");
  });

  test("toJobDetail includes cleaned description, tags, and salary", () => {
    const detail = toJobDetail(
      job({ description: "<p>Hello</p>", tags: ["design", "remote"], salary_min: 80000, salary_max: 100000 }),
    );
    expect(detail.description).toBe("Hello");
    expect(detail.tags).toEqual(["design", "remote"]);
    expect(detail.salary).toBe("$80000 - $100000");
  });

  test("salary is null when both salary_min and salary_max are 0", () => {
    const detail = toJobDetail(job({ salary_min: 0, salary_max: 0 }));
    expect(detail.salary).toBeNull();
  });
});
