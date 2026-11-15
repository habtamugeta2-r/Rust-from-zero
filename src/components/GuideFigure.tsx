"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Expand, X } from "lucide-react";

/**
 * A chapter figure: the diagram plate plus its caption, with a lightbox.
 * Diagrams are dense, so a reader can open one full-screen instead of
 * squinting at the reading column. The dialog is native <dialog>, so Esc,
 * focus return and backdrop dismissal come from the platform.
 */
export function GuideFigure({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <figure className="guide-figure">
      <button
        type="button"
        className="guide-figure-open"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge figure: ${alt}`}
      >
        <img src={src} alt={alt} loading="lazy" decoding="async" />
        <span className="guide-figure-zoom no-print" aria-hidden="true">
          <Expand className="h-3.5 w-3.5" />
          Enlarge
        </span>
      </button>
      {caption ? (
        <figcaption>
          <span className="guide-figure-label" aria-hidden="true">
            Figure
          </span>
          <span>{caption}</span>
        </figcaption>
      ) : null}

      <dialog
        ref={dialogRef}
        className="guide-lightbox"
        aria-label={alt}
        onClose={close}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="guide-lightbox-head">
          <span className="min-w-0 truncate">{alt}</span>
          <button
            type="button"
            onClick={close}
            className="guide-lightbox-close"
            aria-label="Close enlarged figure"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <img src={src} alt={alt} />
        {caption ? <p className="guide-lightbox-caption">{caption}</p> : null}
      </dialog>
    </figure>
  );
}
