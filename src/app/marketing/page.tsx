"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Marketing index — redirect to the default module (Email)
export default function MarketingPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/marketing/email");
  }, [router]);
  return null;
}
