"use client";

import { useState, useEffect, useRef } from "react";

interface SchedulingAnimationProps {
  /** Whether the actual API call has completed successfully */
  apiDone: boolean;
  /** Whether the API call failed */
  apiError: string | null;
  /** Called after the success hold + slide-out finishes */
  onComplete: () => void;
  /** Called when user clicks retry after an error */
  onRetry: () => void;
}

// Steps 0-2 build up over ~20s, step 3 holds until API resolves,
// step 4 wraps up fast, then "Scheduled!" flashes green and slides out
const STEPS = [
  { label: "Creating email template...", duration: 6000 },
  { label: "Analyzing your campaign...", duration: 7000 },
  { label: "Reviewing current schedule...", duration: 7000 },
  { label: "AI optimizing send time...", duration: 0 }, // holds until apiDone
  { label: "Finalizing campaign...", duration: 400 },
];

const AI_STEP_INDEX = 3;

export default function SchedulingAnimation({
  apiDone,
  apiError,
  onComplete,
  onRetry,
}: SchedulingAnimationProps) {
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
    if (currentStep === AI_STEP_INDEX) {
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
    if (apiDone && currentStep === AI_STEP_INDEX && !done && !apiError) {
      setCurrentStep((s) => s + 1);
    }
  }, [apiDone, currentStep, done, apiError]);

  // Current step label (or "Scheduled!" when done)
  const activeLabel = done
    ? "Scheduled!"
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
      <div
        className={`bg-white rounded-lg shadow-lg border overflow-hidden transition-colors duration-300 ${
          done ? "border-green/40" : apiError ? "border-red-300" : "border-border-light"
        }`}
      >
        {/* Green left accent stripe */}
        <div className="flex">
          <div
            className={`w-1 shrink-0 transition-colors duration-300 ${
              done ? "bg-green" : apiError ? "bg-red-400" : "bg-green/40"
            }`}
          />

          <div className="flex-1 px-4 py-3">
            {/* Error state */}
            {apiError ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <span className="text-red-500 text-xs font-bold">&times;</span>
                  </div>
                  <span className="text-sm text-red-600 font-medium">Scheduling failed</span>
                </div>
                <p className="text-xs text-red-500 pl-7">{apiError}</p>
                <button
                  onClick={onRetry}
                  className="ml-7 px-3 py-1 bg-charcoal text-white text-xs font-medium rounded-btn hover:bg-dark-gray transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                {/* Active step label + spinner/checkmark */}
                <div className="flex items-center gap-2.5 mb-2">
                  {done ? (
                    // Green checkmark
                    <div className="w-5 h-5 rounded-full bg-green flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    // Green spinner
                    <div className="w-5 h-5 border-2 border-green border-t-transparent rounded-full animate-spin shrink-0" />
                  )}
                  <span
                    className={`text-sm font-semibold transition-colors duration-300 ${
                      done ? "text-green" : "text-charcoal"
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
                            ? "w-2 h-2 bg-green"
                            : isCurrent
                            ? "w-2.5 h-2.5 bg-green/50"
                            : "w-1.5 h-1.5 bg-border-medium"
                        }`}
                      />
                    );
                  })}
                  {/* Final dot for "Scheduled!" */}
                  <div
                    className={`rounded-full transition-all duration-300 ${
                      done ? "w-2 h-2 bg-green" : "w-1.5 h-1.5 bg-border-medium"
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
