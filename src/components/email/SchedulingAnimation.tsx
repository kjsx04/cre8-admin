"use client";

import { useState, useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import { Button, Spinner } from "@/components/ui";

interface SchedulingAnimationProps {
  /** Whether the actual API call has completed successfully */
  apiDone: boolean;
  /** Whether the API call failed */
  apiError: string | null;
  /** Called after the success hold + slide-out finishes */
  onComplete: () => void;
  /** Called when user clicks retry after an error */
  onRetry: () => void;
  /** "create" = full 5-step 20s build-up, "edit" = quick 2-step confirmation */
  mode?: "create" | "edit";
}

// Create mode: steps 0-2 build up over ~20s, step 3 holds until API, step 4 wraps up
const CREATE_STEPS = [
  { label: "Creating email template...", duration: 6000 },
  { label: "Analyzing your campaign...", duration: 7000 },
  { label: "Reviewing current schedule...", duration: 7000 },
  { label: "AI optimizing send time...", duration: 0 }, // holds until apiDone
  { label: "Finalizing campaign...", duration: 400 },
];

// Edit mode: step 0 holds until API, step 1 wraps up fast
const EDIT_STEPS = [
  { label: "Confirming changes...", duration: 0 }, // holds until apiDone
  { label: "Finalizing...", duration: 400 },
];

export default function SchedulingAnimation({
  apiDone,
  apiError,
  onComplete,
  onRetry,
  mode = "create",
}: SchedulingAnimationProps) {
  // Pick step config based on mode
  const STEPS = mode === "edit" ? EDIT_STEPS : CREATE_STEPS;
  const AI_HOLD_INDEX = mode === "edit" ? 0 : 3;
  const SUCCESS_LABEL = mode === "edit" ? "Updated!" : "Scheduled!";
  // Current step index — STEPS.length means we're on the final "Scheduled!" state
  const [currentStep, setCurrentStep] = useState(0);
  const [done, setDone] = useState(false);
  // Controls CSS slide-in/out — starts false, set true after mount, set false to slide out
  const [mounted, setMounted] = useState(false);
  // Track whether we've started the slide-out so we don't double-fire onComplete
  const slidingOut = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const apiDoneRef = useRef(apiDone);
  apiDoneRef.current = apiDone;

  // Trigger the slide-in on first render
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Auto-advance through steps on timers
  useEffect(() => {
    if (done || apiError) return;

    // Past all steps — show "Scheduled!" then start slide-out
    if (currentStep >= STEPS.length) {
      setDone(true);
      // Hold the green success state for 2s, then slide out
      timerRef.current = setTimeout(() => {
        slidingOut.current = true;
        setMounted(false); // triggers CSS slide-out
        // Wait for the slide-out animation (300ms) then call onComplete
        setTimeout(onComplete, 350);
      }, 2000);
      return;
    }

    // AI hold step — wait for apiDone
    if (currentStep === AI_HOLD_INDEX) {
      if (apiDoneRef.current) {
        setCurrentStep((s) => s + 1);
      }
      return;
    }

    // Normal timed step
    timerRef.current = setTimeout(() => {
      setCurrentStep((s) => s + 1);
    }, STEPS[currentStep].duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStep, done, apiError, onComplete]);

  // When API finishes while holding on the AI step, advance
  useEffect(() => {
    if (apiDone && currentStep === AI_HOLD_INDEX && !done && !apiError) {
      setCurrentStep((s) => s + 1);
    }
  }, [apiDone, currentStep, done, apiError]);

  // Current step label (or success label when done)
  const activeLabel = done
    ? SUCCESS_LABEL
    : STEPS[currentStep]?.label || "Scheduling...";

  return (
    <div
      className="fixed bottom-6 left-6 z-50 w-80 transition-transform duration-500 ease-out"
      style={{
        transform: mounted ? "translateY(0)" : "translateY(calc(100% + 40px))",
        transitionDuration: mounted ? "500ms" : "300ms",
        transitionTimingFunction: mounted ? "cubic-bezier(0.16, 1, 0.3, 1)" : "ease-in",
      }}
    >
      {/* Floating layer — the one place a shadow is allowed */}
      <div
        className={`bg-surface rounded-modal shadow-popover border overflow-hidden transition-colors duration-300 ${
          done ? "border-accent/40" : apiError ? "border-danger/40" : "border-border"
        }`}
      >
        {/* Green left accent stripe (green = success / in progress status) */}
        <div className="flex">
          <div
            className={`w-1 shrink-0 transition-colors duration-300 ${
              done ? "bg-accent" : apiError ? "bg-danger" : "bg-accent/40"
            }`}
          />

          <div className="flex-1 px-4 py-3">
            {/* Error state */}
            {apiError ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-danger-bg text-danger-fg flex items-center justify-center shrink-0">
                    <X size={12} strokeWidth={2.5} />
                  </div>
                  <span className="text-sm text-danger-fg font-medium">Scheduling failed</span>
                </div>
                <p className="text-xs text-danger-fg pl-7">{apiError}</p>
                <Button size="sm" variant="secondary" onClick={onRetry} className="ml-7">
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {/* Active step label + spinner/checkmark */}
                <div className="flex items-center gap-2.5 mb-2">
                  {done ? (
                    // Green checkmark
                    <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center shrink-0">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  ) : (
                    // Shared spinner primitive
                    <Spinner size="sm" />
                  )}
                  <span
                    className={`text-sm font-semibold transition-colors duration-300 ${
                      done ? "text-accent-strong" : "text-text"
                    }`}
                  >
                    {activeLabel}
                  </span>
                </div>

                {/* Step-dot progress — completed steps as green dots, future as gray */}
                <div className="flex items-center gap-1.5 pl-7">
                  {STEPS.map((_, i) => {
                    const isComplete = i < currentStep || done;
                    const isCurrent = i === currentStep && !done;
                    return (
                      <div
                        key={i}
                        className={`rounded-full transition-all duration-300 ${
                          isComplete
                            ? "w-2 h-2 bg-accent"
                            : isCurrent
                            ? "w-2.5 h-2.5 bg-accent/50"
                            : "w-1.5 h-1.5 bg-border-strong"
                        }`}
                      />
                    );
                  })}
                  {/* Final dot for "Scheduled!" */}
                  <div
                    className={`rounded-full transition-all duration-300 ${
                      done ? "w-2 h-2 bg-accent" : "w-1.5 h-1.5 bg-border-strong"
                    }`}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
