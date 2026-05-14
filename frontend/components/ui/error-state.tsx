import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type ErrorStateProps = {
  title: string;
  message: string;
  action?: ReactNode;
  className?: string;
};

export function ErrorState({ title, message, action, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("rounded-lg border border-red-200 bg-red-50/90 px-4 py-4 text-red-950", className)}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-red-900/90">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
