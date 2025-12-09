import {
  NormalizedResult,
  NormalizedSequence,
  TraceItem,
  FormValues,
  ApiResponse,
  Automaton,
  AutomatonState,
  SequenceResult,
} from "./types";

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
    mismatch_budget: values.mode === "efa" ? values.mismatchBudget : 0,
    allow_dot_bracket: values.mode === "pda" ? values.allowDotBracket : false,
  };

  // Only include pattern if it's provided or if allowDotBracket is false
  if (values.pattern?.trim()) {
    payload.pattern = values.pattern.trim();
  }

  if (values.inputPath?.trim()) {
    payload.input_path = values.inputPath.trim();
  }

  if (sequences.length) {
    payload.sequences = sequences;
  }

  return { payload, sequences };
};

const parseSequenceText = (text: string): string => {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return typeof parsed[0] === "string" ? parsed[0] : text;
    }
    return text;
  } catch {
    return text;
  }
};

export const normalizeResponse = (
  rawData: unknown,
  modeLabel: string,
  contextSequences: string[],
  mismatchBudget: number,
  runtimeMs?: number
): NormalizedResult => {
  const data = isRecord(rawData) ? rawData : {};

  // Check if this is the new API response format
  const isNewFormat =
    isRecord(data["automaton"]) &&
    Array.isArray(data["sequences"]) &&
    typeof data["all_accepted"] === "boolean";

  if (isNewFormat) {
    const apiResponse = data as unknown as ApiResponse;
    const rawAutomaton = apiResponse.automaton;

    // For EFA, extract the NFA structure
    const automatonSource = isRecord(rawAutomaton.nfa)
      ? { ...rawAutomaton, ...rawAutomaton.nfa }
      : rawAutomaton;

    // Normalize automaton structure to ensure all states have edges arrays
    const automaton: Automaton = {
      ...automatonSource,
      // Preserve PDA-specific rules if present
      rules: Array.isArray(rawAutomaton.rules) ? rawAutomaton.rules : undefined,
      states: Array.isArray(automatonSource.states)
        ? automatonSource.states.map((state: AutomatonState) => {
            // Handle different possible edge property names (transitions for PDA, edges for others)
            const rawEdges =
              state.edges ??
              (state as Record<string, unknown>).transitions ??
              (state as Record<string, unknown>).outgoing ??
              [];

            return {
              ...state,
              // Preserve PDA-specific stackDepth if present
              stackDepth:
                typeof (state as Record<string, unknown>).stackDepth ===
                "number"
                  ? ((state as Record<string, unknown>).stackDepth as number)
                  : undefined,
              // Always use 'edges' for consistency, removing 'transitions' if it exists
              edges: Array.isArray(rawEdges)
                ? rawEdges.map((edge: unknown) => {
                    // Handle edge as object or different formats
                    if (isRecord(edge)) {
                      const isEpsilon =
                        edge.type === "epsilon" ||
                        edge.transition_type === "epsilon" ||
                        edge.label === "ε" ||
                        edge.label === "epsilon" ||
                        (edge.symbol === "ε" &&
                          edge.operation !== "push" &&
                          edge.operation !== "pop") ||
                        (edge.symbol === "epsilon" &&
                          edge.operation !== "push" &&
                          edge.operation !== "pop");

                      // Preserve PDA-specific operation and symbol
                      const operation =
                        typeof edge.operation === "string"
                          ? (edge.operation as "push" | "pop" | "ignore")
                          : undefined;
                      const symbol =
                        typeof edge.symbol === "string"
                          ? edge.symbol
                          : undefined;
                      const code =
                        typeof edge.code === "number" ? edge.code : undefined;

                      return {
                        type: isEpsilon ? "epsilon" : "literal",
                        to:
                          typeof edge.to === "number"
                            ? edge.to
                            : typeof edge.target === "number"
                            ? edge.target
                            : typeof edge.dest === "number"
                            ? edge.dest
                            : Number(edge.to ?? edge.target ?? edge.dest ?? 0),
                        literal: isEpsilon
                          ? undefined
                          : String(
                              edge.literal ?? edge.label ?? edge.symbol ?? ""
                            ),
                        // Include PDA-specific fields
                        operation,
                        symbol,
                        code,
                      };
                    }
                    // Fallback for unexpected edge format
                    return {
                      type: "literal" as const,
                      to: 0,
                      literal: undefined,
                    };
                  })
                : [],
              accept:
                typeof state.accept === "boolean"
                  ? state.accept
                  : state.id === automatonSource.accept,
            };
          })
        : [],
    };

    const sequences: NormalizedSequence[] = apiResponse.sequences.map(
      (seqResult: SequenceResult, idx: number) => {
        const sequenceText = parseSequenceText(seqResult.sequence_text);
        const sequence =
          sequenceText || contextSequences[idx] || `Sequence ${idx + 1}`;

        return {
          id: `${seqResult.sequence_number}`,
          sequence,
          accepted: seqResult.has_matches,
          matchRanges: seqResult.match_ranges,
          coverage: seqResult.coverage,
          statesVisited: seqResult.states_visited,
          stackDepth:
            seqResult.max_stack_depth !== null
              ? seqResult.max_stack_depth
              : undefined,
          notes: seqResult.has_matches
            ? `${seqResult.match_count} match(es) found`
            : "No matches",
        };
      }
    );

    const traces: TraceItem[] = [];

    const summary: NormalizedResult["summary"] = {
      modeLabel,
      runtimeMs,
      sequenceCount: apiResponse.total_sequences,
      matches: apiResponse.matches,
      mismatchBudget,
      maxStackDepth:
        sequences
          .map((seq) => seq.stackDepth)
          .filter((value): value is number => typeof value === "number")
          .reduce((max, depth) => Math.max(max, depth), 0) || undefined,
      timestamp: new Date().toISOString(),
      averageCoverage: apiResponse.average_coverage,
      totalStatesVisited: apiResponse.total_states_visited,
      allAccepted: apiResponse.all_accepted,
      sequencesWithMatches: apiResponse.sequences_with_matches,
    };

    return {
      summary,
      sequences,
      traces,
      automaton,
      raw: rawData,
    };
  }

  // Fallback to old format handling
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
            item["is_match"] ?? item["status"] === "accept";
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
      (stackDepthCandidates.length
        ? Math.max(...stackDepthCandidates)
        : undefined),
    timestamp: new Date().toISOString(),
  };

  return { summary, sequences, traces, raw: rawData };
};
