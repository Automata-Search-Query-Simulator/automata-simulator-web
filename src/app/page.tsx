"use client";

import { useEffect, useState, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Play, RefreshCcw, Square, Upload } from "lucide-react";
import { MODES, SAMPLE_PRESETS } from "@/features/simulator/constants";
import { formSchema } from "@/features/simulator/schema";
import {
  buildId,
  buildPreviewPayload,
  getSequenceArray,
} from "@/features/simulator/utils";
import {
  FormValues,
  NormalizedResult,
  SimulationHistoryItem,
} from "@/features/simulator/types";
import { useRecentSimulations } from "@/features/simulator/hooks/use-recent-simulations";
import { useSimulate } from "@/features/simulator/hooks/use-simulate";
import { StateDiagram } from "@/components/automaton/state-diagram";
import { toast } from "sonner";

const RAW_MAX_ITEMS = 50;
const RAW_MAX_STRING_LENGTH = 2000;
const RAW_MAX_OUTPUT_LENGTH = 50000;

const formatRawDebug = (value: unknown) => {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown, depth: number): unknown => {
    if (typeof input === "string") {
      if (input.length > RAW_MAX_STRING_LENGTH) {
        return `${input.slice(0, RAW_MAX_STRING_LENGTH)}... (truncated)`;
      }
      return input;
    }

    if (input && typeof input === "object") {
      if (seen.has(input as object)) {
        return "[Circular]";
      }
      seen.add(input as object);

      if (Array.isArray(input)) {
        const items = input
          .slice(0, RAW_MAX_ITEMS)
          .map((item) => normalize(item, depth + 1));
        if (input.length > RAW_MAX_ITEMS) {
          items.push(`... ${input.length - RAW_MAX_ITEMS} more items`);
        }
        return items;
      }

      const entries = Object.entries(input as Record<string, unknown>);
      const limited: Record<string, unknown> = {};
      for (let i = 0; i < entries.length && i < RAW_MAX_ITEMS; i += 1) {
        const [key, val] = entries[i];
        limited[key] = normalize(val, depth + 1);
      }
      if (entries.length > RAW_MAX_ITEMS) {
        limited.__truncated__ = `... ${
          entries.length - RAW_MAX_ITEMS
        } more keys`;
      }
      return limited;
    }

    return input;
  };

  try {
    const prepared = normalize(value, 0);
    const serialized = JSON.stringify(
      prepared,
      (_key, val) => (typeof val === "bigint" ? val.toString() : val),
      2
    );

    if (!serialized) {
      return "";
    }

    if (serialized.length > RAW_MAX_OUTPUT_LENGTH) {
      return `${serialized.slice(
        0,
        RAW_MAX_OUTPUT_LENGTH
      )}\n... truncated for display (${serialized.length} chars)`;
    }

    return serialized;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown serialization error";
    return `Unable to render raw response: ${message}`;
  }
};

export default function HomePage() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: "nfa",
      sequences: "",
      inputPath: "",
      pattern: "",
      mismatchBudget: 0,
      allowDotBracket: false,
    },
  });

  const { history, pushHistory } = useRecentSimulations();
  const watchMode = useWatch({ control: form.control, name: "mode" });
  const watchSequences = useWatch({ control: form.control, name: "sequences" });
  const watchPattern = useWatch({ control: form.control, name: "pattern" });
  const mismatchBudget = useWatch({
    control: form.control,
    name: "mismatchBudget",
  });
  const watchDotBracket = useWatch({
    control: form.control,
    name: "allowDotBracket",
  });
  const isPdaMode = watchMode === "pda";
  const shouldShowPrimaryInputs = !isPdaMode || watchDotBracket;

  const formatRnaCheck = (check: string) => {
    const trimmed = (check ?? "").trim();
    if (!trimmed) {
      return { description: "", status: undefined, statusLabel: undefined };
    }
    const statusMatch = trimmed.match(/\[(.*?)\]\s*$/);
    const statusLabel = statusMatch
      ? statusMatch[1]?.trim().toUpperCase()
      : undefined;
    let description =
      statusMatch && typeof statusMatch.index === "number"
        ? trimmed.slice(0, statusMatch.index).trim()
        : trimmed;
    description = description.replace(/->\s*valid\?\s*$/i, "").trim();
    const status =
      statusLabel &&
      (statusLabel.startsWith("O") ||
        statusLabel.includes("PASS") ||
        statusLabel.includes("VALID"))
        ? "ok"
        : statusLabel
        ? "fail"
        : undefined;
    return { description, status, statusLabel };
  };

  const [result, setResult] = useState<NormalizedResult | null>(null);
  const [activeController, setActiveController] =
    useState<AbortController | null>(null);

  const { simulate, isSubmitting } = useSimulate({
    onSuccess: (normalized) => {
      setResult(normalized);
      pushHistory({
        id: buildId(),
        timestamp: Date.now(),
        summary: normalized.summary,
        params: buildPreviewPayload(form.getValues()).payload,
        mode: form.getValues("mode"),
      });
      setActiveController(null);
    },
    onError: (errorMessage) => {
      toast.error("Simulation error", {
        description: errorMessage,
      });
      setActiveController(null);
    },
  });

  const modeMeta = MODES.find((mode) => mode.value === watchMode) ?? MODES[0];
  const sequenceArray = shouldShowPrimaryInputs
    ? getSequenceArray(watchSequences)
    : [];
  const previewPayload = buildPreviewPayload(form.getValues());
  const showPayloadWarning =
    shouldShowPrimaryInputs && (watchSequences?.length ?? 0) > 10000;

  useEffect(() => {
    if (watchMode !== "pda") {
      const uppercaseSeq = watchSequences?.toUpperCase();
      if (uppercaseSeq && uppercaseSeq !== watchSequences) {
        form.setValue("sequences", uppercaseSeq);
      }
      const uppercasePattern = watchPattern?.toUpperCase();
      if (uppercasePattern && uppercasePattern !== watchPattern) {
        form.setValue("pattern", uppercasePattern);
      }
      if (form.getValues("allowDotBracket")) {
        form.setValue("allowDotBracket", false);
      }
    }
    if (watchMode !== "efa" && form.getValues("mismatchBudget") !== 0) {
      form.setValue("mismatchBudget", 0);
    }
  }, [watchMode, watchSequences, watchPattern, form]);

  useEffect(() => {
    if (watchMode === "pda" && !watchDotBracket) {
      const currentSequences = form.getValues("sequences");
      const currentInput = form.getValues("inputPath");
      if (currentSequences?.trim()) {
        form.setValue("sequences", "");
      }
      if (currentInput?.trim()) {
        form.setValue("inputPath", "");
      }
    }
  }, [form, watchMode, watchDotBracket]);

  const handlePreset = () => {
    const preset = SAMPLE_PRESETS[watchMode];
    form.setValue("pattern", preset.pattern);
    form.setValue("sequences", preset.sequences);
    form.setValue("allowDotBracket", preset.allowDotBracket ?? false);
  };

  const onSubmit = (values: FormValues) => {
    // Abort any in-flight request to avoid stale results winning races
    if (activeController) {
      activeController.abort();
    }

    const controller = new AbortController();
    setResult(null);
    setActiveController(controller);
    simulate(values, modeMeta.label, controller);
  };

  const handleCancel = () => {
    activeController?.abort();
    setActiveController(null);
  };

  useEffect(() => {
    return () => {
      activeController?.abort();
    };
  }, [activeController]);

  const handleHistoryLoad = (item: SimulationHistoryItem) => {
    // Clear existing form state before applying history values
    form.reset({
      mode: "nfa",
      sequences: "",
      inputPath: "",
      pattern: "",
      mismatchBudget: 0,
      allowDotBracket: false,
    });

    form.setValue("mode", item.mode as FormValues["mode"]);

    if (typeof item.params.pattern === "string") {
      form.setValue("pattern", item.params.pattern);
    }

    if (typeof item.params.input_path === "string") {
      form.setValue("inputPath", item.params.input_path);
    }

    const storedSequences = item.params.sequences;
    if (typeof storedSequences === "string") {
      try {
        const arr = JSON.parse(storedSequences) as string[];
        form.setValue("sequences", arr.join("\n"));
      } catch {
        form.setValue("sequences", storedSequences);
      }
    } else if (Array.isArray(storedSequences)) {
      const seqArray = storedSequences
        .filter((seq): seq is string => typeof seq === "string")
        .map((seq) => seq.trim())
        .filter(Boolean);
      form.setValue("sequences", seqArray.join("\n"));
    }

    if (typeof item.params.allow_dot_bracket === "boolean") {
      form.setValue("allowDotBracket", item.params.allow_dot_bracket);
    }

    if (typeof item.params.mismatch_budget === "number") {
      form.setValue("mismatchBudget", item.params.mismatch_budget);
    }
  };

  const deriveStatePath = useMemo(() => {
    if (!result?.automaton) {
      return [];
    }

    // Build a breadth-first visitation order from the start state.
    const automaton = result.automaton;
    const visited = new Set<number>();
    const queue: number[] = [];
    const path: number[] = [];

    if (typeof automaton.start === "number") {
      queue.push(automaton.start);
    }

    while (queue.length > 0 && path.length < 100) {
      const stateId = queue.shift();
      if (stateId === undefined || visited.has(stateId)) continue;

      visited.add(stateId);
      path.push(stateId);

      const state = automaton.states.find((s) => s.id === stateId);
      const edges = Array.isArray(state?.edges) ? state?.edges : [];

      for (const edge of edges) {
        if (typeof edge.to === "number" && !visited.has(edge.to)) {
          queue.push(edge.to);
        }
      }
    }

    return path;
  }, [result?.automaton]);

  const rawDebug = useMemo(() => formatRawDebug(result?.raw), [result?.raw]);

  const renderResults = () => {
    if (isSubmitting) {
      return (
        <Card className="shadow-lg border-2 border-blue-200 dark:border-blue-900/50">
          <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 px-4 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg sm:text-xl font-bold">
                  Running Simulation…
                </CardTitle>
                <CardDescription className="mt-1 text-xs sm:text-sm">
                  Fetching automaton trace from backend
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:gap-4 pt-4 sm:pt-6 px-4 sm:px-6">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </CardContent>
        </Card>
      );
    }

    if (!result) {
      return (
        <Card className="shadow-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700">
          <CardHeader className="text-center py-8 sm:py-12 px-4 sm:px-6">
            <div className="mx-auto mb-3 sm:mb-4 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30">
              <Play className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-lg sm:text-xl font-bold mb-2">
              No Simulation Yet
            </CardTitle>
            <CardDescription className="text-sm sm:text-base max-w-md mx-auto">
              Choose a mode, add sequences or a file path, then run the
              automaton to see traces and summaries.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    const showRnaEnhancedOutcomes =
      (result.summary.modeLabel ?? "").toLowerCase().includes("pda") &&
      result.sequences.some((seq) => seq.primarySequence || seq.dotBracket);

    return (
      <div className="space-y-8">
        <Card className="shadow-lg border-2 border-green-200 dark:border-green-900/50 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-b-2 border-green-200 dark:border-green-900/50 px-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-6">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0"></div>
                  <CardTitle className="text-lg sm:text-xl font-bold truncate">
                    {result.summary.modeLabel}
                  </CardTitle>
                </div>
                <CardDescription className="text-xs sm:text-sm">
                  Completed at{" "}
                  <span className="font-medium">
                    {new Date(result.summary.timestamp).toLocaleTimeString()}
                  </span>
                </CardDescription>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4 text-xs sm:text-sm lg:grid-cols-3 xl:grid-cols-5">
                <div className="rounded-lg bg-white/60 dark:bg-zinc-900/60 p-2 sm:p-3 border border-green-100 dark:border-green-900/50">
                  <p className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1 font-semibold">
                    Runtime
                  </p>
                  <p className="text-sm sm:text-base lg:text-lg font-bold text-zinc-900 dark:text-zinc-100 break-words">
                    {result.summary.runtimeMs
                      ? `${result.summary.runtimeMs} ms`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-white/60 dark:bg-zinc-900/60 p-2 sm:p-3 border border-green-100 dark:border-green-900/50">
                  <p className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1 font-semibold">
                    Matches
                  </p>
                  <p className="text-sm sm:text-base lg:text-lg font-bold text-emerald-600 dark:text-emerald-400 break-words">
                    {result.summary.matches}/{result.summary.sequenceCount}
                  </p>
                </div>
                <div className="rounded-lg bg-white/60 dark:bg-zinc-900/60 p-2 sm:p-3 border border-green-100 dark:border-green-900/50">
                  <p className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1 font-semibold">
                    Mismatch Budget
                  </p>
                  <p className="text-sm sm:text-base lg:text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {result.summary.mismatchBudget}
                  </p>
                </div>
                {result.summary.averageCoverage !== undefined && (
                  <div className="rounded-lg bg-white/60 dark:bg-zinc-900/60 p-2 sm:p-3 border border-green-100 dark:border-green-900/50">
                    <p className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1 font-semibold">
                      Avg Coverage
                    </p>
                    <p className="text-sm sm:text-base lg:text-lg font-bold text-blue-600 dark:text-blue-400">
                      {(result.summary.averageCoverage * 100).toFixed(1)}%
                    </p>
                  </div>
                )}
                {result.summary.totalStatesVisited !== undefined && (
                  <div className="rounded-lg bg-white/60 dark:bg-zinc-900/60 p-2 sm:p-3 border border-green-100 dark:border-green-900/50">
                    <p className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1 font-semibold">
                      States Visited
                    </p>
                    <p className="text-sm sm:text-base lg:text-lg font-bold text-purple-600 dark:text-purple-400">
                      {result.summary.totalStatesVisited}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 pt-4 sm:pt-6 px-4 sm:px-6">
            <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-gradient-to-br from-zinc-50 to-white p-4 sm:p-5 text-xs sm:text-sm dark:border-zinc-700 dark:from-zinc-900/50 dark:to-zinc-900 transition-all hover:border-blue-400 dark:hover:border-blue-600">
              <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 font-semibold">
                Max Stack Depth
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {result.summary.maxStackDepth ?? "—"}
              </p>
            </div>
            <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-gradient-to-br from-zinc-50 to-white p-4 sm:p-5 text-xs sm:text-sm dark:border-zinc-700 dark:from-zinc-900/50 dark:to-zinc-900 transition-all hover:border-blue-400 dark:hover:border-blue-600">
              <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 font-semibold">
                Sequence Count
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                {result.summary.sequenceCount}
              </p>
            </div>
            {result.summary.allAccepted !== undefined && (
              <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-gradient-to-br from-zinc-50 to-white p-4 sm:p-5 text-xs sm:text-sm dark:border-zinc-700 dark:from-zinc-900/50 dark:to-zinc-900 transition-all hover:border-blue-400 dark:hover:border-blue-600">
                <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 font-semibold">
                  All Accepted
                </p>
                <p className="text-2xl sm:text-3xl font-bold">
                  {result.summary.allAccepted ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Yes
                    </span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">No</span>
                  )}
                </p>
              </div>
            )}
            {result.summary.sequencesWithMatches !== undefined && (
              <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-gradient-to-br from-zinc-50 to-white p-4 sm:p-5 text-xs sm:text-sm dark:border-zinc-700 dark:from-zinc-900/50 dark:to-zinc-900 transition-all hover:border-blue-400 dark:hover:border-blue-600">
                <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 font-semibold">
                  With Matches
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                  {result.summary.sequencesWithMatches}/
                  {result.summary.sequenceCount}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6">
            <CardTitle className="text-lg sm:text-xl font-bold">
              Sequence Outcomes
            </CardTitle>
            <CardDescription className="mt-1 text-xs sm:text-sm">
              Accepted states, mismatches, and visit summaries per sequence.
            </CardDescription>
          </CardHeader>
          <CardContent
            className={
              showRnaEnhancedOutcomes ? "p-4 sm:p-6" : "overflow-x-auto p-0"
            }
          >
            {showRnaEnhancedOutcomes ? (
              <div className="space-y-4 sm:space-y-5">
                {result.sequences.map((seq) => {
                  const formattedChecks =
                    seq.rnaChecks?.map((check) => formatRnaCheck(check)) ?? [];
                  const matchCount =
                    seq.matchRanges && seq.matchRanges.length > 0
                      ? seq.matchRanges.length
                      : undefined;
                  const mismatchList =
                    seq.mismatchPositions && seq.mismatchPositions.length > 0
                      ? seq.mismatchPositions.join(", ")
                      : null;
                  const baseSequence =
                    seq.primarySequence || seq.sequence || "—";
                  const acceptanceBadge =
                    seq.accepted === undefined
                      ? {
                          label: "Pending",
                          classes:
                            "bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
                        }
                      : seq.accepted
                      ? {
                          label: "Accepted",
                          classes:
                            "bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700 border border-emerald-200 shadow-sm dark:from-emerald-900/40 dark:to-green-900/40 dark:text-emerald-200 dark:border-emerald-800",
                        }
                      : {
                          label: "Rejected",
                          classes:
                            "bg-gradient-to-r from-rose-100 to-red-100 text-red-700 border border-rose-200 shadow-sm dark:from-rose-900/40 dark:to-red-900/40 dark:text-rose-200 dark:border-rose-800",
                        };

                  return (
                    <div
                      key={seq.id}
                      className="rounded-2xl border-2 border-zinc-200/80 bg-gradient-to-br from-white via-zinc-50 to-zinc-100 p-4 shadow-sm transition-all hover:border-blue-200 hover:shadow-xl dark:border-zinc-800/70 dark:from-zinc-950/50 dark:via-zinc-900/10 dark:to-zinc-900"
                    >
                      <div className="flex flex-col gap-4 sm:gap-5">
                        <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
                          <div className="space-y-1 flex-1 min-w-0">
                            <p className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">
                              {seq.primarySequence
                                ? "Primary sequence"
                                : "Sequence"}
                            </p>
                            <p className="font-mono text-sm sm:text-base lg:text-lg font-semibold text-zinc-900 dark:text-zinc-50 break-words whitespace-pre-wrap">
                              {baseSequence}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wide ${acceptanceBadge.classes}`}
                            >
                              {acceptanceBadge.label}
                            </span>
                            {seq.rnaResult && (
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] sm:text-xs font-semibold border ${
                                  seq.rnaResult.toLowerCase() === "valid"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800"
                                    : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800"
                                }`}
                              >
                                {seq.rnaResult}
                              </span>
                            )}
                            {seq.rnaValidBases !== undefined && (
                              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] sm:text-xs font-semibold border bg-zinc-900/5 text-zinc-600 border-zinc-200 dark:bg-zinc-800/70 dark:text-zinc-200 dark:border-zinc-700">
                                {seq.rnaValidBases
                                  ? "Valid RNA bases"
                                  : "Invalid RNA bases"}
                              </span>
                            )}
                          </div>
                        </div>

                        {seq.dotBracket && (
                          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs sm:text-sm dark:border-blue-900/40 dark:bg-blue-950/20">
                            <p className="text-[10px] uppercase tracking-widest text-blue-600 dark:text-blue-200 font-semibold mb-1">
                              Secondary structure
                            </p>
                            <p className="font-mono text-sm sm:text-base text-blue-900 dark:text-blue-100 break-words">
                              {seq.dotBracket}
                            </p>
                          </div>
                        )}

                        {formattedChecks.length > 0 && (
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/10">
                            <div className="px-3 py-2 border-b border-emerald-100/70 dark:border-emerald-900/30">
                              <p className="text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-200 font-semibold">
                                RNA validation
                              </p>
                            </div>
                            <div className="divide-y divide-emerald-100 dark:divide-emerald-900/30">
                              {formattedChecks.map((check, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between gap-2 px-3 py-2 text-[10px] sm:text-xs"
                                >
                                  <span className="flex-1 text-zinc-700 dark:text-zinc-200 break-words">
                                    {check.description || seq.rnaChecks?.[idx]}
                                  </span>
                                  {check.status && (
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                        check.status === "ok"
                                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                                          : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                                      }`}
                                    >
                                      {check.statusLabel ??
                                        (check.status === "ok" ? "OK" : "ERR")}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {seq.rnaMessages?.length ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs sm:text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200">
                            <p className="text-[10px] uppercase tracking-widest font-semibold mb-1">
                              Messages
                            </p>
                            <div className="space-y-0.5">
                              {seq.rnaMessages.map((message, idx) => (
                                <p key={idx} className="break-words">
                                  {message}
                                </p>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-xs sm:text-sm">
                          <div className="rounded-xl border border-blue-100 bg-white/70 p-3 dark:border-blue-900/30 dark:bg-blue-950/10">
                            <p className="text-[10px] uppercase tracking-widest text-blue-600 dark:text-blue-300 font-semibold">
                              Matches
                            </p>
                            <p className="text-lg font-bold text-blue-700 dark:text-blue-200">
                              {matchCount !== undefined ? matchCount : "—"}
                            </p>
                            {matchCount !== undefined && seq.matchRanges && (
                              <p className="text-[10px] text-blue-500 dark:text-blue-300">
                                {seq.matchRanges
                                  .map((range) => range.range)
                                  .join(", ")}
                              </p>
                            )}
                          </div>
                          <div className="rounded-xl border border-rose-100 bg-white/70 p-3 dark:border-rose-900/30 dark:bg-rose-950/10">
                            <p className="text-[10px] uppercase tracking-widest text-rose-600 dark:text-rose-300 font-semibold">
                              Mismatches
                            </p>
                            <p className="text-lg font-bold text-rose-700 dark:text-rose-200">
                              {seq.mismatches !== undefined
                                ? seq.mismatches
                                : "—"}
                            </p>
                            {mismatchList && (
                              <p className="text-[10px] text-rose-500 dark:text-rose-300">
                                {mismatchList}
                              </p>
                            )}
                          </div>
                          <div className="rounded-xl border border-indigo-100 bg-white/70 p-3 dark:border-indigo-900/30 dark:bg-indigo-950/10">
                            <p className="text-[10px] uppercase tracking-widest text-indigo-600 dark:text-indigo-300 font-semibold">
                              States visited
                            </p>
                            <p className="text-lg font-bold text-indigo-700 dark:text-indigo-200">
                              {seq.statesVisited !== undefined
                                ? seq.statesVisited
                                : "—"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-zinc-200 bg-white/80 p-3 dark:border-zinc-800/50 dark:bg-zinc-900/40">
                            <p className="text-[10px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-semibold">
                              Notes
                            </p>
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                              {seq.notes || "No additional notes"}
                            </p>
                          </div>
                        </div>

                        {matchCount !== undefined && seq.matchRanges && (
                          <div className="flex flex-wrap gap-1.5">
                            {seq.matchRanges.map((range, idx) => (
                              <span
                                key={idx}
                                className="rounded-lg bg-gradient-to-r from-blue-100 to-indigo-100 px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-blue-700 shadow-sm dark:from-blue-900/40 dark:to-indigo-900/40 dark:text-blue-200"
                              >
                                {range.range}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[500px] sm:min-w-[700px] text-xs sm:text-sm">
                  <thead className="bg-gradient-to-r from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800 border-b-2 border-zinc-200 dark:border-zinc-700">
                    <tr className="text-left">
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                        Sequence
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                        Accepted
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                        Matches
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                        States Visited
                      </th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {result.sequences.map((seq) => {
                      const isPdaSecondaryOnly =
                        result.summary.modeLabel
                          .toLowerCase()
                          .includes("pda") && !seq.primarySequence;
                      const formattedChecks =
                        seq.rnaChecks?.map((check) => formatRnaCheck(check)) ??
                        [];
                      return (
                        <tr
                          key={seq.id}
                          className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                        >
                          <td className="px-2 sm:px-4 py-3 sm:py-4 font-mono text-[10px] sm:text-xs text-zinc-900 dark:text-zinc-100">
                            <div className="max-w-[220px] sm:max-w-md space-y-1">
                              {seq.primarySequence ? (
                                <div className="rounded-lg border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/40 p-2 sm:p-3 space-y-2 shadow-sm">
                                  <div className="space-y-0.5">
                                    <span className="text-[9px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
                                      Primary sequence
                                    </span>
                                    <p className="font-mono text-[11px] sm:text-xs font-semibold text-zinc-900 dark:text-zinc-100 break-words whitespace-pre-wrap">
                                      {seq.primarySequence}
                                    </p>
                                  </div>
                                  {seq.dotBracket && (
                                    <div className="space-y-0.5">
                                      <span className="text-[9px] uppercase tracking-wider text-blue-500 dark:text-blue-300 font-semibold">
                                        Secondary structure
                                      </span>
                                      <p className="font-mono text-[11px] sm:text-xs text-blue-900 dark:text-blue-100 break-words">
                                        {seq.dotBracket}
                                      </p>
                                    </div>
                                  )}
                                  {(seq.rnaResult ||
                                    seq.rnaValidBases !== undefined) && (
                                    <div className="flex flex-wrap gap-1 sm:gap-1.5">
                                      {seq.rnaResult && (
                                        <span
                                          className={`inline-flex items-center rounded-full px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold border ${
                                            seq.rnaResult.toLowerCase() ===
                                            "valid"
                                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800"
                                              : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800"
                                          }`}
                                        >
                                          {seq.rnaResult}
                                        </span>
                                      )}
                                      {seq.rnaValidBases !== undefined && (
                                        <span className="inline-flex items-center rounded-full px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold border bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700">
                                          {seq.rnaValidBases
                                            ? "Valid RNA bases"
                                            : "Invalid RNA bases"}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {formattedChecks.length > 0 && (
                                    <div className="mt-1 rounded-md border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-200 dark:divide-zinc-800 bg-white/70 dark:bg-zinc-900/40">
                                      {formattedChecks.map((check, idx) => (
                                        <div
                                          key={idx}
                                          className="flex items-center justify-between gap-2 px-2 py-1 text-[9px] sm:text-[10px]"
                                        >
                                          <span className="flex-1 text-zinc-600 dark:text-zinc-300 break-words">
                                            {check.description ||
                                              seq.rnaChecks?.[idx]}
                                          </span>
                                          {check.status && (
                                            <span
                                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                                                check.status === "ok"
                                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                                                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                                              }`}
                                            >
                                              {check.statusLabel ??
                                                (check.status === "ok"
                                                  ? "OK"
                                                  : "ERR")}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {seq.rnaMessages?.length ? (
                                    <div className="mt-1 space-y-0.5 text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-300">
                                      {seq.rnaMessages.map((message, idx) => (
                                        <p key={idx} className="break-words">
                                          {message}
                                        </p>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : seq.dotBracket ? (
                                <div className="space-y-0.5">
                                  <span className="text-[9px] uppercase tracking-wider text-blue-500 dark:text-blue-300 font-semibold">
                                    Secondary
                                  </span>
                                  <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                                    {seq.dotBracket}
                                  </div>
                                </div>
                              ) : (
                                <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                                  {seq.sequence}
                                </div>
                              )}
                            </div>
                            {seq.matchRanges &&
                              seq.matchRanges.length > 0 &&
                              !isPdaSecondaryOnly && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {seq.matchRanges.map((range, idx) => (
                                    <span
                                      key={idx}
                                      className="rounded-md bg-gradient-to-r from-blue-100 to-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 shadow-sm dark:from-blue-900/50 dark:to-blue-800/50 dark:text-blue-200"
                                    >
                                      {range.range}
                                    </span>
                                  ))}
                                </div>
                              )}
                          </td>
                          <td className="px-2 sm:px-4 py-3 sm:py-4">
                            {seq.accepted === undefined ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                <span className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-zinc-400"></span>
                                <span className="hidden sm:inline">
                                  pending
                                </span>
                                <span className="sm:hidden">P</span>
                              </span>
                            ) : seq.accepted ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-100 to-green-100 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold text-emerald-700 shadow-sm dark:from-emerald-900/50 dark:to-green-900/50 dark:text-emerald-200">
                                <span className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-emerald-500"></span>
                                <span className="hidden sm:inline">
                                  accepted
                                </span>
                                <span className="sm:hidden">A</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-red-100 to-rose-100 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold text-red-700 shadow-sm dark:from-red-900/50 dark:to-rose-900/50 dark:text-red-200">
                                <span className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full bg-red-500"></span>
                                <span className="hidden sm:inline">
                                  rejected
                                </span>
                                <span className="sm:hidden">R</span>
                              </span>
                            )}
                          </td>
                          <td className="px-2 sm:px-4 py-3 sm:py-4">
                            {seq.matchRanges && !isPdaSecondaryOnly ? (
                              <span className="font-bold text-blue-600 dark:text-blue-400">
                                {seq.matchRanges.length}
                              </span>
                            ) : seq.mismatches !== undefined ? (
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                  {seq.mismatches}
                                </span>
                                {!!seq.mismatchPositions?.length && (
                                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {seq.mismatchPositions.join(", ")}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-4 py-3 sm:py-4">
                            {seq.statesVisited !== undefined ? (
                              <span className="font-bold text-indigo-600 dark:text-indigo-400 text-[10px] sm:text-xs">
                                {seq.statesVisited}
                              </span>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-4 py-3 sm:py-4 text-zinc-600 dark:text-zinc-400 text-[10px] sm:text-xs max-w-[100px] sm:max-w-none truncate">
                            {seq.notes ?? (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6">
            <CardTitle className="text-lg sm:text-xl font-bold">
              State Diagram
            </CardTitle>
            <CardDescription className="mt-1 text-xs sm:text-sm">
              Visual representation of the automaton with step-by-step
              highlighting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 pt-4 sm:pt-6 px-4 sm:px-6">
            {result.automaton ? (
              <div className="rounded-xl border-2 border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-3 sm:p-6 dark:border-zinc-800 dark:from-zinc-900/50 dark:to-zinc-900">
                <StateDiagram
                  automaton={result.automaton}
                  activeStates={deriveStatePath}
                />
              </div>
            ) : (
              <div className="relative rounded-xl border-2 border-dashed border-zinc-300 bg-gradient-to-br from-zinc-50 to-white p-12 text-center dark:border-zinc-700 dark:from-zinc-900/50 dark:to-zinc-900">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <svg
                    className="h-6 w-6 text-zinc-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <p className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1">
                  No automaton data available
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Run a simulation to see the state diagram
                </p>
              </div>
            )}
            {result.traces.length > 0 && (
              <div className="rounded-xl border-2 border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 sm:p-6 dark:border-zinc-800 dark:from-zinc-900/50 dark:to-zinc-900">
                <h3 className="mb-3 sm:mb-4 text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Execution Traces
                </h3>
                <ol className="space-y-2 sm:space-y-3">
                  {result.traces.map((trace) => (
                    <li
                      key={trace.step}
                      className="flex items-start gap-2 sm:gap-4 rounded-lg bg-white p-2.5 sm:p-3 shadow-sm dark:bg-zinc-900 transition-all hover:shadow-md"
                    >
                      <span className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] sm:text-xs font-bold text-white shadow-md">
                        {trace.step}
                      </span>
                      <p className="pt-0.5 text-xs sm:text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {trace.label}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <details className="group rounded-xl border-2 border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 transition-all hover:border-zinc-300 dark:border-zinc-800 dark:from-zinc-900/50 dark:to-zinc-900 dark:hover:border-zinc-700">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-700 dark:text-zinc-300 transition-colors group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                Raw Response Debug
              </summary>
              <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-gradient-to-br from-zinc-900 to-zinc-800 p-4 text-xs text-green-200 shadow-inner border border-zinc-700">
                {rawDebug}
              </pre>
            </details>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-50 px-3 py-4 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 sm:px-4 sm:py-6 lg:px-6 lg:py-8">
      <main className="mx-auto grid max-w-7xl gap-4 sm:gap-6 lg:gap-8 xl:grid-cols-[440px_1fr]">
        <Card className="order-2 xl:order-1 xl:w-[440px] xl:shrink-0 shadow-lg transition-shadow hover:shadow-xl w-full">
          <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 px-4 sm:px-6">
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="space-y-1 flex-1 min-w-0">
                <CardTitle className="text-lg sm:text-xl font-bold bg-gradient-to-r from-zinc-900 to-zinc-700 bg-clip-text text-transparent dark:from-zinc-100 dark:to-zinc-300">
                  Automata Pattern Search
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm leading-relaxed">
                  Select a mode, load sequences, and inspect how the backend
                  automaton processes your query. Use presets to get started
                  quickly.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 sm:space-y-8 pt-4 sm:pt-6 px-4 sm:px-6">
            <form
              className="space-y-6 sm:space-y-8"
              onSubmit={form.handleSubmit(onSubmit)}
              id="simulation-form"
            >
              <section className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Mode
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 sm:h-8 gap-1.5 sm:gap-2 px-2.5 sm:px-3 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 touch-manipulation"
                    onClick={handlePreset}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span className="hidden xs:inline">Load sample</span>
                    <span className="xs:hidden">Sample</span>
                  </Button>
                </div>
                <ToggleGroup
                  value={watchMode}
                  onValueChange={(value) =>
                    form.setValue("mode", value as FormValues["mode"])
                  }
                  className="w-full"
                >
                  {MODES.map((mode) => (
                    <ToggleGroupItem
                      key={mode.value}
                      value={mode.value}
                      className="transition-all hover:scale-105 min-w-0 flex-1 sm:min-w-[120px] touch-manipulation text-xs sm:text-sm px-2 sm:px-3 py-2.5 sm:py-2"
                    >
                      {mode.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-3 sm:p-4 text-xs sm:text-sm text-zinc-700 dark:from-blue-950/30 dark:to-indigo-950/30 dark:text-zinc-300 border border-blue-100 dark:border-blue-900/50">
                  <span className="block font-semibold text-zinc-900 dark:text-zinc-100 mb-1 sm:mb-1.5">
                    {modeMeta.description}
                  </span>
                  <span className="text-xs leading-relaxed">
                    {modeMeta.helper}
                  </span>
                </div>
              </section>

              {shouldShowPrimaryInputs && (
                <section className="space-y-4 sm:space-y-5">
                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Label
                        htmlFor="sequences"
                        className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                      >
                        {isPdaMode ? "RNA Primary Sequences" : "Sequences"}
                      </Label>
                      <span className="text-xs font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md whitespace-nowrap">
                        {sequenceArray.length} detected
                      </span>
                    </div>
                    <Textarea
                      id="sequences"
                      placeholder={
                        isPdaMode
                          ? "CGUAGCUCUG&#10;AUGCAUGCAU"
                          : "ACGT...&#10;ACAT..."
                      }
                      rows={6}
                      className="font-mono text-xs sm:text-sm transition-all focus:ring-2 focus:ring-blue-500 w-full resize-y"
                      {...form.register("sequences")}
                    />
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                        {isPdaMode
                          ? "Use A, C, G, and U bases for RNA primary input."
                          : "Auto-uppercases DNA inputs"}
                      </span>
                    </div>
                    {form.formState.errors.sequences && (
                      <p className="text-sm text-red-600 font-medium">
                        {form.formState.errors.sequences.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <Label
                      htmlFor="inputPath"
                      className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                    >
                      {isPdaMode
                        ? "RNA Primary File Path"
                        : "FASTA / Text File Path"}
                    </Label>
                    <Input
                      id="inputPath"
                      placeholder={
                        isPdaMode
                          ? "/datasets/rna/sequence.txt"
                          : "/Users/.../dataset.txt"
                      }
                      className="font-mono text-xs sm:text-sm transition-all focus:ring-2 focus:ring-blue-500 w-full"
                      {...form.register("inputPath")}
                    />
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      {isPdaMode
                        ? "Absolute path for RNA primary sequences (--input)."
                        : "Provide an absolute path accessible to the Flask backend."}
                    </p>
                    {form.formState.errors.inputPath && (
                      <p className="text-sm text-red-600 font-medium">
                        {form.formState.errors.inputPath.message}
                      </p>
                    )}
                  </div>
                </section>
              )}

              <section className="space-y-4 sm:space-y-5">
                <div className="space-y-2 sm:space-y-3">
                  <Label
                    htmlFor="pattern"
                    className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                  >
                    {isPdaMode
                      ? "Secondary Structure Pattern / Grammar"
                      : "Pattern / Grammar"}
                  </Label>
                  <Textarea
                    id="pattern"
                    placeholder={isPdaMode ? "(..((..)))" : "A(CG|TT)*"}
                    rows={3}
                    className="font-mono text-xs sm:text-sm transition-all focus:ring-2 focus:ring-blue-500 w-full resize-y"
                    {...form.register("pattern")}
                  />
                  {isPdaMode && (
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Define the dot-bracket secondary structure or grammar
                      (--secondary).
                    </p>
                  )}
                  {form.formState.errors.pattern && (
                    <p className="text-sm text-red-600 font-medium">
                      {form.formState.errors.pattern.message}
                    </p>
                  )}
                </div>

                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                  <div className="space-y-3 sm:space-y-4 rounded-xl border-2 border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 sm:p-5 dark:border-zinc-800 dark:from-zinc-900/50 dark:to-zinc-900 transition-all hover:border-blue-300 dark:hover:border-blue-700">
                    <div className="flex items-center justify-between gap-2">
                      <Label
                        htmlFor="mismatchBudget"
                        className="text-sm font-semibold"
                      >
                        Mismatch Budget
                        <span className="ml-1 sm:ml-2 text-xs font-normal text-zinc-500">
                          (EFA)
                        </span>
                      </Label>
                      <span className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {mismatchBudget ?? 0}
                      </span>
                    </div>
                    <Slider
                      id="mismatchBudget"
                      min={0}
                      max={5}
                      value={mismatchBudget ?? 0}
                      disabled={watchMode !== "efa"}
                      onChange={(value) =>
                        form.setValue("mismatchBudget", value)
                      }
                    />
                  </div>

                  <div className="space-y-3 sm:space-y-4 rounded-xl border-2 border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 sm:p-5 dark:border-zinc-800 dark:from-zinc-900/50 dark:to-zinc-900 transition-all hover:border-blue-300 dark:hover:border-blue-700">
                    <div className="flex items-center justify-between gap-2">
                      <Label
                        htmlFor="allowDotBracket"
                        className="text-sm font-semibold"
                      >
                        Validate RNA Primary
                      </Label>
                      <Switch
                        id="allowDotBracket"
                        checked={watchDotBracket ?? false}
                        onCheckedChange={(checked) => {
                          if (watchMode === "pda") {
                            form.setValue("allowDotBracket", checked);
                          }
                        }}
                        className={watchMode !== "pda" ? "opacity-50" : ""}
                        disabled={watchMode !== "pda"}
                      />
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Include RNA primary sequences (--input) when running the
                      dot-bracket PDA. Turn this off to provide only the
                      secondary structure.
                    </p>
                  </div>
                </div>
              </section>

              {showPayloadWarning && (
                <Alert
                  variant="destructive"
                  className="border-2 border-red-200 dark:border-red-900/50"
                >
                  <span className="font-semibold">
                    Large textarea detected.
                  </span>{" "}
                  Consider using a FASTA file path for better performance.
                </Alert>
              )}

              <section className="space-y-2 sm:space-y-3">
                <Label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Parameter Preview
                </Label>
                <Card className="bg-gradient-to-br from-zinc-50 to-zinc-100/50 dark:from-zinc-900/50 dark:to-zinc-900 border-2 border-zinc-200 dark:border-zinc-800">
                  <CardContent className="grid gap-2 sm:gap-3 overflow-hidden py-3 sm:py-4 px-3 sm:px-6 text-xs sm:text-sm">
                    {Object.entries(previewPayload.payload).map(
                      ([key, value]) => {
                        const displayValue =
                          key === "mode"
                            ? String(value).toUpperCase()
                            : String(value);
                        return (
                          <div
                            key={key}
                            className="flex flex-col gap-1 sm:gap-1.5 rounded-lg bg-white/60 dark:bg-zinc-800/60 p-2 sm:p-2.5 text-zinc-700 dark:text-zinc-300 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <span className="shrink-0 uppercase tracking-wider text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                              {key.replace(/_/g, " ")}
                            </span>
                            <span className="min-w-0 flex-1 break-all font-mono text-xs font-medium sm:text-right">
                              {displayValue}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </CardContent>
                </Card>
              </section>
            </form>
          </CardContent>
          <CardFooter className="sticky bottom-0 left-0 right-0 flex flex-col gap-2 sm:gap-3 border-t border-zinc-200 bg-white/95 py-4 sm:py-5 px-4 sm:px-6 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 sm:flex-row">
            <Button
              type="submit"
              form="simulation-form"
              className="h-11 sm:h-12 w-full gap-2 text-sm sm:text-base font-semibold shadow-md transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] touch-manipulation"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                  Run Simulation
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-12 w-full gap-2 text-sm sm:text-base font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] touch-manipulation"
              onClick={isSubmitting ? handleCancel : () => form.reset()}
            >
              {isSubmitting ? (
                <>
                  <Square className="h-4 w-4 sm:h-5 sm:w-5" />
                  Cancel
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                  Reset Form
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <div className="order-1 flex flex-col gap-4 sm:gap-6 lg:gap-8 xl:order-2 w-full">
          {renderResults()}

          <Card className="shadow-lg">
            <CardHeader className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl font-bold">
                Recent Simulations
              </CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm">
                Load one of the last five requests.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
              {history.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-gradient-to-br from-zinc-50 to-white p-6 sm:p-8 text-center dark:border-zinc-700 dark:from-zinc-900/50 dark:to-zinc-900">
                  <p className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    No history yet.
                  </p>
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                    Run your first simulation to see it here
                  </p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleHistoryLoad(item)}
                      className="group flex w-full flex-col rounded-xl border-2 border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-3 sm:p-4 text-left transition-all hover:border-blue-400 hover:shadow-md dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900/50 dark:hover:border-blue-600 touch-manipulation"
                    >
                      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                        <span className="rounded-md bg-blue-100 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                          {item.summary.modeLabel}
                        </span>
                        <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <span className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {item.summary.matches}/{item.summary.sequenceCount}{" "}
                        matches
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl font-bold">
                Guided Walkthrough
              </CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm">
                Compare request/response details across form and results.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6">
              <Tabs defaultValue="request">
                <TabsList className="grid w-full grid-cols-2 mb-4 sm:mb-6">
                  <TabsTrigger
                    value="request"
                    className="font-semibold text-xs sm:text-sm px-2 sm:px-3 py-2 touch-manipulation"
                  >
                    Request Schema
                  </TabsTrigger>
                  <TabsTrigger
                    value="response"
                    className="font-semibold text-xs sm:text-sm px-2 sm:px-3 py-2 touch-manipulation"
                  >
                    Response Notes
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="request" className="space-y-3 sm:space-y-4">
                  <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-3 sm:p-5 text-xs sm:text-sm text-zinc-700 dark:from-blue-950/30 dark:to-indigo-950/30 dark:text-zinc-300 border border-blue-100 dark:border-blue-900/50">
                    <p className="leading-relaxed mb-2 sm:mb-3">
                      Every run hits{" "}
                      <code className="rounded-md bg-white/80 dark:bg-zinc-900/80 px-1.5 sm:px-2 py-0.5 sm:py-1 font-mono text-[10px] sm:text-xs font-semibold text-blue-700 dark:text-blue-300">
                        /simulate
                      </code>{" "}
                      with the parameters listed in the preview card. At least
                      one of{" "}
                      <code className="rounded-md bg-white/80 dark:bg-zinc-900/80 px-1.5 sm:px-2 py-0.5 sm:py-1 font-mono text-[10px] sm:text-xs font-semibold text-blue-700 dark:text-blue-300">
                        sequences
                      </code>{" "}
                      or
                      <code className="rounded-md bg-white/80 dark:bg-zinc-900/80 px-1.5 sm:px-2 py-0.5 sm:py-1 font-mono text-[10px] sm:text-xs font-semibold text-blue-700 dark:text-blue-300">
                        {" "}
                        input_path
                      </code>{" "}
                      is required unless RNA primary validation is turned off in
                      Dot-Bracket mode.
                    </p>
                    <p className="leading-relaxed">
                      Requests automatically normalize casing (DNA) and enforce
                      mismatch budgets plus RNA validation toggles based on the
                      active mode.
                    </p>
                  </div>
                </TabsContent>
                <TabsContent
                  value="response"
                  className="space-y-3 sm:space-y-4"
                >
                  <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 p-3 sm:p-5 text-xs sm:text-sm text-zinc-700 dark:from-emerald-950/30 dark:to-green-950/30 dark:text-zinc-300 border border-emerald-100 dark:border-emerald-900/50">
                    <p className="leading-relaxed mb-2 sm:mb-3">
                      The response summary surfaces match counts, runtime, and
                      stack depth. Sequence table lists acceptance status,
                      mismatch chips, and notes.
                    </p>
                    <p className="leading-relaxed">
                      Trace entries populate the timeline; once backend returns
                      transition graphs, they will animate in the reserved
                      canvas.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
