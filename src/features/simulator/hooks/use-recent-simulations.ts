"use client";

import { useEffect, useState, startTransition } from "react";
import { HISTORY_KEY } from "../constants";
import type { SimulationHistoryItem } from "../types";

export function useRecentSimulations() {
  const [history, setHistory] = useState<SimulationHistoryItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as SimulationHistoryItem[];
        startTransition(() => setHistory(parsed));
      } catch {
        startTransition(() => setHistory([]));
      }
    }
  }, []);

  const pushHistory = (item: SimulationHistoryItem) => {
    setHistory((prev) => {
      const next = [item, ...prev].slice(0, 5);
      if (typeof window !== "undefined") {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  return { history, pushHistory };
}
