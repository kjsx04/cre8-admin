"use client";

/**
 * The CRE8 Assistant's glass orb. All the look and motion lives in globals.css
 * (search "Assistant orb"). This component only stacks the layers and sets the state.
 *
 *   <AssistantOrb state="idle" size={56} />      slow spin
 *   <AssistantOrb state="thinking" size={28} />  fast spin + breathing glow
 *   <AssistantOrb state="done" />                pop + ripple
 */
export type OrbState = "idle" | "thinking" | "done";

export default function AssistantOrb({ state = "idle", size = 56 }: { state?: OrbState; size?: number }) {
  return (
    <span
      className="orb block shrink-0"
      data-state={state}
      // Tiny orbs drop the sparkles and ring, which turn to mush below ~24px.
      data-size={size <= 24 ? "sm" : undefined}
      // The size is a CSS variable so every layer scales with it.
      style={{ ["--orb-size" as string]: `${size}px` }}
      aria-hidden="true"
    >
      <span className="orb-core" />
      <span className="orb-swirl" />
      <span className="orb-sparkles" />
      <span className="orb-band" />
      <span className="orb-gloss" />
    </span>
  );
}
