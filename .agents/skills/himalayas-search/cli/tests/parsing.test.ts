import { describe, test, expect } from "bun:test";
import {
  cleanDescription,
  epochSecondsToISO,
  formatLocation,
  parseIdFromUrl,
  jobId,
  toJobCard,
  toJobDetail,
  type HimalayasJob,
} from "../src/helpers";

function job(overrides: Partial<HimalayasJob> = {}): HimalayasJob {
  return {
    title: "Product Designer",
    excerpt: "Design great things.",
    companyName: "Acme",
    companySlug: "acme",
    companyLogo: "https://cdn-images.himalayas.app/x",
    employmentType: "Full Time",
    minSalary: null,
    maxSalary: null,
    salaryPeriod: "annual",
    currency: null,
    seniority: ["Senior"],
    locationRestrictions: [],
    timezoneRestrictions: [],
    categories: ["Product-Design"],
    parentCategories: ["Design"],
    description: "<p>Design great things.</p>",
    pubDate: 1786207825,
    expiryDate: 1791391824,
    applicationLink: "https://himalayas.app/companies/acme/jobs/product-designer",
    guid: "https://himalayas.app/companies/acme/jobs/product-designer",
    ...overrides,
  };
}

describe("cleanDescription", () => {
  test("strips tags and preserves paragraph breaks", () => {
    const html = "<p>First para.</p><p>Second para.</p>";
    expect(cleanDescription(html)).toBe("First para.\nSecond para.");
  });

  test("decodes HTML entities", () => {
    expect(cleanDescription("<p>Caf&#233; team</p>")).toBe("Café team");
  });

  test("returns null for empty input", () => {
    expect(cleanDescription("")).toBeNull();
  });

  test("converts <br> to newlines", () => {
    expect(cleanDescription("Line one<br>Line two")).toBe("Line one\nLine two");
  });
});

describe("epochSecondsToISO", () => {
  test("converts a Unix epoch-seconds timestamp to ISO 8601", () => {
    expect(epochSecondsToISO(1786207825)).toBe(new Date(1786207825 * 1000).toISOString());
  });

  test("returns null for missing/invalid input", () => {
    expect(epochSecondsToISO(null)).toBeNull();
    expect(epochSecondsToISO(undefined)).toBeNull();
    expect(epochSecondsToISO(0)).toBeNull();
    expect(epochSecondsToISO(NaN)).toBeNull();
  });
});

describe("formatLocation", () => {
  test("empty restrictions array means Worldwide", () => {
    expect(formatLocation([])).toBe("Worldwide");
    expect(formatLocation(null)).toBe("Worldwide");
  });

  test("joins multiple countries", () => {
    expect(formatLocation(["Portugal", "Spain"])).toBe("Portugal, Spain");
  });
});

describe("parseIdFromUrl / jobId", () => {
  test("extracts companySlug/jobSlug from a full himalayas.app URL", () => {
    expect(parseIdFromUrl("https://himalayas.app/companies/spotme/jobs/technical-support-specialist-us-remote")).toBe(
      "spotme/technical-support-specialist-us-remote",
    );
  });

  test("returns null for a URL that doesn't match the pattern", () => {
    expect(parseIdFromUrl("https://himalayas.app/advice/some-post")).toBeNull();
  });

  test("jobId derives id from guid", () => {
    expect(jobId(job({ guid: "https://himalayas.app/companies/wave-hq/jobs/product-designer" }))).toBe(
      "wave-hq/product-designer",
    );
  });
});

describe("toJobCard / toJobDetail", () => {
  test("maps Himalayas fields to the portal-skill contract shape", () => {
    const card = toJobCard(
      job({
        title: "Designer",
        companyName: "Acme",
        locationRestrictions: ["Portugal"],
        pubDate: 1786207825,
        applicationLink: "https://himalayas.app/companies/acme/jobs/designer",
        guid: "https://himalayas.app/companies/acme/jobs/designer",
      }),
    );
    expect(card).toEqual({
      id: "acme/designer",
      title: "Designer",
      company: "Acme",
      location: "Portugal",
      date: new Date(1786207825 * 1000).toISOString(),
      url: "https://himalayas.app/companies/acme/jobs/designer",
    });
  });

  test("null-safe: missing company becomes null, never omitted", () => {
    const card = toJobCard(job({ companyName: "" as unknown as string }));
    expect(card.company).toBeNull();
  });

  test("empty locationRestrictions maps to Worldwide, not null", () => {
    const card = toJobCard(job({ locationRestrictions: [] }));
    expect(card.location).toBe("Worldwide");
  });

  test("toJobDetail includes cleaned description, seniority, employmentType, salary", () => {
    const detail = toJobDetail(
      job({
        description: "<p>Hello</p>",
        seniority: ["Senior"],
        employmentType: "Full Time",
        minSalary: 80000,
        maxSalary: 120000,
        currency: "USD",
        salaryPeriod: "annual",
      }),
    );
    expect(detail.description).toBe("Hello");
    expect(detail.seniority).toBe("Senior");
    expect(detail.employmentType).toBe("Full Time");
    expect(detail.salary).toBe("USD 80000-120000 annual");
  });

  test("toJobDetail salary is null when no salary data present", () => {
    const detail = toJobDetail(job({ minSalary: null, maxSalary: null }));
    expect(detail.salary).toBeNull();
  });
});
