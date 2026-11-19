"use client";

import { useEffect, useRef, useState } from "react";
import LoiDocPreview from "@/components/LoiDocPreview";

interface DocPreviewProps {
  /** Base64 data URL of the .docx file (e.g. "data:application/...;base64,ABC...") */
  fileBase64: string;
}

function bytesFromDataUrl(fileBase64: string): { bytes: Uint8Array; hasLetterhead: boolean } {
  const base64Data = fileBase64.split(",")[1] || "";
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return { bytes, hasLetterhead: binaryString.includes("loi-letterhead.png") };
}

/**
 * LOIs are drawn as letter pages from the generated docx so the preview
 * matches the download. Other documents still use docx-preview.
 */
export default function DocPreview({ fileBase64 }: DocPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loiBytes, setLoiBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (!fileBase64) return;
    let cancelled = false;

    async function render() {
      try {
        const { bytes, hasLetterhead } = bytesFromDataUrl(fileBase64);
        if (cancelled) return;
        if (hasLetterhead) {
          setLoiBytes(bytes);
          setLoading(false);
          return;
        }
        setLoiBytes(null);
        const docxPreview = await import("docx-preview");
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        await docxPreview.renderAsync(bytes.buffer, containerRef.current, undefined, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          ignoreFonts: true,
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

    setLoading(true);
    setError("");
    render();
    return () => {
      cancelled = true;
    };
  }, [fileBase64]);

  if (error) {
    return (
      <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-card p-6 text-center">
        <p className="text-medium-gray text-sm">{error}</p>
      </div>
    );
  }

  if (loiBytes) {
    return <LoiDocPreview bytes={loiBytes} />;
  }

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F5F5F5] rounded-card z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-green border-t-transparent rounded-full animate-spin" />
            <p className="text-medium-gray text-sm">Rendering preview...</p>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="docx-preview-container border border-[#E0E0E0]"
        style={{ minHeight: loading ? "300px" : undefined }}
      />
    </div>
  );
}
