"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";

/** A native disclosure keeps navigation usable without a JavaScript-only menu. */
export function LandingMobileNav() {
  return (
    <details
      className="landing-mobile-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="Toggle main navigation">
        <Menu className="landing-menu-open-icon" size={20} aria-hidden="true" />
        <X className="landing-menu-close-icon" size={20} aria-hidden="true" />
      </summary>
      <nav aria-label="Mobile navigation" className="landing-mobile-nav">
        <Link href="/chapters">The curriculum</Link>
        <Link href="/chapters/roadmap">Learning roadmap</Link>
        <Link href="/progress">Your progress</Link>
        <Link href="/chapters/start" className="landing-mobile-start">
          Start learning <span aria-hidden="true">↗</span>
        </Link>
      </nav>
    </details>
  );
}
