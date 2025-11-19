import { z } from "zod";
import { DNA_REGEX, MODE_VALUES } from "./constants";

export const formSchema = z
  .object({
    mode: z.enum(MODE_VALUES),
    sequences: z.string().optional(),
    inputPath: z.string().optional(),
    pattern: z.string().min(1, "Pattern required"),
    mismatchBudget: z.number().min(0).max(5),
    allowDotBracket: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!data.sequences?.trim() && !data.inputPath?.trim()) {
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
