# Custom emails

The marketing composer builds three kinds of email. `campaign_kind` on
`email_campaigns` says which:

| `campaign_kind` | In the composer | What it is |
|---|---|---|
| `single` | **Single** | One listing — hero photo, stats grid, VIEW FULL LISTING button |
| `group` | **Multiple** | Several listing cards in one email |
| `custom` | **Custom** | A normal email. No listing. Subject, body, audience, send. |

## What a custom email is for

Telling every broker something. Sending a note to every seller. Anything that
isn't about one property.

You pick an audience the same way as the other two (the live Resend segments —
Brokers, Buyers, Sellers, plus any one-off addresses), write a subject and a
body, and then either **Send now** or set a date and time and hit **Schedule**.

## What it looks like

The same CRE8 chrome as a listing email — logo header, your broker card, the
unsubscribe footer — with the listing furniture removed:

- no hero photo
- no stats grid
- no CTA button
- the body is rich text (paragraphs, **bold**, *italic*, bullets, numbers, links)
  instead of a single escaped paragraph

The template branches on `vars.isCustom` inside `renderEmailHtml`
(`src/lib/email/constants.ts`). `buildTemplateVars` sets it from
`campaign_kind` and puts the cleaned body HTML on `vars.bodyHtml`.

## The body

Custom emails store HTML in `body_text`. Single and group emails still store
plain text there — their template escapes it, so HTML would show as literal
tags.

Two modules handle the HTML:

- `src/lib/rich-text.ts` — the editor's cleaner. Keeps
  `<p> <ul> <ol> <li> <strong> <em> <br> <a href>` and nothing else. Runs in the
  browser as you type and on every paste, so Word and Outlook formatting is
  stripped automatically.
- `src/lib/email/body-html.ts` — the email side.
  `sanitizeEmailBodyHtml` is the same allowlist applied again on the server (the
  safety net for whatever reaches it), and `renderEmailBodyHtml` puts the styles
  back **inline**, because Outlook ignores `<style>` blocks for these tags.

Links only survive with an `http`, `https`, `mailto` or `tel` address. The
editor puts `https://` in front of a bare domain and `mailto:` in front of a
bare email address.

`RichTextEditor` is shared with the listing form, so property overviews can
take links now too.

## No listing, but still one id

A custom email has no listing, but almost everything downstream (schedules,
sends, stats, alerts) keys off `listing_id`. So, exactly like group emails,
the API mints a synthetic one on create:

- group → `group:<uuid>`
- custom → `custom:<uuid>`

Two consequences worth knowing:

1. **`listing_priorities` is skipped.** `placeForCampaign` is never called for a
   custom email — it would leave a ranked row for a listing that doesn't exist.
2. **The CMS is never queried.** `hydrateCampaignListing` ignores both synthetic
   prefixes, so no Webflow fetch happens on a preview or a send.

`campaign_kind` is plain `text not null default 'single'` with no enum or CHECK
constraint, so `'custom'` needed **no migration**.

## Scheduling

Listing campaigns are placed on the calendar, where the AI picks a slot around
listing priority and listing spacing. A custom email has neither, so it books
its own slot:

```
POST /api/email/campaigns/[id]/schedule-at
{ "send_date": "2026-11-14", "send_time": "09:00" }   // Phoenix time
```

The route validates the slot with `testSendIso` (a plain date + time → Phoenix
ISO helper; nothing test-specific about it) and then calls `applySlotAndSync`,
the same function the calendar's Test mode uses. That sets the status, stamps the
template version, pushes the broadcast to Resend, stores `provider_send_id` and
records the send.

Guards: custom kind only, `draft` or `scheduled` status only, an audience must
be set, and the time can't be in the past. `POST .../place` refuses custom
campaigns, and the "Schedule" button on a saved custom draft reopens the
composer rather than the placement bar.

**Send now** is unchanged — `POST .../send-now` never branched on
`campaign_kind`.

## Rescheduling

Open the custom email from the calendar, change the date or time in the **Send**
box and press **Schedule** again. The Reschedule and Refresh listing buttons are
hidden for custom emails (both are listing-driven); **Sync template** still
works.

## Where the code lives

| File | What changed |
|---|---|
| `src/lib/email/types.ts` | `CampaignKind` gained `"custom"`; `EmailTemplateVars` gained `isCustom` + `bodyHtml` |
| `src/lib/email/constants.ts` | `buildTemplateVars` + `renderEmailHtml` custom branches; template version bumped |
| `src/lib/email/body-html.ts` | **new** — sanitize + inline-style the rich-text body |
| `src/lib/email/subject.ts` | custom subject fallback |
| `src/lib/email/listing-hydrate.ts` | skips `custom:` ids |
| `src/lib/rich-text.ts` | keeps `<a href>` |
| `src/components/RichTextEditor.tsx` | Link / Unlink toolbar button + inline link bar |
| `src/components/email/composer/useCampaignDraft.ts` | `sendDate` / `sendTime`; custom payload + validation |
| `src/components/email/composer/EmailComposer.tsx` | Custom type, section gating, rich-text body, Send section |
| `src/components/email/composer/ScheduledActions.tsx` | hides listing-only actions |
| `src/app/api/email/campaigns/route.ts` | custom create path, no ranking |
| `src/app/api/email/campaigns/[id]/route.ts` | `campaign_kind` passes all three values |
| `src/app/api/email/campaigns/[id]/schedule-at/route.ts` | **new** — exact date/time |
| `src/app/api/email/campaigns/[id]/place/route.ts` | refuses custom |
| `src/components/email/schedule/OffScheduleSection.tsx` | Schedule reopens the composer for custom |

Tests: `npx tsx src/lib/email/body-html.test.ts` and
`npx tsx src/lib/email/custom-email.test.ts`.
