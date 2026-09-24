"use client";

/**
 * Last-resort boundary — only fires when the root layout itself throws, which
 * is why it has to render its own <html> and <body> and cannot use any of the
 * app's providers or components.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, sans-serif", background: "#F7F7F8", color: "#111113" }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: "#5C5C63", marginTop: 8 }}>
              The app failed to start. Reloading usually clears it.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 20, height: 36, padding: "0 16px", borderRadius: 6,
                background: "#111113", color: "#fff", border: "none", fontSize: 14, cursor: "pointer",
              }}
            >
              Reload
            </button>
            <button
              onClick={reset}
              style={{
                marginTop: 20, marginLeft: 8, height: 36, padding: "0 16px", borderRadius: 6,
                background: "#fff", color: "#111113", border: "1px solid #E6E6E8", fontSize: 14, cursor: "pointer",
              }}
            >
              Try again
            </button>
            <p style={{ fontSize: 12, color: "#8A8A92", marginTop: 20, wordBreak: "break-word" }}>
              {error.message}
              {error.digest ? ` · ${error.digest}` : ""}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
