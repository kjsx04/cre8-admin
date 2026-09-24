"use client";

/**
 * The two lines an inbox shows before anyone opens the email.
 *
 * Both used to be derived from the same fields, so a phone showed the same
 * sentence twice and wasted the only two lines you get. Now both can be typed,
 * and the mock sits above the inputs so you are editing toward something you
 * can see rather than checking afterwards.
 *
 * The phone and desktop views differ in how much survives: a lock screen cuts
 * the subject around 42 characters, Outlook's message list shows roughly 60 and
 * gives the preview a full line of its own.
 */

import { useMemo, useState } from "react";
import { Smartphone, Monitor } from "lucide-react";
import {
  buildSubjectLine,
  buildPreviewText,
  previewEchoesSubject,
  SUBJECT_COMFORTABLE,
  SUBJECT_PHONE,
  PREVIEW_COMFORTABLE,
} from "@/lib/email/subject";
import { COMPOSER_FIELD } from "./composer-ui";

interface InboxLinesProps {
  subject: string;
  previewText: string;
  /** Everything the fallbacks are built from, so the mock matches the real send */
  campaign: {
    campaign_kind?: string;
    email_label?: string;
    listing_name?: string;
    heading_text?: string;
    body_text?: string;
    intro_text?: string;
  };
  senderName: string;
  onSubjectChange: (value: string) => void;
  onPreviewChange: (value: string) => void;
}

type Surface = "phone" | "desktop";

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

export default function InboxLines({
  subject,
  previewText,
  campaign,
  senderName,
  onSubjectChange,
  onPreviewChange,
}: InboxLinesProps) {
  const [surface, setSurface] = useState<Surface>("phone");

  // What will actually go out, typed value or fallback
  const finalSubject = useMemo(
    () => buildSubjectLine({ ...campaign, email_subject: subject }),
    [campaign, subject]
  );
  const finalPreview = useMemo(
    () => buildPreviewText({ ...campaign, email_subject: subject, preview_text: previewText }),
    [campaign, subject, previewText]
  );

  const echoes = previewEchoesSubject(finalSubject, finalPreview);
  const longSubject = finalSubject.length > SUBJECT_COMFORTABLE;
  const cut = CUTS[surface];
  const from = senderName || "CRE8 Advisors";

  return (
    <div className="space-y-2.5">
      {/* ── What it looks like in an inbox ── */}
      <div className="rounded-card border border-border bg-surface-2 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-label font-semibold uppercase tracking-wide text-text-3">
            {surface === "phone" ? "On a phone" : "In Outlook"}
          </p>
          <div className="flex items-center h-control-sm rounded-control bg-surface p-0.5 border border-border" role="group" aria-label="Preview surface">
            {([
              ["phone", Smartphone, "Phone"],
              ["desktop", Monitor, "Desktop"],
            ] as const).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSurface(id)}
                aria-pressed={surface === id}
                title={label}
                className={`flex items-center gap-1.5 px-2.5 h-full rounded-[4px] text-xs font-medium transition-colors ${
                  surface === id ? "bg-surface-2 text-text" : "text-text-3 hover:text-text"
                }`}
              >
                <Icon size={14} strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {surface === "phone" ? (
          /* Lock screen: sender, subject, preview — each on its own short line */
          <div className="rounded-control bg-surface border border-border px-3 py-2.5">
            <p className="text-sm font-semibold text-text leading-snug">{from}</p>
            <p className="text-sm text-text leading-snug">{asShown(finalSubject, cut.subject) || "No subject"}</p>
            <p className="text-xs text-text-3 leading-snug">
              {asShown(finalPreview, cut.preview) || "No preview text"}
            </p>
          </div>
        ) : (
          /* Outlook message list: sender and time on one line, then subject, then preview */
          <div className="rounded-control bg-surface border border-border px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-text truncate">{from}</p>
              <span className="text-label text-text-3 shrink-0">9:00 AM</span>
            </div>
            <p className="text-sm text-text leading-snug truncate">
              {asShown(finalSubject, cut.subject) || "No subject"}
            </p>
            <p className="text-xs text-text-3 leading-snug truncate">
              {asShown(finalPreview, cut.preview) || "No preview text"}
            </p>
          </div>
        )}

        {echoes && (
          <p className="text-xs text-warning-fg">
            The subject and the preview start with the same words, so it reads as the same line twice.
            Change one of them.
          </p>
        )}
      </div>

      {/* ── The two fields that drive it ── */}
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
    </div>
  );
}
