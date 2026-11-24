# How CRE8 works

> Update this file when a tab or a process changes. The staff assistant reads it
> to answer "where do I..." and "how do I..." questions. Sections marked
> `[KEVIN: PROCESSES]` are Kevin's to write. Do not guess at them.
>
> Software sections were drafted from the code on Nov 24 2026. Anything marked
> *(confirm)* was read from route and component names only and should be checked
> by someone who uses that screen.

CRE8 Advisors does **Arizona commercial real estate** only. Never residential.

## 1. What CRE8 Admin is

CRE8 Admin is the staff-only portal. It is separate from the public website and
from the map (map.cre8advisors.com, its own app). Tabs across the top:
**Listings, Flow, Docs, Marketing, Logos, Demand**. There is also an **Intel**
page at `/intel` that is not in the top bar yet.

## 2. Signing in

Sign in with your CRE8 Microsoft account (`@cre8advisors.com`). Anyone else is
refused.

## 3. Listings (`/`)

The home page. It lists every listing with tabs for **All, Draft, Live, Under
Contract, Sold**, a search box, and filters for property type and broker.
New listings that still have an onboarding checklist appear in a **New
listings** section above the table.

- **Create or edit:** New listing (`/listings/new`) or click a row
  (`/listings/[id]`). The form holds the property details, spaces, photos, the
  offering package, the Alta survey and the site plan.
- **Publish:** the Publish step sends the listing to the public website
  (Webflow) and files the package, Alta survey, site plan and photos in
  SharePoint under the listing's folder.
- **Internal notes:** a private section at the top of the edit page (internal
  asking price, zoning and allowed uses, other notes). It shows only in the
  admin, never on the public site.
- **Spaces:** a listing can have several spaces (a pad, a suite), each with
  size, deal type, price or rate and status.
- **Freshness:** the public site is the source for listing fields. Admin
  reads a copy that refreshes **hourly**, so a change made in Webflow can take up
  to an hour to appear in the assistant.

## 4. Flow: deals (`/flow`)

The deal tracker. A toggle switches between **Sale** and **Lease** deals. Tabs
filter by **Active, Closed, Cancelled**.

- **Sale board** has three columns: **pre-escrow, due diligence, closing**.
  Dragging a card to another column changes the deal's status.
- **Lease board** has five stages: **negotiating LOI, signed LOI, draft lease,
  signed lease, invoiced**. Moving a deal into signed lease opens the form so
  the payment schedule can be confirmed.
- **Deal statuses:** active, due diligence, closing, closed, cancelled. Active
  deals move forward on their own when their key dates pass.
- **What a deal holds:** property address, price, commission rate, broker and
  broker split, extra splits (referral, co-broker), escrow open date,
  feasibility days, due-diligence extension, inside and outside close dates,
  escrow company and number, W-9 status for an outside broker, a SharePoint
  folder link, and notes. Critical dates can be an exact date or "N days after
  escrow opens".
- **Commission calculator** and **drop-a-file extraction:** drop an LOI, PSA or
  escrow document on a deal and AI reads the dates and terms for you to review.

## 5. Docs (`/docs`)

Build a letter or agreement from a template.

- **LOI:** Land Purchase, Building Purchase, Lease.
- **Listing Agreement:** Sale, Sale/Lease, Lease.

Pick a type, fill the form (or paste broker notes and let AI fill it), review
the preview, then generate. The Word file is saved to SharePoint under
`/CRE8 Advisors/Documents/LOIs/` (by type) and drafts under `/Drafts/`.
Generated documents are drafts for a person to read, not sent for you.

## 6. Marketing (`/marketing`)

Email for listings. Two views: **Calendar** (what is scheduled and when) and
**Analyze** (opens, clicks, bounces).

- **Three kinds of email:** Single (one listing), Multiple (several listings in
  one email), Custom (a plain email with no listing).
- **Audiences** are Resend lists: **Brokers, Buyers, Sellers**, plus one-off
  addresses. A person on two lists counts once.
- **Send now** or pick a date and time and **Schedule**. AI can suggest the send
  time.
- Recipient lists are never exported through the assistant.

## 7. Demand (`/demand`)

Who is looking for space. Brands (tenants) with their size ranges, markets and
whether they buy, lease, ground lease or build-to-suit. A **list** view and a
**map** view *(confirm)*. A listing is matched against brands that fit its size
and market. Staff can mark interest in a brand for a listing, or override a
match with a reason.

## 8. Logos (`/logos`)

A library of transparent brand logos for flyers and decks. Search by name,
alias or category, pick a color variant, then download or copy it. Dragging a
logo into Photoshop drops the full-size transparent PNG. Add a logo with the
add button.

## 9. Intel (`/intel`)

Market-intel briefs. Paste an article and AI writes a brief, which lands in
**Pending**. Review, edit, then **approve** to make it live. A live brief can be
unpublished, and a deleted one restored. Categories: data center, retail, land,
market, infrastructure.

## 10. The map (map.cre8advisors.com)

A separate app for Arizona commercial property: parcels and owners, zoning, comps, Dev Info and
site plans, planning cases, flood and opportunity zones, traffic. Open it from a
record to see the parcel.

## 11. Where files live

- **Company files:** SharePoint, site **CRE8 Operations**: `/Listings/Active/<name>/`
  (Package, Maps, Photos, Documents), `/Deals/<broker>/<deal>/Documents/`, LOIs
  under `/CRE8 Advisors/Documents/LOIs/`, drafts in `/Drafts/`.
- **Your own OneDrive:** only you can see it. The assistant never looks in
  anyone else's.
- Not searched: old site copies (`cre8-native`), Drone, Recordings, Copilot files.

## 12. This assistant

It answers questions and finds things; it does not change anything. It can look
up listings, deals and documents you can already open, and explain how the admin
works. It also answers general commercial real estate questions (lease types,
what an LOI is, cap rates), marked as general knowledge, not CRE8 data.

It will **not**: edit records, send or draft email, fill documents, list more
than 5 contacts, export lists, or answer residential or out-of-state questions.
For acting, drafting, long projects or lists, use **Grok Bot**.

Nothing you say here is saved. Reloading or signing out clears the chat.

## 13. `[KEVIN: PROCESSES]` How we work a listing

*Kevin fills this in: intake to live on the site.*

## 14. `[KEVIN: PROCESSES]` How we work a deal

*Kevin fills this in: LOI, PSA, escrow, close. Who drafts what, title company defaults.*

## 15. `[KEVIN: PROCESSES]` Who to call

*Kevin fills this in: who owns listings, marketing, Demand, the map. The team list
lives in `CRE8_TEAM` in `src/lib/constants.ts`.*

## 16. `[KEVIN: PROCESSES]` Email and lists

*Kevin fills this in: when to blast, which audience, and what "use Grok Bot" means
for list work.*
