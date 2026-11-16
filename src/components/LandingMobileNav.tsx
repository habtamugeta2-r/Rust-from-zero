"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

/** A native disclosure keeps navigation usable without a JavaScript-only menu. */
export function LandingMobileNav() {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const closeMenu = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <details
      ref={detailsRef}
      className="landing-mobile-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="Toggle main navigation">
        <Menu className="landing-menu-open-icon" size={19} aria-hidden="true" />
        <X className="landing-menu-close-icon" size={19} aria-hidden="true" />
      </summary>
      <nav aria-label="Mobile navigation" className="landing-mobile-nav">
        <Link href="/chapters" onClick={closeMenu}>
          The curriculum
        </Link>
        <Link href="/chapters/roadmap" onClick={closeMenu}>
          Learning roadmap
        </Link>
        <Link href="/progress" onClick={closeMenu}>
          Your progress
        </Link>
        <Link href="/chapters/start" onClick={closeMenu} className="landing-mobile-start">
          Start learning <span aria-hidden="true">↗</span>
        </Link>
      </nav>
    </details>
  );
}
