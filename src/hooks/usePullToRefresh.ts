import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 72; // px of pull required to trigger refresh

/**
 * Attaches pull-to-refresh behaviour to a scroll container.
 *
 * Pass a ref to any element that wraps the scrollable content (it queries
 * internally for the Radix ScrollArea viewport or falls back to the element
 * itself). When the user pulls down from the top of the scroll area by more
 * than THRESHOLD px, `onRefresh` is called.
 *
 * Returns `{ isPulling, pullProgress }` so callers can render a visual indicator.
 * `pullProgress` is 0–1 (1 = threshold reached).
 */
export function usePullToRefresh(
  onRefresh: () => void,
  containerRef: React.RefObject<HTMLElement>,
) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  useEffect(() => {
    const wrapper = containerRef.current;
    if (!wrapper) return;

    // Support Radix ScrollArea (viewport has data attribute) or plain div
    const getViewport = () =>
      wrapper.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? wrapper;

    const handleTouchStart = (e: TouchEvent) => {
      const viewport = getViewport();
      if (viewport.scrollTop > 2) return; // only activate at the very top
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startYRef.current === 0) return;
      const delta = e.touches[0].clientY - startYRef.current;
      const viewport = getViewport();
      if (delta > 0 && viewport.scrollTop <= 2) {
        pullingRef.current = true;
        const clamped = Math.min(delta, THRESHOLD * 1.6);
        setPullDistance(clamped);
        setIsPulling(true);
        // Prevent page-level bounce while pulling
        if (delta > 8) e.preventDefault();
      } else {
        if (pullingRef.current) {
          setPullDistance(0);
          setIsPulling(false);
          pullingRef.current = false;
        }
      }
    };

    const handleTouchEnd = () => {
      if (pullingRef.current && pullDistance >= THRESHOLD) {
        onRefresh();
      }
      setIsPulling(false);
      setPullDistance(0);
      startYRef.current = 0;
      pullingRef.current = false;
    };

    wrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    wrapper.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      wrapper.removeEventListener('touchstart', handleTouchStart);
      wrapper.removeEventListener('touchmove', handleTouchMove);
      wrapper.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onRefresh, pullDistance, containerRef]);

  return {
    isPulling,
    pullProgress: Math.min(pullDistance / THRESHOLD, 1),
  };
}
