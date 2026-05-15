import { cn } from "@/components/ui/cn";

export type LoadingStateProps = {
  message?: string;
  className?: string;
};

export function LoadingState({ message = "Загрузка…", className }: LoadingStateProps) {
  return (
    <div className={cn("space-y-3 p-6", className)} aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3">
        <span
          className="inline-block size-4 animate-pulse rounded-full bg-gray-300"
          aria-hidden
        />
        <p className="text-sm text-gray-600">{message}</p>
      </div>
      <div className="h-2 max-w-md animate-pulse rounded bg-gray-200" />
      <div className="h-2 max-w-sm animate-pulse rounded bg-gray-100" />
    </div>
  );
}
