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

export type ThemeMode = "light" | "dark" | "system";

export interface GlossaryTipItem {
  key: string;
  term: string;
  definitionPlain: string;
}

export interface QuizAnswer {
  picked: number;
  correct?: boolean;
}

export interface SavedState {
  done: Record<string, number>;
  saved: Record<string, number>;
  quiz: Record<string, Record<string, QuizAnswer>>;
  /** Chapters the reader pinned for later. Curated, not progress. */
  bookmarks: Record<string, number>;
  last?: string;
  theme?: ThemeMode;
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
  toggleBookmark: (chapterId: string) => void;
  setSaved: (key: string, checked: boolean) => void;
  setQuizAnswer: (
    quizId: string,
    qIndex: number,
    optIndex: number,
    correct: boolean
  ) => void;
  resetQuiz: (quizId: string) => void;
  setLastChapter: (chapterId: string) => void;
  resetAllProgress: () => void;
  /** Resolved theme actually painted on screen. */
  theme: "light" | "dark";
  /** What the reader chose: light, dark, or follow the operating system. */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  cycleTheme: () => void;
  fontSize: number;
  stepFontSize: (delta: number) => void;
  showToast: (msg: string) => void;
  showGlossaryTip: (key: string, target: HTMLElement) => void;
  hideGlossaryTip: () => void;
  activeTipKey: string | null;
}

const GuideStateContext = createContext<GuideContextValue | null>(null);

function emptyState(): SavedState {
  return { done: {}, saved: {}, quiz: {}, bookmarks: {} };
}

function normaliseQuiz(
  raw: unknown
): Record<string, Record<string, QuizAnswer>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Record<string, QuizAnswer>> = {};
  for (const [quizId, answers] of Object.entries(
    raw as Record<string, unknown>
  )) {
    if (!answers || typeof answers !== "object") continue;
    const clean: Record<string, QuizAnswer> = {};
    for (const [qIndex, value] of Object.entries(
      answers as Record<string, unknown>
    )) {
      if (typeof value === "number") {
        // 2.0 stored the bare option index; correctness was not recorded then.
        clean[qIndex] = { picked: value };
      } else if (value && typeof value === "object") {
        const answer = value as Partial<QuizAnswer>;
        if (typeof answer.picked === "number") {
          clean[qIndex] = {
            picked: answer.picked,
            correct:
              typeof answer.correct === "boolean" ? answer.correct : undefined,
          };
        }
      }
    }
    if (Object.keys(clean).length > 0) out[quizId] = clean;
  }
  return out;
}

function normaliseState(raw: unknown): SavedState {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<SavedState>;
  return {
    done: s.done && typeof s.done === "object" ? s.done : {},
    saved: s.saved && typeof s.saved === "object" ? s.saved : {},
    quiz: normaliseQuiz(s.quiz),
    bookmarks:
      s.bookmarks && typeof s.bookmarks === "object" ? s.bookmarks : {},
    last: typeof s.last === "string" ? s.last : undefined,
    theme:
      s.theme === "dark" || s.theme === "light" || s.theme === "system"
        ? s.theme
        : undefined,
    fs: typeof s.fs === "number" ? s.fs : undefined,
  };
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
}

/** Paint the chosen theme onto <html>. Shared with the pre-paint script. */
function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-mode", mode);
  return resolved;
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
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
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

    const resolvedMode: ThemeMode = loaded.theme ?? "system";
    const resolvedFs =
      loaded.fs && loaded.fs >= 15 && loaded.fs <= 24 ? loaded.fs : 18;

    setPersistent(canPersist);
    setState(loaded);
    setThemeModeState(resolvedMode);
    setTheme(applyTheme(resolvedMode));
    setFontSize(resolvedFs);
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

  const toggleBookmark = useCallback(
    (chapterId: string) => {
      persistState((prev) => {
        const bookmarks = { ...prev.bookmarks };
        if (bookmarks[chapterId]) delete bookmarks[chapterId];
        else bookmarks[chapterId] = 1;
        return { ...prev, bookmarks };
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
    (
      quizId: string,
      qIndex: number,
      optIndex: number,
      correct: boolean
    ) => {
      persistState((prev) => {
        const quiz = { ...prev.quiz };
        quiz[quizId] = {
          ...(quiz[quizId] ?? {}),
          [String(qIndex)]: { picked: optIndex, correct },
        };
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
      // Bookmarks are a reading list, not progress: they survive a reset.
      bookmarks: prev.bookmarks ?? {},
      theme: prev.theme,
      fs: prev.fs,
      last: undefined,
    }));
    showToast("Progress erased. Bookmarks were kept.");
  }, [persistState, showToast]);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode);
      setTheme(applyTheme(mode));
      persistState((prev) => ({ ...prev, theme: mode }));
    },
    [persistState]
  );

  const cycleTheme = useCallback(() => {
    const next: ThemeMode =
      themeMode === "light"
        ? "dark"
        : themeMode === "dark"
          ? "system"
          : "light";
    setThemeMode(next);
    showToast(
      next === "system"
        ? `Theme follows your system setting (${systemPrefersDark() ? "dark" : "light"}).`
        : `Theme set to ${next}.`
    );
  }, [setThemeMode, showToast, themeMode]);

  // Follow the operating system while the reader is on "system".
  useEffect(() => {
    if (themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(applyTheme("system"));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themeMode]);

  const stepFontSize = useCallback(
    (delta: number) => {
      const next = Math.min(24, Math.max(15, fontSize + delta));
      if (next === fontSize) {
        showToast(
          delta > 0
            ? "That is the largest text size."
            : "That is the smallest text size."
        );
        return;
      }
      setFontSize(next);
      document.documentElement.style.setProperty("--guide-fs", `${next}px`);
      persistState((prev) => ({ ...prev, fs: next }));
    },
    [fontSize, persistState, showToast]
  );

  const showGlossaryTip = useCallback(
    (key: string, target: HTMLElement) => {
      const entry = glossary[key];
      if (!entry) return;
      const r = target.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      // The tooltip is 20rem wide but never wider than the viewport; clamp by
      // its real half-width so long definitions cannot hang off the edge.
      const width = Math.min(320, vw - 32);
      const half = width / 2;
      const centre = r.left + r.width / 2;
      const x = Math.min(Math.max(16 + half, centre), vw - 16 - half);
      const above = r.bottom + 180 > window.innerHeight && r.top > 180;
      const y = above ? r.top - 8 : r.bottom + 8;
      setTip({ entry, x, y, above });
    },
    [glossary]
  );

  const hideGlossaryTip = useCallback(() => setTip(null), []);

  useEffect(() => {
    if (!tip) return;
    const onScroll = () => setTip(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTip(null);
    };
    // Tapping anywhere outside the definition should dismiss it, which is what
    // people expect on a touch screen where there is no mouseleave.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="tooltip"]')) return;
      if (target?.closest("[data-glossary-term]")) return;
      setTip(null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [tip]);

  const value = useMemo<GuideContextValue>(
    () => ({
      state,
      persistent,
      glossary,
      toggleDone,
      toggleBookmark,
      setSaved,
      setQuizAnswer,
      resetQuiz,
      setLastChapter,
      resetAllProgress,
      theme,
      themeMode,
      setThemeMode,
      cycleTheme,
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
      toggleBookmark,
      setSaved,
      setQuizAnswer,
      resetQuiz,
      setLastChapter,
      resetAllProgress,
      theme,
      themeMode,
      setThemeMode,
      cycleTheme,
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
          className="no-print fixed z-50 w-80 max-w-[calc(100vw-2rem)] rounded-well border border-[var(--g-line2)] bg-[var(--g-surface)] p-3.5 text-sm shadow-pop"
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
          className="no-print fixed inset-x-4 bottom-4 z-[70] mx-auto w-fit max-w-md rounded-well border border-[var(--g-line2)] bg-[var(--g-ink)] px-4 py-2.5 text-center text-sm font-medium text-[var(--g-bg)] shadow-pop sm:inset-x-auto sm:right-5 sm:bottom-5 sm:mx-0 sm:text-left"
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
