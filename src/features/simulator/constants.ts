export const MODE_VALUES = ["nfa", "dfa", "efa", "pda"] as const;

export type ModeValue = (typeof MODE_VALUES)[number];

export const DNA_REGEX = /^[ACGTRYSWKMBDHVN]+$/;

export type ModeMeta = {
  value: ModeValue;
  label: string;
  description: string;
  helper: string;
};

export const MODES: ModeMeta[] = [
  {
    value: "nfa",
    label: "Exact NFA",
    description: "Traverse all nondeterministic branches for regex motifs.",
    helper: "Ideal for illustrating epsilon transitions and branching paths.",
  },
  {
    value: "dfa",
    label: "Exact DFA",
    description: "Deterministic engine for throughput and minimization demos.",
    helper: "Highlights minimized states and predictable runtime.",
  },
  {
    value: "efa",
    label: "Approximate EFA",
    description: "Extended automaton allowing a bounded mismatch budget.",
    helper: "Surface biologically relevant mutations via mismatch chips.",
  },
  {
    value: "pda",
    label: "Dot-Bracket PDA",
    description: "Pushdown stack validates RNA secondary structures.",
    helper: "Shows push/pop trace and pairing legend for dot-bracket grammar.",
  },
];

export const SAMPLE_PRESETS: Record<
  ModeValue,
  { pattern: string; sequences: string; allowDotBracket?: boolean }
> = {
  nfa: { pattern: "A(CG|TT)*", sequences: "ACGTT\nACTT" },
  dfa: { pattern: "ATG(C|T)A", sequences: "ATGCA\nATGTA" },
  efa: { pattern: "ACGTACGT", sequences: "ACGTACGT\nACCTACGT" },
  pda: {
    pattern: "(..((..)))",
    sequences: "CGUAGCUCUG\nAUGCAUGCAU",
    allowDotBracket: true,
  },
};

export const HISTORY_KEY = "automata-visualizer-history";
