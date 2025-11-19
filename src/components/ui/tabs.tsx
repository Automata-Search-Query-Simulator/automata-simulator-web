import * as React from "react";
import { cn } from "@/lib/utils";

type TabsContext = {
  value: string;
  setValue: (value: string) => void;
};

const Context = React.createContext<TabsContext | null>(null);

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const activeValue = value ?? internalValue;

  const setValue = React.useCallback(
    (next: string) => {
      if (onValueChange) {
        onValueChange(next);
      } else {
        setInternalValue(next);
      }
    },
    [onValueChange],
  );

  return (
    <Context.Provider value={{ value: activeValue, setValue }}>
      <div className={cn(className)}>{children}</div>
    </Context.Provider>
  );
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex w-full items-center justify-start gap-2 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const ctx = React.useContext(Context);
  if (!ctx) {
    throw new Error("TabsTrigger must be used within Tabs");
  }
  const isActive = ctx.value === value;

  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={cn(
        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
        isActive
          ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white"
          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = React.useContext(Context);
  if (!ctx) {
    throw new Error("TabsContent must be used within Tabs");
  }
  if (ctx.value !== value) {
    return null;
  }

  return (
    <div className={cn("mt-4", className)} {...props}>
      {children}
    </div>
  );
}
