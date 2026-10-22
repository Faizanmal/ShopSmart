import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes } from "react";

export function Panel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_10px_40px_rgba(20,32,27,0.06)] backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const styles = {
    primary:
      "bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50",
    secondary:
      "bg-white/80 text-[var(--ink)] border border-[var(--line)] hover:bg-white",
    danger: "bg-[var(--danger)] text-white hover:brightness-110",
    ghost: "bg-transparent text-[var(--ink)] hover:bg-black/5",
  } as const;
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "ok" | "warn" | "danger" | "demo";
}) {
  const tones = {
    neutral: "bg-black/5 text-[var(--muted)]",
    ok: "bg-emerald-100 text-emerald-900",
    warn: "bg-amber-100 text-amber-900",
    danger: "bg-red-100 text-red-900",
    demo: "bg-[#f3e0cf] text-[#7a3e14]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2.5 text-sm outline-none ring-[var(--accent)] placeholder:text-[var(--muted)] focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-[var(--line)] bg-white/90 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]",
        className,
      )}
      {...props}
    />
  );
}
