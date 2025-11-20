"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
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
import { API_BASE_URL, apiClient, SIMULATE_ENDPOINT } from "@/config/api";
import { MODES, SAMPLE_PRESETS } from "@/features/simulator/constants";
import { formSchema } from "@/features/simulator/schema";
import {
  buildId,
  buildPreviewPayload,
  getSequenceArray,
  normalizeResponse,
} from "@/features/simulator/utils";
import {
  FormValues,
  NormalizedResult,
  SimulationHistoryItem,
  SimulationVariables,
} from "@/features/simulator/types";
import { useRecentSimulations } from "@/features/simulator/hooks/use-recent-simulations";

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

  const [result, setResult] = useState<NormalizedResult | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [activeController, setActiveController] =
    useState<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ params, controller }: SimulationVariables) => {
      const startedAt = Date.now();
      const response = await apiClient.get(SIMULATE_ENDPOINT, {
        params,
        signal: controller.signal,
      });
      const runtimeMs = Math.round(Date.now() - startedAt);
      return { data: response.data, runtimeMs };
    },
  });

  const modeMeta = MODES.find((mode) => mode.value === watchMode) ?? MODES[0];
  const sequenceArray = getSequenceArray(watchSequences);
  const previewPayload = buildPreviewPayload(form.getValues());
  const showPayloadWarning = (watchSequences?.length ?? 0) > 10000;

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

  const handlePreset = () => {
    const preset = SAMPLE_PRESETS[watchMode];
    form.setValue("pattern", preset.pattern);
    form.setValue("sequences", preset.sequences);
    form.setValue("allowDotBracket", preset.allowDotBracket ?? false);
  };

  const onSubmit = (values: FormValues) => {
    const { payload, sequences } = buildPreviewPayload(values);
    const controller = new AbortController();
    setNetworkError(null);
    setActiveController(controller);
    mutation.mutate(
      {
        params: payload,
        controller,
        contextSequences: sequences,
        modeLabel: modeMeta.label,
        mismatchBudget: values.mode === "efa" ? values.mismatchBudget : 0,
      },
      {
        onSuccess: (payloadResult, variables) => {
          const normalized = normalizeResponse(
            payloadResult.data,
            variables.modeLabel,
            variables.contextSequences,
            variables.mismatchBudget,
            payloadResult.runtimeMs
          );
          setResult(normalized);
          pushHistory({
            id: buildId(),
            timestamp: Date.now(),
            summary: normalized.summary,
            params: payload,
            mode: values.mode,
          });
          setActiveController(null);
        },
        onError: (error: unknown) => {
          if (axios.isCancel(error)) {
            setNetworkError("Request cancelled.");
            return;
          }
          if (axios.isAxiosError(error)) {
            if (error.code === "ERR_NETWORK") {
              setNetworkError(
                "Unable to reach the backend. Verify the server is running on " +
                  API_BASE_URL
              );
            } else {
              setNetworkError(
                typeof error.response?.data === "object" &&
                  error.response?.data !== null &&
                  "message" in error.response.data
                  ? String(error.response.data.message)
                  : error.message ?? "Simulation failed. Review your inputs."
              );
            }
          } else if (error instanceof Error) {
            setNetworkError(
              error.message || "Simulation failed. Review your inputs."
            );
          } else {
            setNetworkError("Simulation failed. Review your inputs.");
          }
          setActiveController(null);
        },
      }
    );
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
    form.setValue("mode", item.mode as FormValues["mode"]);
    if (typeof item.params.pattern === "string") {
      form.setValue("pattern", item.params.pattern);
    }
    if (typeof item.params.input_path === "string") {
      form.setValue("inputPath", item.params.input_path);
    }
    if (typeof item.params.sequences === "string") {
      try {
        const arr = JSON.parse(item.params.sequences) as string[];
        form.setValue("sequences", arr.join("\n"));
      } catch {
        form.setValue("sequences", "");
      }
    }
    if (typeof item.params.allow_dot_bracket === "boolean") {
      form.setValue("allowDotBracket", item.params.allow_dot_bracket);
    }
    if (typeof item.params.mismatch_budget === "number") {
      form.setValue("mismatchBudget", item.params.mismatch_budget);
    }
  };

  const isSubmitting = mutation.isPending;

  const renderResults = () => {
    if (isSubmitting) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Running simulation…</CardTitle>
            <CardDescription>
              Fetching automaton trace from backend
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      );
    }

    if (!result) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>No simulation yet</CardTitle>
            <CardDescription>
              Choose a mode, add sequences or a file path, then run the
              automaton to see traces and summaries.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>{result.summary.modeLabel}</CardTitle>
              <CardDescription>
                Completed at{" "}
                {new Date(result.summary.timestamp).toLocaleTimeString()}
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-zinc-600 dark:text-zinc-400 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Runtime
                </p>
                <p className="text-base font-semibold">
                  {result.summary.runtimeMs
                    ? `${result.summary.runtimeMs} ms`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Matches
                </p>
                <p className="text-base font-semibold">
                  {result.summary.matches}/{result.summary.sequenceCount}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Mismatch Budget
                </p>
                <p className="text-base font-semibold">
                  {result.summary.mismatchBudget}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-dashed border-zinc-200 p-4 text-sm dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Max Stack Depth
              </p>
              <p className="text-2xl font-semibold">
                {result.summary.maxStackDepth ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-dashed border-zinc-200 p-4 text-sm dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Sequence Count
              </p>
              <p className="text-2xl font-semibold">
                {result.summary.sequenceCount}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sequence outcomes</CardTitle>
            <CardDescription>
              Accepted states, mismatches, and stack summaries per sequence.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="pb-2">Sequence</th>
                  <th className="pb-2">Accepted</th>
                  <th className="pb-2">Mismatches</th>
                  <th className="pb-2">Stack Depth</th>
                  <th className="pb-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {result.sequences.map((seq) => (
                  <tr key={seq.id}>
                    <td className="py-3 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                      <div className="max-w-xs truncate">{seq.sequence}</div>
                    </td>
                    <td className="py-3">
                      {seq.accepted === undefined ? (
                        <span className="text-zinc-400">pending</span>
                      ) : seq.accepted ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                          accepted
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-200">
                          rejected
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {seq.mismatches !== undefined ? (
                        <>
                          <span className="font-semibold">
                            {seq.mismatches}
                          </span>
                          {!!seq.mismatchPositions?.length && (
                            <span className="ml-2 text-xs text-zinc-500">
                              {seq.mismatchPositions.join(", ")}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3">{seq.stackDepth ?? "—"}</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">
                      {seq.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Traces</CardTitle>
            <CardDescription>
              Timeline of key transitions. Animation canvas reserved for future
              update.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ol className="space-y-4">
              {result.traces.length === 0 && (
                <li className="text-sm text-zinc-500">
                  No trace data returned.
                </li>
              )}
              {result.traces.map((trace) => (
                <li key={trace.step} className="flex gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                    {trace.step}
                  </span>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    {trace.label}
                  </p>
                </li>
              ))}
            </ol>
            <div className="relative rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <p className="font-medium text-zinc-700 dark:text-zinc-200">
                Animated state diagram (coming soon)
              </p>
              <p>
                Backend transition payloads will render here once available.
              </p>
            </div>
            <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <summary className="cursor-pointer text-sm font-medium">
                Raw response debug
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto rounded bg-black/80 p-4 text-xs text-green-200">
                {JSON.stringify(result.raw, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white px-4 py-6 dark:from-zinc-950 dark:to-black sm:px-8">
      <main className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <Card className="order-2 xl:order-1">
          <CardHeader>
            <CardTitle>Automata pattern search visualizer</CardTitle>
            <CardDescription>
              Select a mode, load sequences, and inspect how the backend
              automaton processes your query. Use presets to get started
              quickly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit(onSubmit)}
              id="simulation-form"
            >
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Mode</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 gap-2 px-3 text-xs"
                    onClick={handlePreset}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Load sample
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
                    <ToggleGroupItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  <span className="block font-semibold text-zinc-900 dark:text-zinc-100">
                    {modeMeta.description}
                  </span>
                  {modeMeta.helper}
                </p>
              </section>

              <section className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sequences">Sequences (one per line)</Label>
                  <Textarea
                    id="sequences"
                    placeholder="ACGT...\nACAT..."
                    rows={6}
                    {...form.register("sequences")}
                  />
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>{sequenceArray.length} sequences detected</span>
                    <span>Auto-uppercases DNA inputs</span>
                  </div>
                  {form.formState.errors.sequences && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.sequences.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inputPath">FASTA / text file path</Label>
                  <Input
                    id="inputPath"
                    placeholder="/Users/.../dataset.fasta"
                    {...form.register("inputPath")}
                  />
                  <p className="text-xs text-zinc-500">
                    Provide an absolute path accessible to the Flask backend.
                  </p>
                  {form.formState.errors.inputPath && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.inputPath.message}
                    </p>
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pattern">Pattern / grammar</Label>
                  <Textarea
                    id="pattern"
                    placeholder="A(CG|TT)*"
                    rows={3}
                    {...form.register("pattern")}
                  />
                  {form.formState.errors.pattern && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.pattern.message}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="mismatchBudget">
                        Mismatch budget (EFA)
                      </Label>
                      <span className="text-sm font-semibold">
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

                  <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="allowDotBracket">Allow dot-bracket</Label>
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
                    <p className="text-xs text-zinc-500">
                      Enable dot-bracket parsing when validating RNA structures.
                    </p>
                  </div>
                </div>
              </section>

              {showPayloadWarning && (
                <Alert variant="destructive">
                  Large textarea detected. Consider using a FASTA file path for
                  better performance.
                </Alert>
              )}

              <section className="space-y-3">
                <Label>Parameter preview</Label>
                <Card className="bg-zinc-50 dark:bg-zinc-900/50">
                  <CardContent className="grid gap-3 overflow-hidden py-4 text-sm">
                    {Object.entries(previewPayload.payload).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex flex-col gap-1 text-zinc-600 dark:text-zinc-300 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <span className="shrink-0 uppercase tracking-wide text-xs text-zinc-500">
                            {key}
                          </span>
                          <span className="min-w-0 flex-1 break-all font-medium sm:text-right">
                            {String(value)}
                          </span>
                        </div>
                      )
                    )}
                  </CardContent>
                </Card>
              </section>
            </form>
          </CardContent>
          <CardFooter className="sticky bottom-0 left-0 right-0 flex flex-col gap-3 bg-white/90 py-4 backdrop-blur dark:bg-zinc-950/90 sm:flex-row">
            <Button
              type="submit"
              form="simulation-form"
              className="h-12 w-full gap-2 text-base"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Running
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  Run simulation
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full gap-2 text-base"
              onClick={isSubmitting ? handleCancel : () => form.reset()}
            >
              {isSubmitting ? (
                <>
                  <Square className="h-5 w-5" />
                  Cancel
                </>
              ) : (
                <>
                  <RefreshCcw className="h-5 w-5" />
                  Reset form
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <div className="order-1 flex flex-col gap-6 xl:order-2">
          {networkError && <Alert variant="destructive">{networkError}</Alert>}

          {renderResults()}

          <Card>
            <CardHeader>
              <CardTitle>Recent simulations</CardTitle>
              <CardDescription>
                Load one of the last five requests.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-zinc-500">No history yet.</p>
              ) : (
                <div className="space-y-3 text-sm">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleHistoryLoad(item)}
                      className="flex w-full flex-col rounded-lg border border-zinc-200 p-3 text-left transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                    >
                      <span className="text-xs uppercase text-zinc-500">
                        {item.summary.modeLabel}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {item.summary.matches}/{item.summary.sequenceCount}{" "}
                        matches
                      </span>
                      <span className="text-xs text-zinc-500">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guided walkthrough</CardTitle>
              <CardDescription>
                Compare request/response details across form and results.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="request">
                <TabsList>
                  <TabsTrigger value="request">Request schema</TabsTrigger>
                  <TabsTrigger value="response">Response notes</TabsTrigger>
                </TabsList>
                <TabsContent value="request">
                  <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
                    <p>
                      Every run hits{" "}
                      <code className="font-mono">/simulate</code> with the
                      parameters listed in the preview card. At least one of
                      <code className="font-mono"> sequences</code> or
                      <code className="font-mono"> input_path</code> is
                      required.
                    </p>
                    <p>
                      Requests automatically normalize casing (DNA) and enforce
                      mismatch & dot-bracket switches based on the active mode.
                    </p>
                  </div>
                </TabsContent>
                <TabsContent value="response">
                  <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
                    <p>
                      The response summary surfaces match counts, runtime, and
                      stack depth. Sequence table lists acceptance status,
                      mismatch chips, and notes.
                    </p>
                    <p>
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
