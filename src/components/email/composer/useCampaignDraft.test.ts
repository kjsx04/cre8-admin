/**
 * npx tsx src/components/email/composer/useCampaignDraft.test.ts
 *
 * Guards the composer against its own autosaved drafts. A draft written by an
 * older build brought the whole page down with "Cannot read properties of
 * undefined (reading 'trim')" because emailSubject did not exist yet.
 */

import { normalizeDraft } from "./useCampaignDraft";

let failures = 0;
function assert(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${label}`);
  else {
    failures++;
    console.log(`FAIL  ${label}`, extra === undefined ? "" : extra);
  }
}

console.log("\nDrafts saved by an older build");
{
  // Exactly the shape that crashed: no emailSubject, no previewText
  const old = {
    kind: "single",
    listingId: "abc",
    listingName: "Blossom Rock",
    emailLabel: "Just Listed",
    headingText: "Retail pads",
    bodyText: "Some copy",
    segmentIds: ["seg-1"],
    extraEmails: [],
  };
  const d = normalizeDraft(old as never);

  assert("missing string fields come back as strings", typeof d.emailSubject === "string" && typeof d.previewText === "string", d);
  assert("every string field survives a trim", (() => {
    try {
      [d.emailSubject, d.previewText, d.emailLabel, d.headingText, d.bodyText, d.introText, d.listingName, d.photoUrl, d.partnerLogoUrl, d.listingPageUrl, d.endDate].forEach((v) => v.trim());
      return true;
    } catch {
      return false;
    }
  })());
  assert("typed values are kept", d.listingName === "Blossom Rock" && d.emailLabel === "Just Listed", d);
  assert("arrays are kept", d.segmentIds.length === 1 && d.segmentIds[0] === "seg-1", d.segmentIds);
  assert("brokerIds is always an array", Array.isArray(d.brokerIds), d.brokerIds);
}

console.log("\nCorrupt or hostile values fall back instead of crashing");
{
  const bad = {
    emailSubject: 42,              // wrong type
    highlights: "not an array",
    extraContactNames: ["nope"],   // array where an object belongs
    partnerLogoWidth: "120",       // string where a number belongs
    pinned: "yes",
    groupListings: null,
  };
  const d = normalizeDraft(bad as never);

  assert("wrong-typed string is replaced", d.emailSubject === "", d.emailSubject);
  assert("wrong-typed array is replaced", Array.isArray(d.highlights) && d.highlights.length === 0, d.highlights);
  assert("array is not accepted as an object", !Array.isArray(d.extraContactNames), d.extraContactNames);
  assert("wrong-typed number is replaced", d.partnerLogoWidth === 0, d.partnerLogoWidth);
  assert("wrong-typed boolean is replaced", d.pinned === false, d.pinned);
  assert("null falls back", Array.isArray(d.groupListings), d.groupListings);
}

console.log("\nNothing at all");
{
  const d = normalizeDraft(null);
  assert("null draft gives a usable blank", typeof d.emailSubject === "string" && Array.isArray(d.segmentIds), d);
  const e = normalizeDraft(undefined);
  assert("undefined draft gives a usable blank", typeof e.bodyText === "string", e);
}

console.log("\nThe old packed audience string still unpacks");
{
  // parseAudienceTokens only accepts real Resend UUIDs as segment ids
  const packed = "1680dbe6-1111-4111-8111-111111111111,kevin@cre8advisors.com";
  const d = normalizeDraft({ segmentId: packed } as never);
  assert("segmentId unpacks into segmentIds", d.segmentIds.length === 1, d.segmentIds);
  assert("segmentId unpacks into extraEmails", d.extraEmails[0] === "kevin@cre8advisors.com", d.extraEmails);
}

console.log(failures === 0 ? "\nall useCampaignDraft tests passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
