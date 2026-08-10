import { fetchSearch, toJobCard, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
  country?: string
  worldwide?: boolean
  excludeWorldwide?: boolean
  seniority?: string
  employmentType?: string
  company?: string
  timezone?: string
  sort?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function withinJobAge(dateStr: string | null, days?: number): boolean {
  if (!days || days <= 0) return true
  if (!dateStr) return true
  const posted = new Date(dateStr).getTime()
  if (isNaN(posted)) return true
  const ageMs = Date.now() - posted
  return ageMs <= days * 86400 * 1000
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 28).padEnd(28)
    const date = (c.date || "—").slice(0, 10)
    return `${c.id.padEnd(38)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(38) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(28) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    // Himalayas' search endpoint filters server-side (confirmed live — see
    // url-reference.md) and paginates itself (20/page, fixed). We pass the
    // user's page straight through rather than over-fetching and paginating
    // client-side like the Remotive CLI has to.
    const data = await fetchSearch({
      q: opts.query,
      country: opts.country,
      worldwide: opts.worldwide,
      exclude_worldwide: opts.excludeWorldwide,
      seniority: opts.seniority,
      employment_type: opts.employmentType,
      company: opts.company,
      timezone: opts.timezone,
      sort: opts.sort,
      page: opts.page,
    })

    let cards = data.jobs.map(toJobCard)
    cards = cards.filter((c) => withinJobAge(c.date, opts.jobage))
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
