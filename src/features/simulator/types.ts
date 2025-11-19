import { z } from "zod";
import { formSchema } from "./schema";

export type FormValues = z.infer<typeof formSchema>;

export type NormalizedSequence = {
  id: string;
  sequence: string;
  accepted?: boolean;
  mismatches?: number;
  mismatchPositions?: number[];
  stackDepth?: number;
  notes?: string;
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
  };
  sequences: NormalizedSequence[];
  traces: TraceItem[];
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
