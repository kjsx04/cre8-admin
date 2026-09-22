"use client";

import { LoadingBlock } from "@/components/ui";

/**
 * LoadingSpinner — kept for existing call sites; it is now just the shared
 * LoadingBlock (neutral spinner + optional message). New code should import
 * { Spinner, LoadingBlock } from "@/components/ui" directly.
 */
export default function LoadingSpinner({ message }: { message?: string; size?: "sm" | "md" | "lg" }) {
  return <LoadingBlock message={message} className="py-0" />;
}
