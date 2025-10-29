import React, { useRef, useState } from "react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  threshold?: number;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children, threshold = 60 }) => {
  const startYRef = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0) {
      startYRef.current = e.touches[0].clientY;
    } else {
      startYRef.current = null;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const current = e.touches[0].clientY;
    const delta = Math.max(0, current - startYRef.current);
    setPull(Math.min(delta, threshold * 2));
  };

  const onTouchEnd = async () => {
    if (pull >= threshold && !refreshing) {
      try {
        setRefreshing(true);
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPull(0);
    startYRef.current = null;
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        style={{ height: pull, transition: pull === 0 ? "height 200ms ease" : undefined }}
        className="flex items-center justify-center text-xs text-muted-foreground"
      >
        {pull > 0 && (refreshing ? "Refreshing…" : "Release to refresh")}
      </div>
      {children}
    </div>
  );
};

export default PullToRefresh;
