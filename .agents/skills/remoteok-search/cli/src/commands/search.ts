import { fetchJobs, filterAndRankJobs, toJobCard, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
  tag?: string
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
    return `${c.id.padEnd(10)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(10) +
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
    // `tag` is genuinely applied server-side (see url-reference.md) — send
    // it when given, as a useful pre-filter. But there is no server-side
    // keyword search on this API at all, so --query is always additionally
    // applied client-side regardless of whether --tag was set.
    const jobs = await fetchJobs({ tag: opts.tag })

    let ranked = filterAndRankJobs(jobs, opts.query)
    ranked = ranked.filter((j) => withinJobAge(j.date, opts.jobage))

    // Client-side pagination over the ranked/filtered set — RemoteOK's API
    // has no pagination at all (see url-reference.md), so --page only makes
    // sense applied here, after fetching the fixed ~100-job window.
    const pageSize = 10
    const start = (opts.page - 1) * pageSize
    let cards = ranked.slice(start, start + pageSize).map(toJobCard)
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
