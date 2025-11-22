import React, { useEffect, useMemo, useRef, useState } from "react";

interface ProgressiveListProps<T> {
  items: T[];
  batchSize?: number;
  initialBatches?: number; // number of batches to render initially
  overscan?: number;       // extra items beyond visibleCount for smoothness
  renderItem: (item: T, index: number) => React.ReactNode;
  empty?: React.ReactNode;
  getKey?: (item: T, index: number) => React.Key;
  className?: string;
}

/**
 * Ultra-lightweight progressive list for large datasets (10,000+ items).
 *
 * - Renders in batches to avoid long initial render on mobile/WebView.
 * - Uses IntersectionObserver to “load more” as user scrolls down.
 * - Uses idle time (requestIdleCallback) where available to avoid main-thread spikes.
 * - Supports stable keys via getKey for better React reconciliation.
 */
export function ProgressiveList<T>({
  items,
  batchSize = 40,
  initialBatches = 2,
  overscan = 10,
  renderItem,
  empty,
  getKey,
  className,
}: ProgressiveListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(items.length, batchSize * initialBatches)
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Reset when items, batchSize or initialBatches change (e.g., filters, sections)
  useEffect(() => {
    setVisibleCount(Math.min(items.length, batchSize * initialBatches));
  }, [items, batchSize, initialBatches]);

  // Helper: schedule non-blocking batched updates
  const scheduleIncrease = (nextCount: number) => {
    const update = () => {
      setVisibleCount((prev) => (prev < nextCount ? nextCount : prev));
    };

    // Prefer requestIdleCallback if available (smoother on low-end devices)
    const w = window as any;
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(update);
    } else {
      // Fallback to async micro-task
      setTimeout(update, 0);
    }
  };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    // Clean up any previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (typeof IntersectionObserver === "undefined") {
      // Fallback if browser doesn't support IntersectionObserver:
      // Just render everything (still batched on initial load).
      setVisibleCount(items.length);
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting) return;

        // When sentinel is visible → request next batch
        scheduleIncrease(
          Math.min(items.length, visibleCount + batchSize)
        );
      },
      {
        root: null,
        rootMargin: "300px", // start loading before user hits exact bottom
        threshold: 0.1,
      }
    );

    observerRef.current.observe(el);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [items.length, batchSize, visibleCount]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        {empty || <p className="text-muted-foreground">No items</p>}
      </div>
    );
  }

  // Slice only what we need + overscan for smooth scrolling
  const finalCount = Math.min(items.length, visibleCount + overscan);
  const visibleItems = useMemo(
    () => items.slice(0, finalCount),
    [items, finalCount]
  );

  return (
    <div className={className}>
      {visibleItems.map((item, index) => {
        const key = getKey ? getKey(item, index) : index;
        return (
          <React.Fragment key={key}>
            {renderItem(item, index)}
          </React.Fragment>
        );
      })}
      {/* Sentinel – when this comes into view, we load more */}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}

export default ProgressiveList;
