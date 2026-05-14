import type { HTMLAttributes } from "react";
import { cn } from "@/components/ui/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClass: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-800 ring-gray-200",
  success: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  warning: "bg-amber-100 text-amber-900 ring-amber-200",
  danger: "bg-red-100 text-red-900 ring-red-200",
  info: "bg-sky-100 text-sky-900 ring-sky-200",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ className, tone = "neutral", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
