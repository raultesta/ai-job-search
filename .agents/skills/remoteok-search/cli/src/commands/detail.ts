import { fetchJobs, toJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

// No id-based detail endpoint exists on RemoteOK's API (confirmed live —
// /api/<id> 404s, ?id=<id> is silently ignored — see url-reference.md). We
// re-fetch the plain unfiltered window (no tag, so we don't accidentally
// exclude the job) and look the id up client-side. Every job object already
// carries its full description, so no second request is needed once found.

/** Accept a raw numeric id or a full remoteok.com job URL ending in -<id>. */
function normalizeId(input: string): string | null {
  const bare = input.match(/^\d+$/)
  if (bare) return input
  const fromUrl = input.match(/-(\d+)(?:[/?]|$)/)
  if (fromUrl) return fromUrl[1]
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const jobs = await fetchJobs({})
    const job = jobs.find((j) => String(j.id) === id)
    if (!job) {
      writeError(
        `Job ${id} not found in the current listing window (RemoteOK has no id-based lookup endpoint and no pagination — see url-reference.md)`,
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
        detail.tags.length ? `Tags: ${detail.tags.join(", ")}` : "",
        detail.salary ? `Salary: ${detail.salary}` : "",
        "",
        detail.description || "(no description)",
        "",
        `URL: ${detail.url}`,
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
