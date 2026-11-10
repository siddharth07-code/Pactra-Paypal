import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";

export function useWorkspaceTransition() {
  const active = useRef<ViewTransition | null>(null);

  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const skip = () => {
      document.documentElement.classList.remove("view-transition-active");
      active.current?.skipTransition();
    };
    motion?.addEventListener("change", skip);
    document.addEventListener("keydown", skip, true);
    return () => {
      motion?.removeEventListener("change", skip);
      document.removeEventListener("keydown", skip, true);
      document.documentElement.classList.remove("view-transition-active");
      skip();
      active.current = null;
    };
  }, []);

  return useCallback((update: () => void, animate: boolean, scroll?: number) => {
    document.documentElement.classList.remove("view-transition-active");
    active.current?.skipTransition();
    active.current = null;

    const commit = () => {
      flushSync(update);
      if (scroll !== undefined) {
        document.getElementById("main-content")?.focus({ preventScroll: true });
        if (window.scrollY !== scroll) window.scrollTo({ top: scroll, behavior: "instant" });
      }
    };

    if (!animate || !document.startViewTransition ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      commit();
      return;
    }

    document.documentElement.classList.add("view-transition-active");
    let transition: ViewTransition | null = null;
    const cleanup = () => {
      document.documentElement.classList.remove("view-transition-active");
      if (active.current === transition) active.current = null;
    };

    // A skipped transition still runs its update callback.
    transition = document.startViewTransition(() => {
      if (transition && (active.current === transition || active.current === null)) commit();
    });
    active.current = transition;
    void transition.ready.catch(() => {});
    void transition.finished.catch(() => {}).then(cleanup);
  }, []);
}
