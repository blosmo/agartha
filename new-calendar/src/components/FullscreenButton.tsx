import { useEffect, useState, type RefObject } from "react";

interface FullscreenButtonProps {
  label: string;
  targetRef: RefObject<HTMLElement | null>;
}

export function FullscreenButton({ label, targetRef }: FullscreenButtonProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const syncState = () => {
      setActive(document.fullscreenElement === target || target.classList.contains("is-faux-fullscreen"));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !target.classList.contains("is-faux-fullscreen")) return;
      exitFauxFullscreen(target);
      syncState();
    };

    document.addEventListener("fullscreenchange", syncState);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", syncState);
      document.removeEventListener("keydown", handleKeyDown);
      exitFauxFullscreen(target);
    };
  }, [targetRef]);

  const toggleFullscreen = async () => {
    const target = targetRef.current;
    if (!target) return;

    if (document.fullscreenElement === target || target.classList.contains("is-faux-fullscreen")) {
      if (document.fullscreenElement === target) await document.exitFullscreen();
      exitFauxFullscreen(target);
      setActive(false);
      return;
    }

    enterFauxFullscreen(target);
    setActive(true);
  };

  return (
    <button
      type="button"
      className="fullscreen-button"
      aria-label={active ? "Exit full screen" : label}
      title={active ? "Exit full screen" : label}
      aria-pressed={active}
      onClick={toggleFullscreen}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {active ? (
          <>
            <path d="M9 4v5H4" />
            <path d="M15 4v5h5" />
            <path d="M20 15h-5v5" />
            <path d="M4 15h5v5" />
          </>
        ) : (
          <>
            <path d="M8 4H4v4" />
            <path d="M16 4h4v4" />
            <path d="M20 16v4h-4" />
            <path d="M4 16v4h4" />
          </>
        )}
      </svg>
    </button>
  );
}

function enterFauxFullscreen(target: HTMLElement) {
  target.classList.add("is-faux-fullscreen");
  document.body.classList.add("bento-faux-fullscreen-active");
}

function exitFauxFullscreen(target: HTMLElement) {
  target.classList.remove("is-faux-fullscreen");
  document.body.classList.remove("bento-faux-fullscreen-active");
}
