import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Card, CardContent } from "@/components/ui/card";

export type MetricCardProps = {
  title: string;
  value: ReactNode;
  hint?: string;
  className?: string;
};

export function MetricCard({ title, value, hint, className }: MetricCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="py-4">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
        {hint ? <p className="mt-2 text-xs text-gray-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
