"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";

const STORAGE_KEY = "rust-guide-v1";

export interface GlossaryTipItem {
  key: string;
  term: string;
  definitionPlain: string;
}

export interface SavedState {
  done: Record<string, number>;
  saved: Record<string, number>;
  quiz: Record<string, Record<string, number>>;
  last?: string;
  theme?: "light" | "dark";
  fs?: number;
}

interface TipState {
  entry: GlossaryTipItem;
  x: number;
  y: number;
  above: boolean;
}

interface GuideContextValue {
  state: SavedState;
  persistent: boolean;
  glossary: Record<string, GlossaryTipItem>;
  toggleDone: (chapterId: string) => void;
  setSaved: (key: string, checked: boolean) => void;
  setQuizAnswer: (quizId: string, qIndex: number, optIndex: number) => void;
  resetQuiz: (quizId: string) => void;
  setLastChapter: (chapterId: string) => void;
  resetAllProgress: () => void;
  toggleTheme: () => void;
  theme: "light" | "dark";
  fontSize: number;
  stepFontSize: (delta: number) => void;
  showToast: (msg: string) => void;
  showGlossaryTip: (key: string, target: HTMLElement) => void;
  hideGlossaryTip: () => void;
  activeTipKey: string | null;
}

const GuideStateContext = createContext<GuideContextValue | null>(null);

function emptyState(): SavedState {
  return { done: {}, saved: {}, quiz: {} };
}

function normaliseState(raw: unknown): SavedState {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<SavedState>;
  return {
    done: s.done && typeof s.done === "object" ? s.done : {},
    saved: s.saved && typeof s.saved === "object" ? s.saved : {},
    quiz: s.quiz && typeof s.quiz === "object" ? s.quiz : {},
    last: typeof s.last === "string" ? s.last : undefined,
    theme: s.theme === "dark" || s.theme === "light" ? s.theme : undefined,
    fs: typeof s.fs === "number" ? s.fs : undefined,
  };
}

export function GuideStateProvider({
  glossary,
  children,
}: {
  glossary: Record<string, GlossaryTipItem>;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<SavedState>(emptyState);
  const [persistent, setPersistent] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [fontSize, setFontSize] = useState<number>(18);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate saved state cleanly after mount
  useEffect(() => {
    let loaded = emptyState();
    let canPersist = false;
    try {
      window.localStorage.setItem(`${STORAGE_KEY}-test`, "1");
      window.localStorage.removeItem(`${STORAGE_KEY}-test`);
      canPersist = true;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        loaded = normaliseState(JSON.parse(raw));
      }
    } catch {
      canPersist = false;
    }

    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = loaded.theme ?? (prefersDark ? "dark" : "light");
    const resolvedFs =
      loaded.fs && loaded.fs >= 15 && loaded.fs <= 24 ? loaded.fs : 18;

    setPersistent(canPersist);
    setState(loaded);
    setTheme(resolvedTheme);
    setFontSize(resolvedFs);
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    document.documentElement.style.setProperty("--guide-fs", `${resolvedFs}px`);
  }, []);

  const persistState = useCallback(
    (updater: (prev: SavedState) => SavedState) => {
      setState((prev) => {
        const next = updater(prev);
        if (persistent) {
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore quota errors
          }
        }
        return next;
      });
    },
    [persistent]
  );

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 5000);
  }, []);

  const toggleDone = useCallback(
    (chapterId: string) => {
      persistState((prev) => {
        const done = { ...prev.done };
        if (done[chapterId]) delete done[chapterId];
        else done[chapterId] = 1;
        return { ...prev, done };
      });
    },
    [persistState]
  );

  const setSaved = useCallback(
    (key: string, checked: boolean) => {
      persistState((prev) => {
        const saved = { ...prev.saved };
        if (checked) saved[key] = 1;
        else delete saved[key];
        return { ...prev, saved };
      });
    },
    [persistState]
  );

  const setQuizAnswer = useCallback(
    (quizId: string, qIndex: number, optIndex: number) => {
      persistState((prev) => {
        const quiz = { ...prev.quiz };
        quiz[quizId] = { ...(quiz[quizId] ?? {}), [String(qIndex)]: optIndex };
        return { ...prev, quiz };
      });
    },
    [persistState]
  );

  const resetQuiz = useCallback(
    (quizId: string) => {
      persistState((prev) => {
        const quiz = { ...prev.quiz };
        delete quiz[quizId];
        return { ...prev, quiz };
      });
    },
    [persistState]
  );

  const setLastChapter = useCallback(
    (chapterId: string) => {
      persistState((prev) => {
        if (prev.last === chapterId) return prev;
        return { ...prev, last: chapterId };
      });
    },
    [persistState]
  );

  const resetAllProgress = useCallback(() => {
    persistState((prev) => ({
      done: {},
      saved: {},
      quiz: {},
      theme: prev.theme,
      fs: prev.fs,
    }));
    showToast("Progress erased.");
  }, [persistState, showToast]);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.setAttribute("data-theme", nextTheme);
    persistState((prev) => ({ ...prev, theme: nextTheme }));
  }, [theme, persistState]);

  const stepFontSize = useCallback(
    (delta: number) => {
      const next = Math.min(24, Math.max(15, fontSize + delta));
      setFontSize(next);
      document.documentElement.style.setProperty("--guide-fs", `${next}px`);
      persistState((prev) => ({ ...prev, fs: next }));
    },
    [fontSize, persistState]
  );

  const showGlossaryTip = useCallback(
    (key: string, target: HTMLElement) => {
      const entry = glossary[key];
      if (!entry) return;
      const r = target.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const x = Math.min(Math.max(16, r.left + r.width / 2), vw - 16);
      const above = r.bottom + 140 > window.innerHeight && r.top > 150;
      const y = above ? r.top - 8 : r.bottom + 8;
      setTip({ entry, x, y, above });
    },
    [glossary]
  );

  const hideGlossaryTip = useCallback(() => setTip(null), []);

  useEffect(() => {
    const onScroll = () => setTip(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTip(null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const value = useMemo<GuideContextValue>(
    () => ({
      state,
      persistent,
      glossary,
      toggleDone,
      setSaved,
      setQuizAnswer,
      resetQuiz,
      setLastChapter,
      resetAllProgress,
      toggleTheme,
      theme,
      fontSize,
      stepFontSize,
      showToast,
      showGlossaryTip,
      hideGlossaryTip,
      activeTipKey: tip?.entry.key ?? null,
    }),
    [
      state,
      persistent,
      glossary,
      toggleDone,
      setSaved,
      setQuizAnswer,
      resetQuiz,
      setLastChapter,
      resetAllProgress,
      toggleTheme,
      theme,
      fontSize,
      stepFontSize,
      showToast,
      showGlossaryTip,
      hideGlossaryTip,
      tip,
    ]
  );

  return (
    <GuideStateContext.Provider value={value}>
      {children}

      {tip && (
        <div
          role="tooltip"
          style={{
            left: `${tip.x}px`,
            top: `${tip.y}px`,
            transform: tip.above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
          }}
          className="no-print fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--g-line2)] bg-[var(--g-surface)] p-3.5 text-sm shadow-xl"
          onMouseEnter={() => {
            /* keep visible while hovering tooltip */
          }}
          onMouseLeave={hideGlossaryTip}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-semibold text-[var(--g-accent)]">
              {tip.entry.term}
            </span>
            <Link
              href="/chapters/glossary"
              onClick={hideGlossaryTip}
              className="text-xs font-medium text-[var(--g-ink3)] hover:text-[var(--g-accent)]"
            >
              Glossary →
            </Link>
          </div>
          <p className="text-[13.5px] leading-relaxed text-[var(--g-ink2)]">
            {tip.entry.definitionPlain}
          </p>
        </div>
      )}

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-5 right-5 z-50 max-w-md rounded-xl border border-[var(--g-line2)] bg-[var(--g-ink)] px-4 py-2.5 text-sm font-medium text-[var(--g-bg)] shadow-lg"
        >
          {toastMsg}
        </div>
      )}
    </GuideStateContext.Provider>
  );
}

export function useGuideState(): GuideContextValue {
  const ctx = useContext(GuideStateContext);
  if (!ctx) {
    throw new Error("useGuideState must be used inside GuideStateProvider");
  }
  return ctx;
}
