# Staff assistant: maintainer notes

A read-only chat for staff (Phase A is the groundwork; the chat itself comes in
later phases). Plan: `CRE8_ADMIN_ASSISTANT_PLAN.md` (kept by Kevin).

## What is here so far

| File | What it does |
|---|---|
| `docs/HOW-CRE8-WORKS.md` | The guide the assistant reads. Update it when a tab or process changes. Kevin writes the `[KEVIN: PROCESSES]` sections. |
| `supabase/migrations/2026-11-24_assistant_usage.sql` | The usage log. One row per model call. Undo with the `_rollback.sql` next to it. |
| `src/components/assistant/Assistant.tsx` | The orb (bottom-right on every page, mounted in `AppShell`) and the chat it opens: full screen on phones, a right-hand panel on desktop. |
| `src/components/assistant/AssistantOrb.tsx` + `globals.css` ("Assistant orb") | The spinning glass orb. States: idle (slow spin), thinking (fast + glow), done (pop, ripple, green dot). Stops moving under "reduce motion". |
| `src/lib/assistant/client-store.ts` | The chat in the browser. Lives outside React so closing the panel or changing pages does not lose an answer in progress. Gone on refresh (chat is never saved). |
| `src/lib/assistant/sse-client.ts` | Reads the stream from `/api/assistant/chat`. Tested in `sse-client.test.ts`. |
| `src/lib/assistant/budget.ts` | Cost estimate, the Arizona month and day, the monthly cap, the rate limit and the staff-email check. Pure functions, tested in `budget.test.ts`. |

## Changing the cap or a model

- **Monthly cap:** set `ASSISTANT_MONTHLY_BUDGET_USD` in Vercel (default 50). It counts calendar months in Arizona time and resets at midnight on the 1st.
- **Model:** set `ASSISTANT_FAST_MODEL` / `ASSISTANT_SUMMARY_MODEL`. If you pick a model that is not in the rate table in `budget.ts`, it is priced at the most expensive known rate, so the cap stays safe. Add its real rate to the table.
- Never point this assistant at `grok-4.7` or another flagship model.

## Rules that are enforced in code, not just in the prompt

- Only `@cre8advisors.com` Microsoft accounts (`isStaffEmail`). A token with no email is refused.
- Read-only everywhere. No send, draft, edit or export.
- At most 5 contacts and 10 messages per answer.
- Chat is never saved.

## Known to check later

Whether xAI's `completion_tokens` already includes reasoning tokens. `estimateCostUsd` adds them on top, which can overstate the cost a little (safe for a cap). Compare against a real xAI usage line and adjust.
