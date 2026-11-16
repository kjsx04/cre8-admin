# CRE8 Admin — Full Review (Nov 16 2026)

Code-level review of `admin.cre8advisors.com` as deployed on `main` (HEAD `dc3c154`).
Covers routes, auth, data flow, design-system adoption, and the Docs templates
(the `{{tokens}}` were extracted from all six `.docx` files and diffed against the UI's
variable maps — findings D1 below came out of that diff).

Not covered: visual / responsive pass. The Chrome extension wasn't connected, so nothing
here is based on looking at rendered pixels.

**Fix order recommendation:** A1 (lock the API) → D1, D2, D3 (Docs correctness bugs that can
put a wrong number on a signed document) → D4 (Docs preview performance) → A2 (caching).

---

## Part 1 — App-wide gaps

### A1. The API is wide open — fix first
**Severity: critical**

Every API route is reachable from the internet with no authentication.

- **17 routes have zero check at all:**
  `api/intel`, `api/intel/process`, `api/listings`, `api/listings/[id]`, `api/listings/create`,
  `api/listings/publish`, `api/flow/listings`, `api/flow/deals/[id]`, `api/flow/deals/extract`,
  `api/docs/generate`, `api/docs/extract`, `api/assets/upload`, `api/assets/folder`,
  `api/email/preview`, `api/email/schedule`, `api/email/schedule/optimize`,
  `api/email/webhook/resend`.
- The rest call `requireUser()` (`src/lib/email/auth.ts`), which only checks that an
  `x-user-email` header **exists**. Any value passes. `curl -H "x-user-email: anything"`
  is a valid admin.
- No `middleware.ts` anywhere.
- These routes hold the **Supabase service-role key** (`src/lib/flow/supabase.ts`), which
  bypasses RLS entirely.

Concrete exposure: fire a send to the 4,173-contact list; publish or delete a listing on the
live Webflow site; read every deal's commission split; push market-intel briefs public; run
the Claude/OpenAI keys for free.

**Fix:** client sends the MSAL access token; validate it server-side (signature against Azure AD
JWKS, `aud` = client ID `c1bd941f-3240-412e-a22a-7c6296549c06`, `tid` = tenant
`74141c21-622f-43c7-869b-bd054d088c19`) in one shared `requireUser()` plus a `middleware.ts`
matcher over `/api/*`. ~half a day, closes all of it at once.

### A2. Nothing is cached — the app refetches everything, every time
**Severity: high**

- **Seven separate places fetch the full listings list**, all `cache: "no-store"`:
  - `src/app/page.tsx:63`
  - `src/app/listings/new/page.tsx:20`
  - `src/app/listings/[id]/edit/page.tsx:31`
  - `src/app/marketing/email/new/page.tsx:18`
  - `src/app/marketing/email/[id]/edit/page.tsx:35`
  - `src/components/flow/DealForm.tsx:409` (via `/api/flow/listings`)
  - `src/app/docs/[type]/complete/page.tsx:939` — **skips our own API and hits the Cloudflare
    Worker straight from the browser** (`CMS_API_BASE`), hence all the defensive
    `fieldData?.name || item.name` shape handling
- So every navigation is Vercel → Worker → Webflow; a spinner on every return to a page you
  were just on.
- Webflow's API allows 60 req/min. Five brokers clicking around can realistically 429, and the
  dashboard then shows "Failed to load".

**Fix:** one `/api/listings` with a 60s revalidate, one `useListings()` hook everywhere
(including Docs). Biggest perceived speed-up available.

### A3. Everything is client-rendered
**Severity: medium**

Root layout is `"use client"` because MSAL lives there, so **110 of 111 components are client
components**. Every page: blank → MSAL init → spinner → fetch → render. No SSR anywhere, and
**no `loading.tsx` in the entire app** (only `src/app/error.tsx` and `src/app/global-error.tsx`).

**Cheapest win:** a `loading.tsx` skeleton per route so navigation feels instant instead of empty.

### A4. 22 test files, no test runner installed
**Severity: high (process)**

No vitest or jest in `package.json`, no `npm test` script, nothing in `node_modules/.bin`.
So these have **never actually run**:

```
useCampaignDraft.test.ts   analytics.test.ts        audience-count.test.ts
body-html.test.ts          bounce-policy.test.ts    broadcast-name.test.ts
broker-emails.test.ts      contact-match.test.ts    custom-email.test.ts
event-quality.test.ts      group-intro.test.ts      listing-context.test.ts
listing-hydrate.test.ts    merge-tags.test.ts       occurrences.test.ts
place.test.ts              schedule-dates.test.ts   subject.test.ts
template-version.test.ts   union-segment.test.ts    validate-schedule.test.ts
logos.test.ts
```

That's the coverage on the trickiest email logic — bounce policy, scheduling, dedupe. It's how
the lost-send and duplicate-send bugs got through.

**Fix:** `npm i -D vitest`, add the script, wire a GitHub Action. ~30 min. Highest leverage
after A1.

### A5. No roles
**Severity: medium**

`AuthGate` only checks *authenticated*, never *authorized*. Anyone in the Azure tenant who signs
in sees every deal, every commission split, every take-home number. Only the New Listings
checklist is broker-scoped (`brokerIdForEmail()`). Fine with five people; a problem the day an
assistant or intern is added.

### A6. Design-system drift
**Severity: medium**

Primitives are on `main` and the shell / listings / email use them. Remaining drift:

| Module | Raw hex | `text-[Npx]` | `uppercase` | Notes |
|---|---|---|---|---|
| `src/app/docs` | 59 | 4 | 3 | also Bebas font + green as action color |
| `src/components/flow` | 42 | 4 | 12 | |
| `src/components/email` | 19 | 46 | 20 | |
| `src/app/flow` | 13 | 0 | 8 | |
| `src/app/intel` | 0 | 18 | 5 | |

Docs is the worst offender and breaks two of our own rules: Inter-only, and black = action /
green = status only.

### A7. Duplication and dead code
**Severity: medium**

- **Two `ParcelPickerModal`s, 1,599 lines total**, already diverging:
  `src/components/ParcelPickerModal.tsx` (835 lines — has map-image capture + `includeAcreage`)
  vs `src/components/flow/ParcelPickerModal.tsx` (764 lines — has neither).
  Bug fixes land in one and not the other.
- Four orphaned components, zero imports: `VoiceInput.tsx`, `ClauseCard.tsx`,
  `DocTypeCard.tsx`, `ReviewField.tsx`.
- Two dead redirect routes: `src/app/docs/[type]/page.tsx`, `src/app/docs/[type]/review/page.tsx`.
- Two AI providers for six features (Anthropic: docs extract, deals extract, email scheduling;
  OpenAI: email body draft, intel process) = two keys, two failure modes.

### A8. Stale wiring
**Severity: low, but cheap to fix**

- **CLAUDE.md doesn't mention Intel or Logos at all**, and still says `ui-refresh` is awaiting a
  merge — the design system is on `main`.
- Every AI call is on an older generation:
  - `api/docs/extract/route.ts:88` — `claude-sonnet-4-6`
  - `api/flow/deals/extract/route.ts:77,117` — `claude-sonnet-4-6`
  - `api/email/schedule/route.ts:101` — `claude-sonnet-4-6`
  - `api/email/body-draft/route.ts:69` — `gpt-4o-mini`
  - `api/intel/process/route.ts:133` — `gpt-5-mini`
  Moving the extraction calls to `claude-sonnet-5-5` is a one-line change per route that makes
  Docs and Flow extraction measurably better.

### A9. The modules don't know about each other
**Severity: product, not a bug**

Six modules (Listings, Flow, Docs, Marketing, Logos, Intel), no global search, no cross-links.
A deal doesn't link to its listing's campaigns; a listing doesn't show its deal; Docs can't see
the deal being papered. Biggest *product* gap — worth less than A1–A4 until the foundations hold.

---

## Part 2 — Docs module deep dive

**Working well:** all six doc types live; single-screen editor; live preview; AI extraction;
strict mode; parcel picker; SharePoint save with folder picker. Verified: all six templates
tokenize correctly with **zero unresolved split-token spans** — `cleanSplitTokens()` is doing
its job, don't touch it.

Token counts pulled from the actual files:

| Template | Tokens |
|---|---|
| `loi-building-tokenized.docx` | 32 |
| `loi-land-tokenized.docx` | 34 |
| `loi-lease-tokenized.docx` | 26 |
| `sale-listing-agreement-tokenized.docx` | 11 |
| `sale-lease-listing-agreement-tokenized.docx` | 13 |
| `lease-listing-agreement-tokenized.docx` | 13 |

### D1. `acreage` is a dead field on both Sale and Sale/Lease listing agreements
**Severity: high**

`LISTING_SALE_VARIABLES` (`constants.ts:190`) and `LISTING_SALE_LEASE_VARIABLES`
(`constants.ts:213`) both define `acreage`. **Neither template contains `{{acreage}}`.**

So a broker types the acreage, ticks the green verify checkmark on it, and it never reaches the
document. Fix: add the token to the template's property description, or drop the field from both
variable maps and section groupings.

(`price_per_acre`, `price_per_sqft`, `listing_price` and `commission_pct` are intentionally
UI-only — they feed the auto-computed `_display` tokens. Those are correct. Also worth noting:
the lease-only listing agreement has no `owner_phone` / `owner_email`, unlike Sale — may be
intentional, worth a look.)

### D2. The strict-mode verification gate is a placebo
**Severity: high**

`src/app/docs/[type]/complete/page.tsx:1617`:

```ts
if (val && val.trim() !== "" && !verifiedFields.has(varDef.token)) return false;
```

Only **filled** fields require verification — so a **completely blank listing agreement passes
the gate** (nothing filled, nothing to verify) and saves with blanks throughout. And the gate is
only wired to Save to SharePoint; **Download isn't gated at all**, which is the button most
people reach for.

**Fix:** make `flag: true` fields genuinely required, and apply `allFieldsVerified` to Download too.

### D3. Starting a second document silently inherits the first one's data
**Severity: high — highest risk in the module**

`sessionStorage` is keyed by doc *type* (`generate_payload_${docType.id}`) and is only cleared
**after a successful SharePoint save** (`complete/page.tsx:1722-1724`). The restore runs on mount
at `:860`.

Abandon an LOI for property A, start one for property B → A's purchase price, earnest money, APN
and entity names are all pre-filled. There is no "New document" or "Start fresh" button anywhere.

That's a wrong-address, wrong-price LOI going out on letterhead. **Fix:** reset on entry, plus an
explicit "resume this draft?" prompt when a stored payload exists.

### D4. Typing is slow and the preview fights you
**Severity: high (UX)**

Every 1.5s of idle (`triggerDebouncedRegen`, `:1164`) triggers:
POST `/api/docs/generate` → server reads the `.docx` off disk → unzip → regex-clean 5 XML parts →
render → **re-zip with DEFLATE** → base64 → `sessionStorage` write → `DocPreview` wipes
`innerHTML` and re-renders every page from scratch.

Two things you feel:
- a **white overlay veils the document you're reading** (`complete/page.tsx:1977`)
- **scroll jumps back to page 1** — no scroll preservation exists anywhere in `DocPreview.tsx`.
  Editing a commission clause on page 4 bounces you to the top every 1.5 seconds.

Fixes, in payoff order:
1. **Preserve scroll position across re-renders** — biggest felt improvement, ~20 lines.
2. Cache the cleaned template zip in module scope (it's static) in `api/docs/generate/route.ts`;
   use `compression: "STORE"` for previews, DEFLATE only on download/save.
3. Replace the full-pane overlay with a small "Updating" chip in the corner.
4. Longer term: render the preview from HTML (`mammoth` is already a dependency) and only build
   the real `.docx` on download/save.

### D5. No drafts and no history
**Severity: high (missing feature)**

Close the tab and the work is gone. No list of documents generated, no re-open, no "duplicate
this LOI with a new price" — round three on the same deal starts from an empty form. Biggest
missing feature in Docs; a Supabase table + a list view is a small lift.

### D6. The AI bar only accepts pasted text
**Severity: medium (missing feature)**

`AIAssistBar.tsx` takes typed/pasted text only. Flow can take a dropped PDF/DOCX and extract
from it — and the code already exists (`api/flow/deals/extract/route.ts`,
`components/flow/FileDropZone.tsx`). The natural input to a counter-LOI is the PDF that just
landed in the inbox. Mostly wiring: point the existing extractor at `getVariableMap(docType)`.

### D7. Failures are invisible
**Severity: medium**

Five `console.error`-only paths in the editor. A failed initial generation
(`generateInitialPreview`, `:928`) leaves an empty white pane with no message and nothing to click.

### D8. Unknown doc type silently serves the wrong fields
**Severity: low**

`constants.ts:637` — `getVariableMap()`'s default case returns `LOI_BUILDING_VARIABLES` with a
`// fallback for now`. Same pattern in `getFieldSections()` (`:616`). A bad slug gives a Building
LOI's field set instead of an error.

### D9. Format
**Severity: medium**

- Split is **65% preview / 35% sidebar** (`complete/page.tsx:1972, 2039`), but 100% of the work
  happens in the sidebar, where up to 34 fields live. Backwards for the LOIs.
- The preview carries a disclaimer that template backgrounds won't show — so it isn't actually
  WYSIWYG, which undercuts the point of a live preview.
- Docs is the only module still on raw hex, Bebas, hand-rolled buttons and inline SVGs, with
  green as the action color (`text-green` on the "Change" folder link).
- The landing page's "Finder list" (`src/app/docs/page.tsx`) looks like nothing else in the app.

### D10. Minor
- `getSiteId()` is called twice on every save (`complete/page.tsx:1674` in the cached-token
  branch, then again unconditionally at `:1684`) — one wasted Graph round trip per save.
- `buildFileName()` hardcodes prefixes in an if-chain (`:842`); belongs in the `DOC_TYPES` config.
- `nullGetter: () => ""` in the generate route means a template token with no matching variable
  silently renders blank — no dev-time check that template tokens and variable maps agree. Worth
  a startup assertion now that the diff in D1 showed they can drift.

---

## Checklist

**Foundations**
- [ ] A1 — validate MSAL token server-side + `middleware.ts` over `/api/*`
- [ ] A4 — install vitest, add `npm test`, wire CI
- [ ] A2 — one cached `/api/listings` + `useListings()` hook everywhere
- [ ] A3 — `loading.tsx` per route
- [ ] A5 — role model (broker / admin)

**Docs correctness**
- [ ] D1 — `acreage`: add `{{acreage}}` to both listing-agreement templates, or drop the field
- [ ] D2 — require `flag: true` fields; gate Download as well as Save
- [ ] D3 — reset draft on entry + "resume this draft?" prompt

**Docs performance / UX**
- [ ] D4.1 — preserve preview scroll position
- [ ] D4.2 — cache cleaned template zip; `STORE` for previews
- [ ] D4.3 — replace full-pane overlay with a corner chip
- [ ] D7 — surface generation failures in the UI
- [ ] D9 — migrate Docs to the admin design system; revisit the 65/35 split

**Docs features**
- [ ] D5 — draft persistence + document history
- [ ] D6 — PDF/DOCX drop into the AI bar

**Cleanup**
- [ ] A7 — merge the two ParcelPickerModals; delete 4 orphaned components + 2 dead routes
- [ ] A8 — update CLAUDE.md (Intel, Logos, ui-refresh merged); move AI calls to Claude 5
- [ ] D8, D10 — error instead of fallback on unknown doc type; file-name prefixes into config;
      template-token/variable-map assertion
