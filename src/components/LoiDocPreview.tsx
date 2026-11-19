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
        <span
          key={index}
          style={{
            fontFamily: run.fontFamily,
            fontSize: `${run.sizePt}pt`,
            fontWeight: run.bold ? 700 : 400,
            fontStyle: run.italic ? "italic" : "normal",
            color: run.color || undefined,
            textDecoration: run.underline ? "underline" : undefined,
          }}
        >
          {run.text}
        </span>
      ))}
    </>
  );
}

function PieceView({ piece }: { piece: PagePiece }) {
  const inner = <BlockView block={piece.block} />;
  if (!piece.clip && !piece.offset) return inner;
  return (
    <div style={piece.clip ? { maxHeight: piece.clip, overflow: "hidden" } : undefined}>
      <div style={piece.offset ? { marginTop: -piece.offset } : undefined}>{inner}</div>
    </div>
  );
}

function BlockView({ block }: { block: PreviewBlock }) {
  if (block.kind === "break") return null;
  if (block.kind === "blank") return <div className="loi-line loi-blank" style={{ minHeight: `${block.linePt}pt` }} />;
  const runs = [...block.left, ...block.right];
  const lead = runs.reduce((best, run) => (run.sizePt > best.sizePt ? run : best), runs[0]);
  // The container font is the line's strut. A Calibri strut inside a Cambria
  // paragraph makes every line one pixel too tall.
  const metrics = {
    lineHeight: `${block.linePt}pt`,
    fontFamily: lead?.fontFamily,
    fontSize: `${lead?.sizePt || 11}pt`,
  };
  if (block.kind === "columns") {
    return (
      <div className="loi-columns" style={{ ...metrics, gridTemplateColumns: `${block.hangInches}in minmax(0, 1fr)` }}>
        <div className="loi-columns-hang">
          {block.number && <span className="loi-num">{block.number}</span>}
          <span><Runs runs={block.left} /></span>
        </div>
        <div className="loi-columns-value" style={{ textAlign: block.align === "justify" ? "justify" : "left" }}>
          <Runs runs={block.right} />
        </div>
      </div>
    );
  }
  return (
    <div className="loi-line" style={{ ...metrics, textAlign: block.align }}>
      {block.number && <span className="loi-num">{block.number} </span>}
      <Runs runs={block.left} />
    </div>
  );
}

interface PagePiece {
  block: PreviewBlock;
  /** Hide this many pixels from the top (continuation of a split paragraph). */
  offset: number;
  /** Show only this many pixels (paragraph continues on the next page). */
  clip: number;
}

/** Whole line boxes only, so a page never ends in the middle of a line. */
function wholeLines(space: number, line: number): number {
  if (line <= 0) return 0;
  return Math.floor(space / line) * line;
}

function paginate(blocks: PreviewBlock[], heights: number[], steps: number[], limit: number): PagePiece[][] {
  const pages: PagePiece[][] = [];
  let current: PagePiece[] = [];
  let used = 0;

  const pushPage = () => {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  };

  const chainEnd = (start: number) => {
    let index = start;
    while (index < blocks.length && blocks[index].kind !== "break" && blocks[index].keepNext) index += 1;
    return Math.min(blocks.length, index + 1);
  };

  blocks.forEach((block, index) => {
    if (block.kind === "break") {
      pushPage();
      return;
    }
    const step = steps[index] > 0 ? steps[index] : 18;
    let height = heights[index] || 0;
    let offset = 0;
    if (block.keepNext && current.length > 0) {
      const end = chainEnd(index);
      let group = 0;
      for (let cursor = index; cursor < end; cursor += 1) group += heights[cursor] || 0;
      if (used + group > limit && group <= limit) pushPage();
    }
    if (current.length > 0 && used + height > limit) {
      const room = wholeLines(limit - used, step);
      if (room >= step && block.kind !== "blank" && !block.keepNext) {
        current.push({ block, offset: 0, clip: room });
        pushPage();
        offset = room;
        height -= room;
      } else {
        pushPage();
      }
    }
    let chunk = wholeLines(limit, step);
    if (chunk < step) chunk = limit;
    while (height > limit) {
      current.push({ block, offset, clip: chunk });
      pushPage();
      offset += chunk;
      height -= chunk;
    }
    current.push({ block, offset, clip: 0 });
    used += height;
  });
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

export default function LoiDocPreview({ bytes }: { bytes: Uint8Array }) {
  const model = useMemo(() => loiPreviewModel(bytes), [bytes]);
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PagePiece[][] | null>(null);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!model || !root) return;
    const limit = root.clientHeight || 800;
    const nodes = Array.from(root.children) as HTMLElement[];
    const heights = nodes.map((node) => node.offsetHeight);
    const steps = nodes.map((node) => {
      const line = parseFloat(getComputedStyle(node).lineHeight);
      return Number.isFinite(line) && line > 0 ? line : 18;
    });
    setPages(paginate(model.blocks, heights, steps, limit));
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
            {page.map((piece, index) => (
              <PieceView key={index} piece={piece} />
            ))}
          </div>
          {model.footer && <div className="loi-page-footer">{model.footer}</div>}
        </article>
      ))}
    </div>
  );
}
