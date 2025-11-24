import { z } from "zod";
import { formSchema } from "./schema";

export type FormValues = z.infer<typeof formSchema>;

export type AutomatonEdge = {
  type: "literal" | "epsilon";
  to: number;
  literal?: string;
  // PDA-specific fields
  operation?: "push" | "pop" | "ignore";
  symbol?: string;
  code?: number;
};

export type AutomatonState = {
  id: number;
  accept: boolean;
  edges: AutomatonEdge[];
  // PDA-specific fields
  stackDepth?: number;
};

export type Automaton = {
  kind: string;
  start: number;
  accept: number;
  states: AutomatonState[];
  // PDA-specific fields
  rules?: Array<{ expected: string }>;
};

export type MatchRange = {
  start: number;
  end: number;
  length: number;
  range: string;
};

export type SequenceResult = {
  coverage: number;
  has_matches: boolean;
  length: number;
  match_count: number;
  match_ranges: MatchRange[];
  matches: string[];
  max_stack_depth: number | null;
  sequence_number: number;
  sequence_text: string;
  states_visited: number;
};

export type ApiResponse = {
  all_accepted: boolean;
  automaton: Automaton;
  automaton_mode: string;
  average_coverage: number;
  dataset_count: number;
  datasets: string;
  matches: number;
  pattern: string;
  runs: number;
  sequences: SequenceResult[];
  sequences_with_matches: number;
  total_sequences: number;
  total_states_visited: number;
};

export type NormalizedSequence = {
  id: string;
  sequence: string;
  accepted?: boolean;
  mismatches?: number;
  mismatchPositions?: number[];
  stackDepth?: number;
  notes?: string;
  matchRanges?: MatchRange[];
  coverage?: number;
  statesVisited?: number;
};

export type TraceItem = {
  step: number;
  label: string;
};

export type NormalizedResult = {
  summary: {
    modeLabel: string;
    runtimeMs?: number;
    sequenceCount: number;
    matches: number;
    mismatchBudget: number;
    maxStackDepth?: number;
    timestamp: string;
    averageCoverage?: number;
    totalStatesVisited?: number;
    allAccepted?: boolean;
    sequencesWithMatches?: number;
  };
  sequences: NormalizedSequence[];
  traces: TraceItem[];
  automaton?: Automaton;
  raw: unknown;
};

export type SimulationHistoryItem = {
  id: string;
  timestamp: number;
  summary: NormalizedResult["summary"];
  params: Record<string, unknown>;
  mode: FormValues["mode"];
};

export type SimulationVariables = {
  params: Record<string, unknown>;
  controller: AbortController;
  contextSequences: string[];
  modeLabel: string;
  mismatchBudget: number;
};
