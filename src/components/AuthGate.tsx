"use client";

import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginScopes } from "@/lib/msal-config";
import { Button, Card, Spinner } from "@/components/ui";

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * AuthGate — shows the sign-in card until Microsoft auth completes,
 * then renders the app. Light, centered, one primary button.
 */
export default function AuthGate({ children }: AuthGateProps) {
  const isAuthenticated = useIsAuthenticated();
  const { instance, inProgress } = useMsal();

  const handleLogin = async () => {
    try {
      await instance.loginPopup(loginScopes);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  // Still loading auth state
  if (inProgress !== InteractionStatus.None) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Not authenticated — show login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <Card padding="lg" className="w-full max-w-sm text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cre8-logo.svg" alt="CRE8 Advisors" className="h-8 w-auto mx-auto mb-5" />
          <h1 className="text-xl font-semibold text-text tracking-tight">Admin</h1>
          <p className="text-sm text-text-2 mt-1 mb-6">Sign in to manage listings, deals, documents and email.</p>

          <Button
            size="lg"
            block
            onClick={handleLogin}
            icon={
              // Microsoft logo — brand colors are intentional
              <svg width="18" height="18" viewBox="0 0 21 21" fill="none" aria-hidden>
                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
              </svg>
            }
          >
            Sign in with Microsoft
          </Button>

          <p className="text-xs text-text-3 mt-5">CRE8 Advisors team members only</p>
        </Card>
      </div>
    );
  }

  // Authenticated — render children
  return <>{children}</>;
}
