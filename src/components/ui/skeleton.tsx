import { cn } from "@/lib/utils";

export function Skeleton({
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800",
        className,
      )}
    />
  );
}
