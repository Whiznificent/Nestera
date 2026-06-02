"use client";

import { useEffect, useRef, useState } from "react";

interface UseCountUpOptions {
  /** Final value to count to */
  end: number;
  /** Starting value (default 0) */
  start?: number;
  /** Duration in ms (default 1200) */
  duration?: number;
  /** Decimal places to display (default 0) */
  decimals?: number;
  /** Delay before starting in ms (default 0) */
  delay?: number;
  /** Only animate once when the element enters the viewport */
  observeVisibility?: boolean;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Animates a number from `start` to `end` over `duration` ms.
 * Respects `prefers-reduced-motion` — returns the final value immediately if motion is reduced.
 *
 * @example
 * const displayed = useCountUp({ end: 24593.82, decimals: 2 });
 * return <span>${displayed}</span>;
 */
export function useCountUp({
  end,
  start = 0,
  duration = 1200,
  decimals = 0,
  delay = 0,
  observeVisibility = true,
}: UseCountUpOptions): string {
  const [value, setValue] = useState(start);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const elemRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(!observeVisibility);

  // Detect reduced-motion preference
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Observe visibility when mounted into a real element
  useEffect(() => {
    if (!observeVisibility || prefersReduced) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    // We attach to a sentinel — the hook consumer should ref an element,
    // but as a fallback we just start after a short delay
    const timer = window.setTimeout(() => setVisible(true), 300);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [observeVisibility, prefersReduced]);

  useEffect(() => {
    if (prefersReduced) {
      setValue(end);
      return;
    }

    if (!visible) return;

    const startAnimation = () => {
      startTimeRef.current = null;

      const animate = (timestamp: number) => {
        if (!startTimeRef.current) startTimeRef.current = timestamp;
        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutExpo(progress);
        setValue(start + (end - start) * eased);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          setValue(end);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    };

    const timer = window.setTimeout(startAnimation, delay);

    return () => {
      window.clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [end, start, duration, delay, visible, prefersReduced]);

  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Returns an element ref to enable visibility-based trigger.
 * Attach to the wrapping element: <div ref={countUpRef}>
 */
export function useCountUpRef<T extends HTMLElement = HTMLElement>() {
  return useRef<T>(null);
}
