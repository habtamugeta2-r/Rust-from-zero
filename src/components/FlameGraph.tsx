"use client";

import React, { useState } from "react";
import type { FlameNode } from "@/lib/guide-types";

function containsNode(node: FlameNode, targetId: string): boolean {
  if (node.id === targetId) return true;
  return node.children.some((c) => containsNode(c, targetId));
}

function FlameNodeBox({
  node,
  zoomId,
  onZoom,
  isTopRoot,
}: {
  node: FlameNode;
  zoomId: string | null;
  onZoom: (id: string | null) => void;
  isTopRoot: boolean;
}) {
  const isZoomedRoot = zoomId === node.id;
  const visible = !zoomId || containsNode(node, zoomId) || isZoomedRoot;
  if (!visible) return null;

  const isExpandedPath = Boolean(zoomId && containsNode(node, zoomId));
  const width = isExpandedPath ? 100 : node.widthPct;
  const pctLabel = `${Number(node.pct.toFixed(1))} %`;

  return (
    <div
      style={{ width: `${width}%` }}
      className="flex min-w-0 flex-col-reverse"
    >
      <button
        type="button"
        title={`${node.long}: ${pctLabel} of the running time`}
        aria-label={`${node.long}, ${pctLabel} of the running time. ${
          isTopRoot ? "Reset zoom" : "Zoom in"
        }`}
        onClick={() => onZoom(isTopRoot ? null : node.id)}
        style={{
          backgroundColor: `hsl(${node.hue} 85% 62%)`,
        }}
        className="mt-0.5 w-full truncate border border-white/60 px-1.5 py-1 text-left font-mono text-[11.5px] font-semibold text-stone-950 transition-opacity hover:opacity-90 dark:border-stone-900/60"
      >
        {node.label} <span className="font-normal opacity-80">{pctLabel}</span>
      </button>

      {node.children.length > 0 && (
        <div className="flex w-full items-end">
          {node.children.map((child) => (
            <FlameNodeBox
              key={child.id}
              node={child}
              zoomId={zoomId === node.id ? null : zoomId}
              onZoom={onZoom}
              isTopRoot={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FlameGraph({
  caption,
  roots,
}: {
  caption: React.ReactNode;
  roots: FlameNode[];
}) {
  const [zoomId, setZoomId] = useState<string | null>(null);

  return (
    <figure className="my-6 overflow-hidden rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-4 shadow-card">
      <div className="overflow-x-auto pb-1" data-scroll-pane tabIndex={0}>
        <div className="flex min-w-[560px] items-end">
          {roots.map((root) => (
            <FlameNodeBox
              key={root.id}
              node={root}
              zoomId={zoomId}
              onZoom={setZoomId}
              isTopRoot
            />
          ))}
        </div>
      </div>
      {zoomId && (
        <div className="mt-2 font-sans text-xs text-[var(--g-ink3)]">
          Zoomed in. Click the bottom bar or{" "}
          <button
            type="button"
            onClick={() => setZoomId(null)}
            className="font-semibold text-[var(--g-accent)] underline"
          >
            reset zoom
          </button>
          .
        </div>
      )}
      {caption && (
        <figcaption className="mt-3 font-sans text-xs text-[var(--g-ink3)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
