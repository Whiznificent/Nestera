"use client";

import { RefObject, useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseFocusTrapOptions {
  isOpen: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onEscape?: () => void;
}

export function useFocusTrap({
  isOpen,
  containerRef,
  initialFocusRef,
  onEscape,
}: UseFocusTrapOptions) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement;
    const container = containerRef.current;

    const focusables = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusables?.[0];

    requestAnimationFrame(() => {
      initialFocusRef?.current?.focus();
      if (!initialFocusRef?.current) {
        first?.focus();
      }
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!container) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onEscape?.();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const activeFocusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );

      if (activeFocusables.length === 0) {
        event.preventDefault();
        return;
      }

      const firstFocusable = activeFocusables[0];
      const lastFocusable = activeFocusables[activeFocusables.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (event.shiftKey && current === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && current === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [containerRef, initialFocusRef, isOpen, onEscape]);
}

