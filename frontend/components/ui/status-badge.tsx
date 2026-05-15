import { cn } from "@/components/ui/cn";
import { statusLabelRu } from "@/lib/status-labels";

/** Normalized keys after lowercasing and replacing spaces with underscores */
export type StatusBadgeValue =
  | "completed"
  | "running"
  | "failed"
  | "pending"
  | "valid"
  | "invalid"
  | "missing"
  | "error"
  | "unknown"
  | "open"
  | "resolved"
  | "dismissed"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "active"
  | "trial"
  | "past_due"
  | "paused"
  | "cancelled"
  | "internal"
  | "success"
  | "succeeded"
  | "checking"
  | "draft"
  | "not_configured"
  | "not_connected";

const STYLE: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  success: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  succeeded: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  valid: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  resolved: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  active: "bg-emerald-100 text-emerald-900 ring-emerald-200",

  running: "bg-sky-100 text-sky-900 ring-sky-200",
  sync_in_progress: "bg-sky-100 text-sky-900 ring-sky-200",
  pending: "bg-amber-100 text-amber-900 ring-amber-200",
  sync_pending: "bg-amber-100 text-amber-900 ring-amber-200",
  checking: "bg-sky-100 text-sky-900 ring-sky-200",
  trial: "bg-sky-100 text-sky-900 ring-sky-200",
  open: "bg-amber-100 text-amber-900 ring-amber-200",
  medium: "bg-amber-100 text-amber-900 ring-amber-200",

  failed: "bg-red-100 text-red-900 ring-red-200",
  sync_failed: "bg-red-100 text-red-900 ring-red-200",
  invalid: "bg-red-100 text-red-900 ring-red-200",
  error: "bg-red-100 text-red-900 ring-red-200",
  critical: "bg-red-100 text-red-900 ring-red-200",
  high: "bg-orange-100 text-orange-900 ring-orange-200",
  past_due: "bg-red-100 text-red-900 ring-red-200",

  missing: "bg-gray-100 text-gray-700 ring-gray-200",
  unknown: "bg-gray-100 text-gray-700 ring-gray-200",
  dismissed: "bg-gray-100 text-gray-600 ring-gray-200",
  paused: "bg-gray-100 text-gray-700 ring-gray-200",
  cancelled: "bg-gray-100 text-gray-600 ring-gray-200",
  internal: "bg-violet-100 text-violet-900 ring-violet-200",
  draft: "bg-gray-100 text-gray-700 ring-gray-200",
  not_configured: "bg-gray-100 text-gray-700 ring-gray-200",
  not_connected: "bg-gray-100 text-gray-700 ring-gray-200",

  low: "bg-slate-100 text-slate-800 ring-slate-200",
};

const DEFAULT_STYLE = "bg-gray-100 text-gray-800 ring-gray-200";

function normalizeStatus(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

export type StatusBadgeProps = {
  status: string;
  label?: string;
  className?: string;
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const key = normalizeStatus(status);
  const style = STYLE[key] ?? DEFAULT_STYLE;
  const text = label ?? statusLabelRu(status);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        style,
        className,
      )}
    >
      {text}
    </span>
  );
}
