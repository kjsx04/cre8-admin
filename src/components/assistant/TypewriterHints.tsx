"use client";

/**
 * The empty chat: example questions that type themselves out with a blinking
 * cursor, pause, delete, and move on to the next. It only shows what the
 * assistant can do; nothing here is clickable.
 *
 * Timing (all in this file):
 *   TYPE_MS   per character typed
 *   DELETE_MS per character deleted
 *   HOLD_MS   how long a finished question stays on screen
 *   GAP_MS    the pause on an empty line before the next question
 * With "reduce motion" on, the first question just sits there, fully written.
 */

import { useEffect, useState } from "react";

const QUESTIONS = [
  "What are we asking for Kenworthy & Combs?",
  "Which retail pads are available in Queen Creek?",
  "What deals are closing this month?",
  "Take me to the Pearce Farm deal",
  "Where do I upload a new listing?",
  "Give me the public link for Apollo Ranch",
  "What's live in Mesa under 2 acres?",
];

const TYPE_MS = 45;
const DELETE_MS = 18;
const HOLD_MS = 1800;
const GAP_MS = 350;

export default function TypewriterHints() {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // One step at a time: add a letter, hold, remove a letter, pause, next question.
  useEffect(() => {
    if (reduceMotion) return;
    const full = QUESTIONS[index];
    let delay: number;
    let next: () => void;

    if (!deleting && shown.length < full.length) {
      delay = TYPE_MS;
      next = () => setShown(full.slice(0, shown.length + 1));
    } else if (!deleting) {
      delay = HOLD_MS;
      next = () => setDeleting(true);
    } else if (shown.length > 0) {
      delay = DELETE_MS;
      next = () => setShown(full.slice(0, shown.length - 1));
    } else {
      delay = GAP_MS;
      next = () => {
        setDeleting(false);
        setIndex((i) => (i + 1) % QUESTIONS.length);
      };
    }
    const timer = window.setTimeout(next, delay);
    return () => window.clearTimeout(timer);
  }, [index, shown, deleting, reduceMotion]);

  const text = reduceMotion ? QUESTIONS[0] : shown;

  return (
    // Bottom-right of the chat, right-aligned: where the person's own question will appear.
    <div className="min-h-full flex items-end justify-end" aria-hidden="true">
      <p className="text-md text-text-2 text-right max-w-[85%]">
        {text}
        {/* The blinking cursor */}
        <span className="assistant-caret inline-block w-[2px] h-[1.1em] -mb-[0.15em] ml-0.5 bg-accent-strong align-baseline" />
      </p>
    </div>
  );
}
