"use client";

import { useState, useEffect, useRef } from "react";

interface SchedulingAnimationProps {
  /** Whether the actual API call has completed successfully */
  apiDone: boolean;
  /** Whether the API call failed */
  apiError: string | null;
  /** Called after the final "Scheduled!" step displays briefly */
  onComplete: () => void;
  /** Called when user clicks retry after an error */
  onRetry: () => void;
}

// Steps shown during the scheduling process
const STEPS = [
  { label: "Creating email template...", duration: 1000 },
  { label: "Analyzing your campaign...", duration: 1000 },
  { label: "Reviewing current schedule...", duration: 1500 },
  { label: "AI optimizing send time...", duration: 2000 },
  { label: "Finalizing campaign...", duration: 1000 },
];

const FINAL_STEP = "Scheduled!";

/** Multi-step progress animation shown while a campaign is being created/scheduled */
export default function SchedulingAnimation({
  apiDone,
  apiError,
  onComplete,
  onRetry,
}: SchedulingAnimationProps) {
  // Current step index (-1 = not started, STEPS.length = final "Scheduled!" step)
  const [currentStep, setCurrentStep] = useState(0);
  const [done, setDone] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const apiDoneRef = useRef(apiDone);
  apiDoneRef.current = apiDone;

  // Auto-advance through steps on timers
  useEffect(() => {
    if (done || apiError) return;

    // If we've reached the last simulated step, wait for the API to finish
    if (currentStep >= STEPS.length) {
      // API already done — show final step
      if (apiDoneRef.current) {
        setDone(true);
        timerRef.current = setTimeout(onComplete, 1200);
      }
      return;
    }

    // Advance to next step after current step's duration
    timerRef.current = setTimeout(() => {
      setCurrentStep((s) => s + 1);
    }, STEPS[currentStep].duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStep, done, apiError, onComplete]);

  // When API finishes and we're already past the last step, jump to done
  useEffect(() => {
    if (apiDone && currentStep >= STEPS.length && !done && !apiError) {
      setDone(true);
      timerRef.current = setTimeout(onComplete, 1200);
    }
  }, [apiDone, currentStep, done, apiError, onComplete]);

  // Error state
  if (apiError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 space-y-4">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
          <span className="text-red-500 text-lg font-bold">&times;</span>
        </div>
        <p className="text-sm text-red-600 text-center">{apiError}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-charcoal text-white text-sm font-medium rounded-btn hover:bg-dark-gray transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-10 px-6">
      <div className="w-full max-w-xs space-y-3">
        {/* Simulated steps */}
        {STEPS.map((step, i) => {
          const isComplete = i < currentStep || done;
          const isCurrent = i === currentStep && !done;
          const isPending = i > currentStep && !done;

          return (
            <div key={i} className="flex items-center gap-3">
              {/* Step indicator */}
              {isComplete ? (
                // Green checkmark
                <div className="w-5 h-5 rounded-full bg-green flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : isCurrent ? (
                // Green spinner
                <div className="w-5 h-5 border-2 border-green border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                // Gray dot
                <div className="w-5 h-5 rounded-full border-2 border-border-light shrink-0" />
              )}

              {/* Step label */}
              <span
                className={`text-sm transition-colors duration-300 ${
                  isComplete
                    ? "text-muted-gray"
                    : isCurrent
                    ? "text-charcoal font-semibold"
                    : isPending
                    ? "text-border-medium"
                    : ""
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}

        {/* Final "Scheduled!" step */}
        <div className="flex items-center gap-3">
          {done ? (
            <div className="w-5 h-5 rounded-full bg-green flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : currentStep >= STEPS.length ? (
            // Waiting for API — show spinner
            <div className="w-5 h-5 border-2 border-green border-t-transparent rounded-full animate-spin shrink-0" />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-border-light shrink-0" />
          )}
          <span
            className={`text-sm transition-colors duration-300 ${
              done
                ? "text-green font-bold"
                : currentStep >= STEPS.length
                ? "text-charcoal font-semibold"
                : "text-border-medium"
            }`}
          >
            {FINAL_STEP}
          </span>
        </div>
      </div>
    </div>
  );
}
