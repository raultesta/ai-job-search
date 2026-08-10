import { fetchSearch, parseIdFromUrl, toJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Himalayas has no per-job GET endpoint, and the job's own himalayas.app page
 * sits behind a Cloudflare bot-challenge (403 to a plain fetch — see
 * url-reference.md). Every job object already carries its full description
 * inline though, so `detail` re-queries the search endpoint scoped to
 * `company=<companySlug>` (confirmed live to return that company's full
 * current listing set, not a full-feed crawl) and matches the specific job
 * by its slug.
 */
function normalizeId(input: string): { companySlug: string; jobSlug: string } | null {
  const fromUrl = parseIdFromUrl(input)
  const raw = fromUrl ?? input
  const parts = raw.split("/").filter(Boolean)
  if (parts.length !== 2) return null
  return { companySlug: parts[0], jobSlug: parts[1] }
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const parsed = normalizeId(opts.id)
  if (!parsed) {
    writeError(
      `Could not parse a job id from "${opts.id}" (expected "companySlug/jobSlug" or a full himalayas.app job URL)`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const data = await fetchSearch({ company: parsed.companySlug })
    const job = data.jobs.find((j) => parseIdFromUrl(j.guid) === `${parsed.companySlug}/${parsed.jobSlug}`)
    if (!job) {
      writeError(
        `Job "${opts.id}" not found among ${parsed.companySlug}'s current live postings (Himalayas has no id-based lookup endpoint — see url-reference.md; the posting may have expired)`,
        "NOT_FOUND",
      )
      return 1
    }
    const detail = toJobDetail(job)

    if (opts.format === "plain") {
      const lines = [
        detail.title,
        `${detail.company || "—"} · ${detail.location || "—"}`,
        "",
        detail.seniority ? `Seniority: ${detail.seniority}` : "",
        detail.employmentType ? `Type: ${detail.employmentType}` : "",
        detail.salary ? `Salary: ${detail.salary}` : "",
        "",
        detail.description || "(no description)",
        "",
        `Source: Himalayas — ${detail.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(detail, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
