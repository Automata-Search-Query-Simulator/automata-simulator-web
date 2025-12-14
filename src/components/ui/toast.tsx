"use client";

import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-3 outline-none md:top-6 md:right-6",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

type ToastRootElement = React.ElementRef<typeof ToastPrimitives.Root>;
type ToastRootProps = React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root>;

type ToastVariant = "default" | "success" | "destructive";

const variantClasses: Record<ToastVariant, string> = {
  default:
    "border border-slate-200/80 bg-white/95 backdrop-blur-md text-slate-900 shadow-xl dark:border-slate-800/80 dark:bg-slate-900/95 dark:text-slate-100",
  success:
    "border border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 to-white/90 text-emerald-900 shadow-emerald-100/60 dark:border-emerald-900/60 dark:from-emerald-950/90 dark:to-emerald-900/80 dark:text-emerald-100",
  destructive:
    "border border-rose-200/80 bg-gradient-to-br from-rose-50/95 via-white/90 to-white text-rose-900 shadow-rose-100/60 dark:border-rose-900/60 dark:from-rose-950/90 dark:via-rose-900/60 dark:text-rose-100",
};

interface ToastProps extends ToastRootProps {
  variant?: ToastVariant;
}

const Toast = React.forwardRef<ToastRootElement, ToastProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(
        "group relative flex w-full items-center justify-between overflow-hidden rounded-2xl px-4 py-3 text-sm shadow-lg ring-1 ring-black/5 transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-top-4 data-[state=closed]:slide-out-to-right-4 data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:duration-200 sm:px-5 sm:py-4",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
);
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex items-center rounded-full border border-white/40 bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:scale-[1.02] hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
      "dark:border-white/10 dark:bg-transparent dark:text-white/90",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute top-3 right-3 rounded-full bg-black/5 p-1 text-slate-500 transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-white/10 dark:text-slate-200 dark:hover:text-white",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn(
      "text-sm font-semibold tracking-tight text-inherit",
      className,
    )}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn(
      "mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300",
      className,
    )}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastActionElement,
  type ToastProps,
};
