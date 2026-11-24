"use client";

/**
 * Password sign-in for the automation bot. Deliberately not linked from
 * anywhere; people sign in with Microsoft. See src/lib/bot-auth.ts.
 */

import { useState, type FormEvent } from "react";
import { Button, Card } from "@/components/ui";
import { safeNextPath, storeBotSession } from "@/lib/bot-session";

async function signIn(password: string): Promise<string | null> {
  const res = await fetch("/api/auth/bot-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.status === 429) return "Too many attempts. Wait and try again.";
  if (!res.ok) return "That password was not accepted.";
  const data = (await res.json()) as { token?: string; expiresAt?: string };
  if (!data.token || !data.expiresAt) return "That password was not accepted.";
  storeBotSession(data.token, data.expiresAt);
  window.location.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
  return null;
}

export default function BotLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    const message = await signIn(password).catch(() => "That password was not accepted.");
    if (message) {
      setError(message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <Card padding="lg" className="w-full max-w-sm">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold text-text tracking-tight">Bot sign-in</h1>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 px-3 rounded-control border border-border bg-surface text-sm text-text"
          />
          {error && (
            <p role="alert" className="text-sm text-danger-fg">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" block loading={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
