"use client";

/**
 * The two lines an inbox shows before anyone opens the email.
 *
 * Both used to be derived from the same fields, so a phone showed the same
 * sentence twice and wasted the only two lines you get. Now both can be typed.
 *
 * This file is in two halves on purpose. `InboxPreview` sits on the left, on
 * top of the email itself, so the notification and the email it opens are read
 * together at the same width. `InboxFields` — the inputs that drive it — stays
 * in the settings column with every other control.
 *
 * The phone and desktop views differ in how much survives: a lock screen cuts
 * the subject around 42 characters, Outlook's message list shows roughly 60 and
 * gives the preview a full line of its own.
 */

import { useMemo } from "react";
import {
  buildSubjectLine,
  buildPreviewText,
  previewEchoesSubject,
  SUBJECT_COMFORTABLE,
  SUBJECT_PHONE,
  PREVIEW_COMFORTABLE,
} from "@/lib/email/subject";
import { COMPOSER_FIELD } from "./composer-ui";

/** Everything the subject/preview fallbacks are built from, so the mock matches the real send */
export interface InboxCampaign {
  campaign_kind?: string;
  email_label?: string;
  listing_name?: string;
  heading_text?: string;
  body_text?: string;
  intro_text?: string;
}

/** Which device the left pane is imitating. Owned by the composer — the email follows it too. */
export type Surface = "phone" | "desktop";

/** Roughly what each client shows before it cuts */
const CUTS: Record<Surface, { subject: number; preview: number }> = {
  phone: { subject: 42, preview: 48 },
  desktop: { subject: 62, preview: 95 },
};

/** Cut the way a client cuts it, with a real ellipsis rather than a hard stop. */
function asShown(text: string, limit: number): string {
  const t = text.trim();
  return t.length <= limit ? t : `${t.slice(0, limit).trimEnd()}…`;
}

function useLines(subject: string, previewText: string, campaign: InboxCampaign) {
  const finalSubject = useMemo(
    () => buildSubjectLine({ ...campaign, email_subject: subject }),
    [campaign, subject]
  );
  const finalPreview = useMemo(
    () => buildPreviewText({ ...campaign, email_subject: subject, preview_text: previewText }),
    [campaign, subject, previewText]
  );
  return { finalSubject, finalPreview };
}

interface InboxPreviewProps {
  subject: string;
  previewText: string;
  campaign: InboxCampaign;
  senderName: string;
  surface: Surface;
}

/**
 * The notification, as it appears before the email is opened.
 *
 * Rendered above the email preview at the same width, so switching to Phone
 * shows the lock-screen line and the phone layout of the email in one move.
 */
export function InboxPreview({ subject, previewText, campaign, senderName, surface }: InboxPreviewProps) {
  const { finalSubject, finalPreview } = useLines(subject, previewText, campaign);
  const cut = CUTS[surface];
  const from = senderName || "CRE8 Advisors";

  return (
    <div className="rounded-card border border-[#A3A3A3] bg-surface px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-text truncate">{from}</p>
        <span className="text-label text-text-3 shrink-0">
          {surface === "phone" ? "now" : "9:00 AM"}
        </span>
      </div>
      {/* On a lock screen the subject wraps to a second line; Outlook's list truncates it */}
      <p className={`text-sm text-text leading-snug ${surface === "desktop" ? "truncate" : ""}`}>
        {asShown(finalSubject, cut.subject) || "No subject"}
      </p>
      <p className={`text-xs text-text-3 leading-snug ${surface === "desktop" ? "truncate" : ""}`}>
        {asShown(finalPreview, cut.preview) || "No preview text"}
      </p>
    </div>
  );
}

interface InboxFieldsProps {
  subject: string;
  previewText: string;
  campaign: InboxCampaign;
  onSubjectChange: (value: string) => void;
  onPreviewChange: (value: string) => void;
}

/** The two inputs that drive the preview, with their length warnings. */
export default function InboxFields({
  subject,
  previewText,
  campaign,
  onSubjectChange,
  onPreviewChange,
}: InboxFieldsProps) {
  const { finalSubject, finalPreview } = useLines(subject, previewText, campaign);
  const echoes = previewEchoesSubject(finalSubject, finalPreview);
  const longSubject = finalSubject.length > SUBJECT_COMFORTABLE;

  return (
    <div className="space-y-2.5">
      <div>
        <input
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder={buildSubjectLine({ ...campaign, email_subject: "" }) || "Subject line"}
          className={COMPOSER_FIELD}
        />
        <p className="mt-1 text-xs text-text-3 flex items-center gap-2 flex-wrap">
          <span className={longSubject ? "text-warning-fg" : ""}>{finalSubject.length} characters</span>
          {longSubject && (
            <span className="text-warning-fg">
              Desktop shows about {SUBJECT_COMFORTABLE}, phones about {SUBJECT_PHONE}. Put the property first.
            </span>
          )}
          {!subject.trim() && <span>Leave blank to use the heading and listing name.</span>}
        </p>
      </div>

      <div>
        <input
          value={previewText}
          onChange={(e) => onPreviewChange(e.target.value)}
          placeholder={
            buildPreviewText({ ...campaign, email_subject: subject, preview_text: "" }) ||
            "Preview line under the subject"
          }
          className={COMPOSER_FIELD}
        />
        <p className="mt-1 text-xs text-text-3">
          {finalPreview.length > PREVIEW_COMFORTABLE
            ? `${finalPreview.length} characters. Most of it will be cut.`
            : "The grey line under the subject. Blank uses the opening of your body text."}
        </p>
      </div>

      {echoes && (
        <p className="text-xs text-warning-fg">
          The subject and the preview start with the same words, so it reads as the same line twice.
          Change one of them.
        </p>
      )}
    </div>
  );
}
