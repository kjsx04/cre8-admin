/**
 * Credential for the Cloudflare Worker's write routes.
 *
 * The Worker at cre8-api-proxy.kjsx04.workers.dev holds the Webflow API token
 * and used to accept POST / PATCH / DELETE on /listings from anyone on the
 * internet — so publishing, editing or deleting a listing on the live
 * cre8advisors.com site needed nothing but the URL. It now requires this key on
 * any route that changes something or spends quota.
 *
 * Reads are deliberately still public: the live listing pages, the listings map
 * and the legacy Webflow admin embeds all fetch GET /listings straight from the
 * visitor's browser, where no secret can be kept.
 *
 * SERVER-SIDE ONLY. `CRE8_WORKER_KEY` has no NEXT_PUBLIC_ prefix, so it is not
 * bundled into client code — importing this from a component would give you an
 * empty string rather than leak it. Every current caller is an API route.
 *
 * Set it in both places, matching the Worker secret:
 *   npx wrangler secret put ADMIN_WRITE_KEY     (in the Worker)
 *   CRE8_WORKER_KEY=...                         (Vercel env + .env.local)
 */

/** Headers to spread into a fetch that writes through the Worker. */
export function workerWriteHeaders(): Record<string, string> {
  const key = process.env.CRE8_WORKER_KEY;

  if (!key) {
    // Loud, because the alternative is a confusing 401 from the Worker that
    // looks like a Webflow problem.
    console.error(
      "[worker-auth] CRE8_WORKER_KEY is not set — writes to the Cloudflare Worker will be rejected."
    );
    return {};
  }

  return { "x-cre8-admin-key": key };
}
