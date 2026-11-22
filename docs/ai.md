# AI calls

Every model call goes through `src/lib/ai/client.ts`. The client talks to
xAI's OpenAI-compatible API at `https://api.x.ai/v1` with `XAI_API_KEY`.

| Feature | Route / module | Model |
|---|---|---|
| Fill an LOI or listing agreement from broker notes | `POST /api/docs/extract` | `grok-4.7` (flagship) |
| Read an uploaded LOI, PSA, or escrow file | `POST /api/flow/deals/extract` | `grok-4.7` |
| Pick a send time, and rebalance a week's calendar | `src/lib/email/ai-scheduler.ts` | `grok-4.7` |
| Draft a listing email body | `POST /api/email/body-draft` | `grok-4.3` (fast) |
| Turn a pasted article into a market-intel brief | `POST /api/intel/process` | `grok-4.3` |

`grok-4.7` is xAI's flagship model. `grok-4.3` is the cheaper, faster model
and is used with reasoning turned off. Those names came from the xAI model
docs (https://docs.x.ai/developers/models).

Prompts are unchanged. JSON answers are still parsed in the feature that
asked for them, including the old fallback that pulls the first `{...}` out
of a reply that grew a sentence around it. No feature streams.

## Deal files (PDF and Word)

Word files are still converted with mammoth and cut at about 30,000
characters. PDFs used to be sent to Claude as native documents. They are now
read with pdf.js first (`src/lib/flow/pdf-text.ts`), then the text is sent
to Grok with the same prompt and the same 30,000-character cut.

That works for a normal text PDF and for a scan that already has a hidden
text layer (a "searchable" PDF). It does not work for a scan that is only
pictures of pages. Those come back with a clear error asking for a
searchable PDF or a Word file. There is no OCR step. A password-protected
PDF is rejected the same way.

## Opting one feature back to Claude

Pass `provider: "anthropic"` to `completeText`. That call needs
`ANTHROPIC_API_KEY`. Leave the provider unset and the call stays on Grok.
Nothing in the app passes `anthropic` today.

## Going live

1. In the Vercel project for this app, add `XAI_API_KEY` (from
   https://console.x.ai/) for Production, and for Preview if you test there.
2. Redeploy.
3. Confirm a form fill, a text-PDF deal upload, a send-time placement, a
   listing draft, and an intel brief.
4. Then remove `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` from Vercel. Those
   keys are no longer read.
