import { NormalizedResult, NormalizedSequence, TraceItem, FormValues } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const buildId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const getSequenceArray = (input?: string) =>
  input
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean) ?? [];

export const buildPreviewPayload = (values: FormValues) => {
  const sequences = getSequenceArray(values.sequences);
  const payload: Record<string, unknown> = {
    mode: values.mode,
    pattern: values.pattern.trim(),
    mismatch_budget: values.mode === "efa" ? values.mismatchBudget : 0,
    allow_dot_bracket: values.mode === "pda" ? values.allowDotBracket : false,
  };

  if (values.inputPath?.trim()) {
    payload.input_path = values.inputPath.trim();
  }

  if (sequences.length) {
    payload.sequences = JSON.stringify(sequences);
  }

  return { payload, sequences };
};

export const normalizeResponse = (
  rawData: unknown,
  modeLabel: string,
  contextSequences: string[],
  mismatchBudget: number,
  runtimeMs?: number,
): NormalizedResult => {
  const data = isRecord(rawData) ? rawData : {};
  const sequencesSource =
    (Array.isArray(data["sequences"]) ? data["sequences"] : undefined) ??
    (Array.isArray(data["results"]) ? data["results"] : undefined) ??
    (Array.isArray(data["matches"]) ? data["matches"] : undefined);

  const sequences: NormalizedSequence[] = Array.isArray(sequencesSource)
    ? sequencesSource.map((item, idx) => {
        if (typeof item === "string") {
          return { id: `${idx + 1}`, sequence: item, accepted: undefined };
        }
        if (isRecord(item)) {
          const acceptedValue = item["accepted"];
          const fallbackAccepted =
            item["is_match"] ?? (item["status"] === "accept");
          return {
            id: typeof item["id"] === "string" ? item["id"] : `${idx + 1}`,
            sequence:
              typeof item["sequence"] === "string"
                ? item["sequence"]
                : contextSequences[idx] ?? "",
            accepted:
              typeof acceptedValue === "boolean"
                ? acceptedValue
                : typeof fallbackAccepted === "boolean"
                  ? fallbackAccepted
                  : undefined,
            mismatches:
              typeof item["mismatches"] === "number"
                ? item["mismatches"]
                : typeof item["mismatch_count"] === "number"
                  ? item["mismatch_count"]
                  : undefined,
            mismatchPositions: Array.isArray(item["mismatch_positions"])
              ? (item["mismatch_positions"] as number[])
              : Array.isArray(item["differences"])
                ? (item["differences"] as number[])
                : undefined,
            stackDepth:
              typeof item["max_stack_depth"] === "number"
                ? item["max_stack_depth"]
                : typeof item["stackDepth"] === "number"
                  ? item["stackDepth"]
                  : undefined,
            notes:
              typeof item["note"] === "string"
                ? item["note"]
                : typeof item["explanation"] === "string"
                  ? item["explanation"]
                  : undefined,
          };
        }
        return {
          id: `${idx + 1}`,
          sequence: contextSequences[idx] ?? "",
          accepted: undefined,
        };
      })
    : contextSequences.map((seq, idx) => ({
        id: `${idx + 1}`,
        sequence: seq,
        accepted: undefined,
      }));

  const matches = sequences.filter((seq) => seq.accepted).length;
  const tracesSource =
    (Array.isArray(data["trace"]) ? data["trace"] : undefined) ??
    (Array.isArray(data["steps"]) ? data["steps"] : undefined) ??
    [];
  const traces: TraceItem[] = tracesSource.map((item, idx) => {
    if (isRecord(item)) {
      const description =
        typeof item["description"] === "string"
          ? item["description"]
          : typeof item["action"] === "string"
            ? item["action"]
            : typeof item["label"] === "string"
              ? item["label"]
              : `Executed step ${idx + 1}`;
      const stepValue =
        typeof item["step"] === "number" ? item["step"] : idx + 1;
      return { step: stepValue, label: description };
    }
    return { step: idx + 1, label: `Executed step ${idx + 1}` };
  });

  const stackDepthCandidates = sequences
    .map((seq) => seq.stackDepth)
    .filter((value): value is number => typeof value === "number");

  const statsRecord = isRecord(data["stats"]) ? data["stats"] : undefined;
  const statsStackDepth =
    statsRecord && typeof statsRecord["max_stack_depth"] === "number"
      ? (statsRecord["max_stack_depth"] as number)
      : undefined;

  const summary: NormalizedResult["summary"] = {
    modeLabel,
    runtimeMs,
    sequenceCount: sequences.length,
    matches,
    mismatchBudget,
    maxStackDepth:
      statsStackDepth ??
      (stackDepthCandidates.length ? Math.max(...stackDepthCandidates) : undefined),
    timestamp: new Date().toISOString(),
  };

  return { summary, sequences, traces, raw: rawData };
};
