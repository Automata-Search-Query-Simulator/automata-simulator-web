import * as React from "react";
import { cn } from "@/lib/utils";

type SliderProps = {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function Slider({
  min = 0,
  max = 5,
  step = 1,
  value,
  onChange,
  disabled,
  className,
  id,
}: SliderProps) {
  return (
    <input
      type="range"
      id={id}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className={cn(
        "h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-800 dark:accent-zinc-100",
        className,
      )}
    />
  );
}
