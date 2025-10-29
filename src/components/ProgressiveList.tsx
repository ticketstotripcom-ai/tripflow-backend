import React, { useEffect, useRef, useState } from "react";

interface ProgressiveListProps<T> {
  items: T[];
  batchSize?: number;
  initialBatches?: number; // number of batches to render initially
  renderItem: (item: T, index: number) => React.ReactNode;
  empty?: React.ReactNode;
}

/**
 * Lightweight progressive list renderer to avoid heavy initial renders on mobile.
 * Renders in batches and grows as the user scrolls near the end.
 */
export function ProgressiveList<T>({
  items,
  batchSize = 30,
  initialBatches = 1,
  renderItem,
  empty,
}: ProgressiveListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(items.length, batchSize * initialBatches));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reset when items change
    setVisibleCount(Math.min(items.length, batchSize * initialBatches));
  }, [items, batchSize, initialBatches]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting) {
        setVisibleCount((prev) => Math.min(items.length, prev + batchSize));
      }
    }, { rootMargin: "200px" });

    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, batchSize]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        {empty || <p className="text-muted-foreground">No items</p>}
      </div>
    );
  }

  return (
    <>
      {items.slice(0, visibleCount).map((item, index) => (
        <React.Fragment key={index}>
          {renderItem(item, index)}
        </React.Fragment>
      ))}
      <div ref={sentinelRef} />
    </>
  );
}

export default ProgressiveList;
