"use client";

interface ScheduleToolbarProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const BTN = "px-3 py-1 rounded-md bg-[#F0F0F0] hover:bg-[#E0E0E0] text-xs font-semibold text-charcoal transition-colors";

/** ‹ › Today + the Bebas period label */
export default function ScheduleToolbar({ label, onPrev, onNext, onToday }: ScheduleToolbarProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onPrev} className={BTN} title="Previous">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" onClick={onNext} className={BTN} title="Next">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" onClick={onToday} className={`${BTN} ml-1`}>
          Today
        </button>
      </div>
      <h2 className="font-bebas text-2xl tracking-wide text-charcoal">{label}</h2>
      <div className="w-[140px]" aria-hidden />
    </div>
  );
}
