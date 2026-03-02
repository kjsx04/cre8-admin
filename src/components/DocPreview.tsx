"use client";

import { useEffect, useRef, useState } from "react";

interface DocPreviewProps {
  /** Base64 data URL of the .docx file (e.g. "data:application/...;base64,ABC...") */
  fileBase64: string;
}

/**
 * Renders a .docx file as a scrollable preview inside a white container.
 * Uses docx-preview (dynamic import to avoid SSR issues).
 */
export default function DocPreview({ fileBase64 }: DocPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!fileBase64 || !containerRef.current) return;

    let cancelled = false;

    async function render() {
      try {
        // Dynamic import — docx-preview needs browser DOM
        const docxPreview = await import("docx-preview");

        if (cancelled) return;

        // Convert base64 data URL to ArrayBuffer
        const base64Data = fileBase64.split(",")[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Clear previous render
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        // Render the document
        // Pass document.head as styleContainer — undefined causes docx-preview
        // to construct URLs from "undefined", triggering null:1 404 errors in console
        await docxPreview.renderAsync(bytes.buffer, containerRef.current!, document.head, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: false,
          trimXmlDeclaration: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });

        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error("DocPreview render error:", err);
        if (!cancelled) {
          setError("Could not render document preview.");
          setLoading(false);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [fileBase64]);

  if (error) {
    return (
      <div className="bg-dark-gray border border-border-gray rounded-card p-6 text-center">
        <p className="text-medium-gray text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Loading overlay while rendering */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-gray rounded-card z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-green border-t-transparent rounded-full animate-spin" />
            <p className="text-medium-gray text-sm">Rendering preview...</p>
          </div>
        </div>
      )}

      {/* The docx-preview renders into this container */}
      <div
        ref={containerRef}
        className="docx-preview-container border border-border-gray"
        style={{ minHeight: loading ? "300px" : undefined }}
      />
    </div>
  );
}
