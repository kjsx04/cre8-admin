"use client";

import { useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { graphScopes } from "@/lib/msal-config";

/**
 * Hook that returns a function to acquire a Microsoft Graph access token.
 *
 * Tries silent acquisition first, falls back to a popup, returns null
 * if both fail. Same pattern used throughout the app (PublishModal,
 * Flow deal folders, etc.).
 */
export function useGraphToken() {
  const { instance, accounts } = useMsal();

  return useCallback(async (): Promise<string | null> => {
    try {
      const account = accounts[0];
      if (!account) return null;
      const response = await instance.acquireTokenSilent({
        ...graphScopes,
        account,
      });
      return response.accessToken;
    } catch {
      try {
        const response = await instance.acquireTokenPopup(graphScopes);
        return response.accessToken;
      } catch {
        return null;
      }
    }
  }, [instance, accounts]);
}
