import { describe, expect, test } from "bun:test";
import {
  parseFeedItems,
  parseJobCards,
  findJobDetail,
  splitTitle,
  slugFromUrl,
  matchesQuery,
  withinJobAge,
} from "../src/helpers";

function fixtureItem(opts: {
  title: string;
  region?: string;
  country?: string;
  skills?: string;
  type?: string;
  description?: string;
  pubDate?: string;
  link?: string;
}): string {
  const link = opts.link ?? "https://weworkremotely.com/remote-jobs/acme-product-designer";
  return `<item>
    <title>${opts.title}</title>
    <region>${opts.region ?? "Anywhere in the World"}</region>
    <country>${opts.country ?? ""}</country>
    <state></state>
    <skills>${opts.skills ?? ""}</skills>
    <category>Design</category>
    <type>${opts.type ?? "Full-Time"}</type>
    <description>${opts.description ?? "&lt;p&gt;Job body&lt;/p&gt;"}</description>
    <pubDate>${opts.pubDate ?? "Fri, 07 Aug 2026 09:59:18 +0000"}</pubDate>
    <expires_at>Sun, 06 Sep 2026 09:59:18 +0000</expires_at>
    <guid>${link}</guid>
    <link>${link}</link>
  </item>`;
}

function feed(items: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>We Work Remotely: Design Jobs</title>
${items.join("\n")}
</channel></rss>`;
}

describe("splitTitle", () => {
  test("splits Company: Job Title", () => {
    expect(splitTitle("Acme Inc: Product Designer")).toEqual({
      company: "Acme Inc",
      title: "Product Designer",
    });
  });

  test("falls back gracefully with no colon", () => {
    expect(splitTitle("Just A Title")).toEqual({ company: null, title: "Just A Title" });
  });
});

describe("slugFromUrl", () => {
  test("extracts trailing slug", () => {
    expect(slugFromUrl("https://weworkremotely.com/remote-jobs/acme-product-designer")).toBe(
      "acme-product-designer",
    );
  });
});

describe("parseFeedItems / parseJobCards", () => {
  test("parses a well-formed item", () => {
    const xml = feed([fixtureItem({ title: "Acme Inc: Product Designer" })]);
    const cards = parseJobCards(xml);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "acme-product-designer",
      title: "Product Designer",
      company: "Acme Inc",
      location: "Anywhere in the World",
      url: "https://weworkremotely.com/remote-jobs/acme-product-designer",
    });
    expect(cards[0].date).toBeTruthy();
  });

  test("one malformed item does not break the rest", () => {
    const malformed = `<item><title>Broken: No Link Item</title></item>`;
    const xml = feed([
      malformed,
      fixtureItem({ title: "Acme Inc: Product Designer", link: "https://weworkremotely.com/remote-jobs/second" }),
    ]);
    const cards = parseJobCards(xml);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("second");
  });

  test("decodes HTML entities in the title", () => {
    const xml = feed([fixtureItem({ title: "Acme &amp; Co: Brand &amp; Creative Designer" })]);
    const cards = parseJobCards(xml);
    expect(cards[0].company).toBe("Acme & Co");
    expect(cards[0].title).toBe("Brand & Creative Designer");
  });

  test("falls back location to country when region is empty", () => {
    const xml = feed([
      `<item>
        <title>Acme Inc: Product Designer</title>
        <region></region>
        <country>🇩🇪 Germany, 🇩🇰 Denmark</country>
        <state></state>
        <skills></skills>
        <category>Design</category>
        <type>Full-Time</type>
        <description>&lt;p&gt;Body&lt;/p&gt;</description>
        <pubDate>Fri, 07 Aug 2026 09:59:18 +0000</pubDate>
        <guid>https://weworkremotely.com/remote-jobs/acme-product-designer</guid>
        <link>https://weworkremotely.com/remote-jobs/acme-product-designer</link>
      </item>`,
    ]);
    const cards = parseJobCards(xml);
    expect(cards[0].location).toBe("🇩🇪 Germany");
  });
});

describe("findJobDetail", () => {
  test("finds the matching item and strips description HTML", () => {
    const xml = feed([
      fixtureItem({
        title: "Acme Inc: Product Designer",
        description: "&lt;p&gt;Line one&lt;/p&gt;&lt;p&gt;Line two&lt;/p&gt;",
        skills: "Figma, Prototyping",
      }),
    ]);
    const job = findJobDetail(xml, "acme-product-designer");
    expect(job).not.toBeNull();
    expect(job?.description).toBe("Line one\nLine two");
    expect(job?.skills).toBe("Figma, Prototyping");
  });

  test("returns null when id not found", () => {
    const xml = feed([fixtureItem({ title: "Acme Inc: Product Designer" })]);
    expect(findJobDetail(xml, "does-not-exist")).toBeNull();
  });

  test("double-decodes entities inside the description (WWR escapes its HTML source twice)", () => {
    // Raw feed XML has &amp;amp; -> one XML-decode (in tag()) yields literal "&amp;" text
    // still embedded in the HTML; findJobDetail must decode a second time after stripping tags.
    const xml = feed([
      fixtureItem({
        title: "Acme Inc: Product Designer",
        description: "&lt;p&gt;Design &amp;amp; build things&lt;/p&gt;",
      }),
    ]);
    const job = findJobDetail(xml, "acme-product-designer");
    expect(job?.description).toBe("Design & build things");
  });
});

describe("matchesQuery", () => {
  test("case-insensitive substring match", () => {
    expect(matchesQuery("product designer", "Senior Product Designer", null)).toBe(true);
    expect(matchesQuery("PRODUCT", "product manager", null)).toBe(true);
    expect(matchesQuery("backend", "Product Designer", "Acme Inc")).toBe(false);
  });
});

describe("withinJobAge", () => {
  test("9999 (default) accepts everything", () => {
    expect(withinJobAge("2020-01-01T00:00:00.000Z", 9999)).toBe(true);
  });

  test("recent date passes a small window", () => {
    const recent = new Date().toISOString();
    expect(withinJobAge(recent, 7)).toBe(true);
  });

  test("old date fails a small window", () => {
    expect(withinJobAge("2020-01-01T00:00:00.000Z", 7)).toBe(false);
  });

  test("unknown date is not dropped", () => {
    expect(withinJobAge(null, 7)).toBe(true);
  });
});
