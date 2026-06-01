"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { clsx } from "clsx";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[#061a1a] font-semibold hover:brightness-110 focus-visible:ring-[var(--color-accent)]",
  secondary:
    "bg-[var(--color-surface)] border border-[var(--color-border-strong)] text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)] focus-visible:ring-[var(--color-accent)]",
  outline:
    "bg-transparent border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] focus-visible:ring-[var(--color-accent)]",
  ghost:
    "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text)] focus-visible:ring-[var(--color-accent)]",
  danger:
    "bg-[var(--color-danger)] text-white font-semibold hover:brightness-110 focus-visible:ring-[var(--color-danger)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg min-h-8",
  md: "px-5 py-2.5 text-sm gap-2 rounded-xl min-h-10",
  lg: "px-7 py-3 text-base gap-2.5 rounded-xl min-h-12",
};

const spinnerSize: Record<ButtonSize, number> = { sm: 12, md: 14, lg: 16 };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        className={clsx(
          "inline-flex items-center justify-center font-medium transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
          "active:scale-[0.97] select-none",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 size={spinnerSize[size]} className="animate-spin shrink-0" aria-hidden="true" />
        ) : leftIcon ? (
          <span className="shrink-0" aria-hidden="true">{leftIcon}</span>
        ) : null}
        <span>{children}</span>
        {!loading && rightIcon ? (
          <span className="shrink-0" aria-hidden="true">{rightIcon}</span>
        ) : null}
      </button>
    );
  },
);

Button.displayName = "Button";
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-cyan-500 hover:bg-cyan-400 text-[#061a1a] font-bold shadow-lg hover:shadow-[0_15px_30px_rgba(0,212,192,0.4)] active:scale-95",
  secondary:
    "bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-semibold hover:bg-cyan-500/30",
  outline:
    "border border-cyan-400/40 text-cyan-200 hover:text-white hover:border-cyan-300",
  ghost:
    "bg-transparent text-[#5e8c96] hover:text-[#e2f8f8]",
  danger:
    "bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-red-200",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg gap-1",
  md: "px-5 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-6 py-3.5 text-base rounded-2xl gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center transition-all duration-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70";

  const widthClass = fullWidth ? "w-full" : "";

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
