import * as React from "react";
import { cn } from "@/lib/utils";

type ToggleGroupContextValue = {
  value: string;
  onChange: (value: string) => void;
};

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(
  null,
);

export type ToggleGroupProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
};

export function ToggleGroup({
  value,
  onValueChange,
  children,
  className,
}: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ value, onChange: onValueChange }}>
      <div
        className={cn(
          "inline-flex flex-wrap gap-2 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800",
          className,
        )}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

export type ToggleGroupItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

export function ToggleGroupItem({
  value,
  className,
  children,
  ...props
}: ToggleGroupItemProps) {
  const ctx = React.useContext(ToggleGroupContext);
  if (!ctx) {
    throw new Error("ToggleGroupItem must be used within ToggleGroup");
  }

  const isActive = ctx.value === value;

  return (
    <button
      type="button"
      onClick={() => ctx.onChange(value)}
      className={cn(
        "min-w-[120px] flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        isActive
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-transparent text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
