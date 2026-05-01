import type { RefObject } from "react";

interface FullscreenButtonProps {
  label: string;
  targetRef: RefObject<HTMLElement | null>;
}

export function FullscreenButton({ label, targetRef }: FullscreenButtonProps) {
  const toggleFullscreen = () => {
    const target = targetRef.current;
    if (!target) return;

    if (document.fullscreenElement === target) {
      void document.exitFullscreen();
      return;
    }

    void target.requestFullscreen();
  };

  return (
    <button type="button" className="fullscreen-button" aria-label={label} title={label} onClick={toggleFullscreen}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8 4H4v4" />
        <path d="M16 4h4v4" />
        <path d="M20 16v4h-4" />
        <path d="M4 16v4h4" />
      </svg>
    </button>
  );
}
