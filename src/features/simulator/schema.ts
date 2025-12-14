import { z } from "zod";
import { DNA_REGEX, MODE_VALUES } from "./constants";

const DNA_PATTERN_BASES = new Set(["A", "C", "G", "T"]);
const ALPHA_CHAR_REGEX = /[A-Z]/;

export const formSchema = z
  .object({
    mode: z.enum(MODE_VALUES),
    sequences: z.string().optional(),
    inputPath: z.string().optional(),
    pattern: z.string().optional(),
    mismatchBudget: z.number().min(0).max(5),
    allowDotBracket: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const requiresPrimaryInput =
      data.mode !== "pda" || (data.mode === "pda" && data.allowDotBracket);

    if (
      requiresPrimaryInput &&
      !data.sequences?.trim() &&
      !data.inputPath?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sequences"],
        message: "Provide at least one sequence or a file path.",
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inputPath"],
        message: "Provide at least one sequence or a file path.",
      });
    }

    if (!data.pattern || !data.pattern.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pattern"],
        message: "Pattern required",
      });
    }

    const requiresDnaAlphabet =
      data.mode === "nfa" || data.mode === "dfa" || data.mode === "efa";
    if (requiresDnaAlphabet && data.pattern?.trim()) {
      const normalized = data.pattern.toUpperCase();
      const invalidChar = Array.from(normalized).find(
        (char) => ALPHA_CHAR_REGEX.test(char) && !DNA_PATTERN_BASES.has(char)
      );
      if (invalidChar) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pattern"],
          message: "DNA patterns must only use A, C, G, or T characters.",
        });
      }
    }

    if (data.mode !== "pda" && data.sequences?.trim()) {
      const sanitized = data.sequences
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .trim();
      if (sanitized && !DNA_REGEX.test(sanitized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sequences"],
          message:
            "Sequences must use uppercase DNA alphabet or IUPAC ambiguity codes.",
        });
      }
    }
  });
