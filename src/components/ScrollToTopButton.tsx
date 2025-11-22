import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [typing, setTyping] = useState(false);

  // Detect the correct scrollable root element
  const getScrollElement = () =>
    document.querySelector("main") ||
    document.scrollingElement ||
    document.documentElement;

  useEffect(() => {
    const scrollEl = getScrollElement();

    const onScroll = () => {
      const scrollTop = scrollEl.scrollTop;
      const scrollHeight = scrollEl.scrollHeight - scrollEl.clientHeight;

      setVisible(scrollTop > 250);

      if (scrollHeight > 0) {
        setProgress((scrollTop / scrollHeight) * 100);
      }
    };

    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-hide when typing
  useEffect(() => {
    const onFocus = (e: Event) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        setTyping(true);
      }
    };

    const onBlur = () => {
      setTyping(false);
    };

    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);

    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
    };
  }, []);

  if (!visible || typing) return null;

  return (
    <button
      aria-label="Scroll to top"
      onClick={() => {
        const scrollEl = getScrollElement();
        scrollEl.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className="
        fixed bottom-[calc(var(--bottom-nav-height)+1.5rem)]
        right-4 sm:right-6 z-50
        h-12 w-12 rounded-full bg-primary text-primary-foreground
        shadow-lg hover:shadow-xl
        flex items-center justify-center
        transition-all duration-300 animate-fade-in
      "
    >
      {/* Progress circle */}
      <svg className="absolute inset-0 h-full w-full pointer-events-none">
        <circle
          cx="50%"
          cy="50%"
          r="22"
          stroke="white"
          strokeWidth="3"
          fill="transparent"
          strokeDasharray={2 * Math.PI * 22}
          strokeDashoffset={
            2 * Math.PI * 22 * ((100 - progress) / 100)
          }
          style={{ transition: "stroke-dashoffset 0.25s ease-out" }}
        />
      </svg>

      {/* Arrow Icon */}
      <ArrowUp className="h-5 w-5 relative z-10" />
    </button>
  );
}
