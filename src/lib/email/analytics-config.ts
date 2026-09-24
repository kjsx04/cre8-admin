/**
 * Every threshold that decides what counts as a real human.
 *
 * All of these are tuned against the first real blast (broadcast
 * 0fb91110-…, 860 sent, 2026-09-23). The raw numbers there read as a 46.7%
 * click-through rate — 343 clickers and 1,689 clicks from 734 delivered — which
 * is corporate link scanning, not interest. With these values it comes out at
 * 70 human clickers and 9.5%, which is believable for a cold broker list.
 *
 * Change a number here and nowhere else. Nothing in the analytics code carries
 * its own constant.
 */

/** A click this soon after delivery was a machine, not a person opening an email. */
export const PRE_DELIVERY_CLICK_SECONDS = 10;

/**
 * Burst detection: one recipient hammering links in a few seconds.
 *
 * The brief that started this work counted DISTINCT LINKS only. On real data
 * that missed the dominant pattern entirely — 214 recipients fired 3 clicks
 * across just 2 distinct links in 0.2 seconds, and a distinct-links rule scores
 * that as 2 and lets it through. Counting clicks catches it.
 */
export const BURST_WINDOW_SECONDS = 5;
export const BURST_MIN_CLICKS = 3;
export const BURST_MIN_DISTINCT_LINKS = 3;

/** An "open" this soon after delivery is a proxy prefetching, not a person reading. */
export const INSTANT_OPEN_SECONDS = 2;

/**
 * Scanners that say who they are.
 *
 * Worth keeping even though it catches little here: on this data only the
 * Outlook prefetch agent matches (~65 events). CRE8's scanners spoof ordinary
 * Chrome. Other senders' scanners are more honest, and this costs nothing.
 */
export const SCANNER_UA_PATTERNS: RegExp[] = [
  /safelinks/i,
  /microsoft.*(defender|atp)/i,
  /ms-office/i,
  /mimecast/i,
  /proofpoint/i,
  /barracuda/i,
  /ironport/i,
  /symantec/i,
  /forcepoint/i,
  /trendmicro/i,
  /googleimageproxy/i,
  /google-?safety/i,
  /python-requests/i,
  /\bcurl\//i,
  /\bwget\b/i,
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /bot\b|crawler|spider/i,
];

/**
 * Scanners that lie about who they are.
 *
 * The real tell is a single identical user agent appearing across an
 * implausible share of one send's recipients. Chrome/109 (an early-2023 build)
 * showed up on 352 recipients of one blast — real people are spread across many
 * browser versions. A quarter of a send is far past coincidence.
 *
 * The "one human click makes you human" override means a wrongly flagged real
 * person is not lost, only that one click.
 */
export const UA_BROADCAST_SHARE_SCANNER = 0.25;

/** Below this many recipients the share rule is noise, so it is skipped. */
export const UA_SHARE_MIN_RECIPIENTS = 20;

/**
 * Apple Mail Privacy Protection preloads images for real recipients, so the
 * person is genuine but the open time and the fact of the open mean nothing.
 * These are marked unreliable rather than bot.
 */
export const APPLE_MPP_UA_PATTERNS: RegExp[] = [/applemail/i, /apple-?mail/i, /macoutlook/i];

/** Engagement score: clicks are worth more than opens, and recent beats old. */
export const ENGAGEMENT_CLICK_WEIGHT = 3;
export const ENGAGEMENT_OPEN_WEIGHT = 1;
export const ENGAGEMENT_HALF_LIFE_DAYS = 30;
