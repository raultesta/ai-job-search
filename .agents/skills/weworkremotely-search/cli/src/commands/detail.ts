import { FEED_URL, textFetch, findJobDetail, slugFromUrl, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a bare slug id or a full weworkremotely.com job URL. */
function normalizeId(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) return slugFromUrl(input)
  return input
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // Job-posting pages are behind a Cloudflare JS challenge (confirmed live — see
    // url-reference.md) and 403 on a plain fetch, so `detail` re-fetches the same RSS
    // feed rather than scraping the job's own page. The feed's <description> already
    // carries the full posting body, so no second request is needed.
    const xml = await textFetch(FEED_URL)
    const job = findJobDetail(xml, id)
    if (!job) {
      writeError(`Job "${id}" not found in the current feed (it may have expired or rolled off the recent-postings window)`, "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Type: ${job.employmentType}` : "",
        job.skills ? `Skills: ${job.skills}` : "",
        job.countries ? `Eligible countries: ${job.countries}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
