import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/components/ui/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-gray-900 text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 disabled:hover:bg-gray-900",
  secondary:
    "border border-gray-300 bg-white text-gray-900 shadow-sm hover:bg-gray-50 disabled:opacity-50",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600",
  ghost: "text-gray-800 hover:bg-gray-100 disabled:opacity-50",
};

const buttonBaseClass =
  "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900";

export function buttonClassNames(variant: ButtonVariant = "primary", className?: string): string {
  return cn(buttonBaseClass, variantClass[variant], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassNames(variant, className)}
      {...props}
    />
  );
});
