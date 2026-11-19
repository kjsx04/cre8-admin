"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  loiPreviewModel,
  type PreviewBlock,
  type PreviewRun,
} from "@/lib/loi-page-model";
import "./loi-preview.css";

function Runs({ runs }: { runs: PreviewRun[] }) {
  return (
    <>
      {runs.map((run, index) => (
        <span key={index} style={{ fontWeight: run.bold ? 700 : 400, fontStyle: run.italic ? "italic" : "normal" }}>
          {run.text}
        </span>
      ))}
    </>
  );
}

function BlockView({ block }: { block: PreviewBlock }) {
  if (block.kind === "break") return null;
  if (block.kind === "blank") return <div className="loi-line" />;
  if (block.kind === "columns") {
    return (
      <div className="loi-columns" style={{ gridTemplateColumns: `${block.hangInches}in minmax(0, 1fr)` }}>
        <div className="loi-columns-hang">
          {block.number && <span className="loi-num">{block.number}</span>}
          <span><Runs runs={block.left} /></span>
        </div>
        <div><Runs runs={block.right} /></div>
      </div>
    );
  }
  return (
    <div className="loi-line">
      {block.number && <span className="loi-num">{block.number} </span>}
      <Runs runs={block.left} />
    </div>
  );
}

function paginate(blocks: PreviewBlock[], heights: number[], limit: number): PreviewBlock[][] {
  const pages: PreviewBlock[][] = [];
  let current: PreviewBlock[] = [];
  let used = 0;
  blocks.forEach((block, index) => {
    if (block.kind === "break") {
      if (current.length) pages.push(current);
      current = [];
      used = 0;
      return;
    }
    const height = heights[index] || 0;
    if (current.length > 0 && used + height > limit) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += height;
  });
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

export default function LoiDocPreview({ bytes }: { bytes: Uint8Array }) {
  const model = useMemo(() => loiPreviewModel(bytes), [bytes]);
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PreviewBlock[][] | null>(null);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!model || !root) return;
    const limit = root.clientHeight || 800;
    const heights = Array.from(root.children).map((node) => (node as HTMLElement).offsetHeight);
    setPages(paginate(model.blocks, heights, limit));
  }, [model]);

  if (!model) return null;

  return (
    <div className="loi-preview" style={pages ? undefined : { minHeight: 320 }}>
      <div className="loi-measure" ref={measureRef} aria-hidden>
        {model.blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
      {!pages && (
        <div className="flex items-center justify-center py-16">
          <p className="text-medium-gray text-sm">Rendering preview...</p>
        </div>
      )}
      {(pages || []).map((page, pageIndex) => (
        <article className="loi-page" key={pageIndex}>
          {model.letterheadBase64 && (
            <img className="loi-page-letterhead" alt="" src={`data:image/png;base64,${model.letterheadBase64}`} />
          )}
          <div className="loi-page-border" style={{ borderColor: model.borderColor }} />
          {model.logoBase64 && (
            <img className="loi-page-logo" alt="" src={`data:image/png;base64,${model.logoBase64}`} />
          )}
          <div className="loi-page-body">
            {page.map((block, index) => (
              <BlockView key={index} block={block} />
            ))}
          </div>
          {model.footer && <div className="loi-page-footer">{model.footer}</div>}
        </article>
      ))}
    </div>
  );
}
