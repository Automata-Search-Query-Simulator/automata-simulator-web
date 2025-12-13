"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, RotateCcw } from "lucide-react";
import type {
  Automaton,
  AutomatonState,
  AutomatonEdge,
} from "@/features/simulator/types";

interface StateDiagramProps {
  automaton?: Automaton;
  activeStates?: number[];
  onStateClick?: (stateId: number) => void;
}

export function StateDiagram({
  automaton,
  activeStates = [],
  onStateClick,
}: StateDiagramProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const isPDA = automaton?.kind === "PDA" || automaton?.kind === "pda";
  const pdaRules = automaton?.rules;

  const statePath = useMemo(() => {
    if (!automaton || activeStates.length === 0) return [];
    return activeStates;
  }, [automaton, activeStates]);

  const currentActiveStates = useMemo(() => {
    if (statePath.length === 0) return [];
    return statePath.slice(0, currentStep + 1);
  }, [statePath, currentStep]);

  const convertAutomatonToFlow = useCallback(
    (
      automaton: Automaton,
      currentActive: number[]
    ): { nodes: Node[]; edges: Edge[] } => {
      const flowNodes: Node[] = [];
      const flowEdges: Edge[] = [];
      const nodePositions = new Map<number, { x: number; y: number }>();

      // Use hierarchical layout for better organization
      // Group states by level (distance from start)
      const levels = new Map<number, number>();
      const queue: number[] = [automaton.start];
      levels.set(automaton.start, 0);
      const visited = new Set<number>([automaton.start]);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentLevel = levels.get(current) ?? 0;
        const state = automaton.states.find((s) => s.id === current);

        if (state) {
          const edges = Array.isArray(state.edges) ? state.edges : [];
          for (const edge of edges) {
            if (!visited.has(edge.to)) {
              visited.add(edge.to);
              levels.set(edge.to, currentLevel + 1);
              queue.push(edge.to);
            }
          }
        }
      }

      // Organize states by level
      const statesByLevel = new Map<number, number[]>();
      automaton.states.forEach((state) => {
        const level = levels.get(state.id) ?? 0;
        if (!statesByLevel.has(level)) {
          statesByLevel.set(level, []);
        }
        statesByLevel.get(level)!.push(state.id);
      });

      // Calculate positions using hierarchical layout
      const nodeSize = 80;
      const horizontalSpacing = 220;
      const verticalSpacing = 250;
      const startX = 200;
      const startY = 150;

      statesByLevel.forEach((stateIds, level) => {
        const statesInLevel = stateIds.length;
        const levelY = startY + level * verticalSpacing;
        const totalWidth = (statesInLevel - 1) * horizontalSpacing;
        const levelStartX = startX - totalWidth / 2;

        stateIds.forEach((stateId, index) => {
          const x = levelStartX + index * horizontalSpacing;
          const y = levelY;
          nodePositions.set(stateId, { x, y });
        });
      });

      // Check if this is a PDA automaton
      const isPDA = automaton.kind === "PDA" || automaton.kind === "pda";

      // Create circular nodes
      automaton.states.forEach((state) => {
        const pos = nodePositions.get(state.id);
        if (!pos) return;

        const isStart = state.id === automaton.start;
        const isAccept = state.id === automaton.accept || state.accept;
        const isActive = currentActive.includes(state.id);
        const stackDepth = state.stackDepth;

        flowNodes.push({
          id: `node-${state.id}`,
          type: "default",
          position: { x: pos.x, y: pos.y },
          data: {
            label: (
              <div className="flex flex-col items-center justify-center gap-0.5">
                <span className="text-sm font-semibold leading-tight">
                  {state.id}
                </span>
                {isStart && (
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 leading-tight">
                    Start
                  </span>
                )}
                {isAccept && (
                  <span className="text-[10px] text-green-600 dark:text-green-400 leading-tight">
                    Accept
                  </span>
                )}
                {isPDA && stackDepth !== undefined && (
                  <span className="text-[9px] leading-tight font-semibold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/80 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-700">
                    Stack: {stackDepth}
                  </span>
                )}
              </div>
            ),
          },
          style: {
            width: nodeSize,
            height: nodeSize,
            backgroundColor: isActive
              ? "rgb(59 130 246 / 0.2)"
              : isAccept
              ? "rgb(34 197 94 / 0.1)"
              : "white",
            border: isActive
              ? "3px solid rgb(59 130 246)"
              : isAccept
              ? "3px solid rgb(34 197 94)"
              : isStart
              ? "3px solid rgb(59 130 246)"
              : "2px solid #e5e7eb",
            borderRadius: "50%",
            boxShadow: isActive
              ? "0 0 0 4px rgb(59 130 246 / 0.2)"
              : "0 2px 4px rgba(0, 0, 0, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
          className: isActive ? "ring-2 ring-blue-500" : "",
        });
      });

      // Create edges with better routing to avoid overlaps
      const edgeGroups = new Map<
        string,
        Array<{ state: AutomatonState; edge: AutomatonEdge; edgeIndex: number }>
      >();

      automaton.states.forEach((state) => {
        const edges = Array.isArray(state.edges) ? state.edges : [];
        edges.forEach((edge, edgeIndex) => {
          const edgeKey = `${state.id}-${edge.to}`;
          if (!edgeGroups.has(edgeKey)) {
            edgeGroups.set(edgeKey, []);
          }
          edgeGroups.get(edgeKey)!.push({ state, edge, edgeIndex });
        });
      });

      edgeGroups.forEach((edges) => {
        const isEFA = automaton.kind === "EFA" || automaton.kind === "efa";
        const isPDA = automaton.kind === "PDA" || automaton.kind === "pda";

        // For EFA with multiple edges to the same target, combine labels
        if (isEFA && edges.length > 1 && !isPDA) {
          const { state, edge } = edges[0];
          const sourcePos = nodePositions.get(state.id);
          const targetPos = nodePositions.get(edge.to);

          if (!sourcePos || !targetPos) return;

          // Collect all symbols from edges going to the same target
          const symbols = edges
            .map(({ edge }) => {
              const symbol = edge.literal || edge.symbol || "";
              return symbol && symbol !== "ε" ? symbol : null;
            })
            .filter((s): s is string => s !== null && s !== "")
            .sort((a, b) => {
              // Sort: wildcard last, then alphabetically
              if (a === "*") return 1;
              if (b === "*") return -1;
              return a.localeCompare(b);
            });

          if (symbols.length === 0) return;

          // Combine symbols into a single label
          // Show all symbols if 5 or fewer, otherwise show first 4 and "..."
          const combinedLabel =
            symbols.length > 5
              ? `${symbols.slice(0, 4).join(",")},...`
              : symbols.join(",");

          // Use the first edge's properties for styling
          const isEpsilon = edge.type === "epsilon";
          const sourceIsActive = currentActive.includes(state.id);
          const isSelfLoop = state.id === edge.to;
          const sourceLevel = levels.get(state.id) ?? 0;
          const targetLevel = levels.get(edge.to) ?? 0;
          const isBackward = sourceLevel > targetLevel;
          const isSameLevel = sourceLevel === targetLevel;

          let edgeType: "straight" | "smoothstep" | "step" = "smoothstep";
          if (isSelfLoop) {
            edgeType = "smoothstep";
          } else if (isBackward || isSameLevel) {
            edgeType = "smoothstep";
          } else {
            edgeType = "smoothstep";
          }

          flowEdges.push({
            id: `edge-${state.id}-${edge.to}-combined`,
            source: `node-${state.id}`,
            target: `node-${edge.to}`,
            label: combinedLabel,
            type: edgeType,
            animated: sourceIsActive,
            style: {
              stroke: isEpsilon ? "#9ca3af" : "#3b82f6",
              strokeWidth: 2,
              strokeDasharray: isEpsilon ? "5,5" : undefined,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isEpsilon ? "#9ca3af" : "#3b82f6",
              width: 20,
              height: 20,
            },
            labelStyle: {
              fill: isEpsilon ? "#6b7280" : "#1e40af",
              fontWeight: 600,
              fontSize: 12,
            },
            labelBgStyle: {
              fill: "white",
              fillOpacity: 0.95,
              stroke: isEpsilon ? "#9ca3af" : "#3b82f6",
              strokeWidth: 1,
            },
            labelBgPadding: [4, 6],
            labelBgBorderRadius: 4,
          });
        } else {
          // Original logic: create separate edge for each transition
          edges.forEach(({ state, edge, edgeIndex }) => {
            const sourcePos = nodePositions.get(state.id);
            const targetPos = nodePositions.get(edge.to);

            if (!sourcePos || !targetPos) return;

            const isEpsilon = edge.type === "epsilon";
            const isPDA = automaton.kind === "PDA" || automaton.kind === "pda";

            // Build label with PDA operation if available
            let label = "";
            if (isPDA && edge.operation) {
              const symbol = edge.symbol || edge.literal || "";
              const operationIcon =
                edge.operation === "push"
                  ? "⬆"
                  : edge.operation === "pop"
                  ? "⬇"
                  : edge.operation === "ignore"
                  ? "⊘"
                  : "";
              label = symbol ? `${symbol} ${operationIcon}` : operationIcon;
            } else {
              // For EFA and other automata, use literal first, then fall back to symbol
              // This ensures we get the correct symbol from the API response
              const symbol = edge.literal || edge.symbol || "";
              label = isEpsilon ? "ε" : symbol;
            }

            const sourceIsActive = currentActive.includes(state.id);
            const isSelfLoop = state.id === edge.to;
            const sourceLevel = levels.get(state.id) ?? 0;
            const targetLevel = levels.get(edge.to) ?? 0;
            const isBackward = sourceLevel > targetLevel;
            const isSameLevel = sourceLevel === targetLevel;

            // Determine edge type based on relationship
            // Use smoothstep for curves which helps separate overlapping edges
            let edgeType: "straight" | "smoothstep" | "step" = "smoothstep";

            if (isSelfLoop) {
              edgeType = "smoothstep";
            } else if (isBackward || isSameLevel) {
              // Use smoothstep for backward or same-level edges to create curves
              edgeType = "smoothstep";
            } else {
              // Use smoothstep for forward edges too to avoid overlaps
              edgeType = "smoothstep";
            }

            flowEdges.push({
              id: `edge-${state.id}-${edge.to}-${edgeIndex}`,
              source: `node-${state.id}`,
              target: `node-${edge.to}`,
              label,
              type: edgeType,
              animated: sourceIsActive,
              style: {
                stroke: isEpsilon
                  ? "#9ca3af"
                  : isPDA && edge.operation === "pop"
                  ? "#ef4444" // Red for pop
                  : isPDA && edge.operation === "push"
                  ? "#10b981" // Green for push
                  : isPDA && edge.operation === "ignore"
                  ? "#6b7280" // Gray for ignore
                  : "#3b82f6", // Blue for regular transitions
                strokeWidth: 2,
                strokeDasharray: isEpsilon ? "5,5" : undefined,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: isEpsilon
                  ? "#9ca3af"
                  : isPDA && edge.operation === "pop"
                  ? "#ef4444"
                  : isPDA && edge.operation === "push"
                  ? "#10b981"
                  : isPDA && edge.operation === "ignore"
                  ? "#6b7280"
                  : "#3b82f6",
                width: 20,
                height: 20,
              },
              labelStyle: {
                fill: isEpsilon
                  ? "#6b7280"
                  : isPDA && edge.operation === "pop"
                  ? "#dc2626"
                  : isPDA && edge.operation === "push"
                  ? "#059669"
                  : isPDA && edge.operation === "ignore"
                  ? "#4b5563"
                  : "#1e40af",
                fontWeight: 600,
                fontSize: isPDA ? 12 : 13,
              },
              labelBgStyle: {
                fill: "white",
                fillOpacity: 0.95,
                stroke: isEpsilon ? "#9ca3af" : "#3b82f6",
                strokeWidth: 1,
              },
              labelBgPadding: [4, 6],
              labelBgBorderRadius: 4,
            });
          });
        }
      });

      return { nodes: flowNodes, edges: flowEdges };
    },
    []
  );

  useEffect(() => {
    if (!automaton || isPDA) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: flowNodes, edges: flowEdges } = convertAutomatonToFlow(
      automaton,
      currentActiveStates
    );
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [
    automaton,
    currentActiveStates,
    convertAutomatonToFlow,
    isPDA,
    setNodes,
    setEdges,
  ]);

  const handlePlayPause = () => {
    // If we've reached the end, restart from the first state before playing again
    if (
      !isPlaying &&
      statePath.length > 0 &&
      currentStep >= statePath.length - 1
    ) {
      setCurrentStep(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleStepForward = () => {
    setCurrentStep((prev) => (prev < statePath.length - 1 ? prev + 1 : prev));
  };

  const handleReset = () => {
    setCurrentStep(0);
    setIsPlaying(false);
  };

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const stateId = parseInt(node.id.replace("node-", ""));
      onStateClick?.(stateId);
    },
    [onStateClick]
  );

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    // No path to animate or already at the end
    if (statePath.length <= 1 || currentStep >= statePath.length - 1) {
      timer = setTimeout(() => setIsPlaying(false), 0);
    } else {
      timer = setTimeout(() => {
        setCurrentStep((prev) => Math.min(prev + 1, statePath.length - 1));
      }, 1000);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isPlaying, currentStep, statePath.length]);

  // Reset playback whenever a new automaton or path arrives
  useEffect(() => {
    const resetTimer = setTimeout(() => {
      setCurrentStep(0);
      setIsPlaying(false);
    }, 0);

    return () => clearTimeout(resetTimer);
  }, [automaton, statePath]);

  if (!automaton) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        <div>
          <p className="font-medium text-zinc-700 dark:text-zinc-200">
            No automaton data available
          </p>
          <p>Run a simulation to see the state diagram</p>
        </div>
      </div>
    );
  }

  const pdaExamples = [
    {
      example: "(((...)))",
      verdict: "accept",
      description: "Nested helix; dots are unpaired bases",
    },
    {
      example: "..((..)).",
      verdict: "accept",
      description: "Paired stem with flanking unpaired bases",
    },
    {
      example: "(.((.).)).",
      verdict: "accept",
      description: "Mixed nesting; dots ignored",
    },
    {
      example: "(()",
      verdict: "reject",
      description: "Missing closing parenthesis",
    },
    {
      example: "())(",
      verdict: "reject",
      description: "Pairing order broken",
    },
  ];

  return (
    <ReactFlowProvider>
      <div className="space-y-4">
        {isPDA && pdaRules && pdaRules.length > 0 && (
          <div className="rounded-lg border-2 border-purple-200 bg-linear-to-r from-purple-50 to-indigo-50 p-3 sm:p-4 dark:border-purple-900/50 dark:from-purple-950/30 dark:to-indigo-950/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs sm:text-sm font-bold text-purple-900 dark:text-purple-100">
                PDA Rules:
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {pdaRules.map((rule, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 sm:gap-1.5 rounded-md bg-white dark:bg-zinc-800 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold text-purple-800 dark:text-purple-200 border-2 border-purple-300 dark:border-purple-600 shadow-sm"
                >
                  <span className="text-purple-700 dark:text-purple-300 font-bold">
                    Expected:
                  </span>
                  <code className="font-mono text-xs sm:text-sm font-bold text-purple-900 dark:text-purple-100">
                    {rule.expected}
                  </code>
                </span>
              ))}
            </div>
            <div className="mt-2 sm:mt-3 flex flex-wrap gap-2 sm:gap-3 text-[10px] sm:text-xs">
              <div className="flex items-center gap-1 sm:gap-1.5 bg-white/60 dark:bg-zinc-800/60 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-purple-200 dark:border-purple-700">
                <span className="text-green-700 dark:text-green-300 font-bold">
                  ⬆ Push
                </span>
                <span className="text-zinc-400 dark:text-zinc-500">|</span>
                <span className="text-red-700 dark:text-red-300 font-bold">
                  ⬇ Pop
                </span>
                <span className="text-zinc-400 dark:text-zinc-500">|</span>
                <span className="text-zinc-700 dark:text-zinc-300 font-bold">
                  ⊘ Ignore
                </span>
              </div>
            </div>
          </div>
        )}
        {isPDA ? (
          <div className="rounded-lg border-2 border-purple-200 bg-linear-to-br from-purple-50 to-indigo-50 p-4 sm:p-6 dark:border-purple-900/50 dark:from-purple-950/30 dark:to-indigo-950/30">
            <div className="flex flex-col gap-2 sm:gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-purple-500 animate-pulse"></span>
                  <p className="text-sm sm:text-base font-bold text-purple-900 dark:text-purple-100">
                    PDA uses a fixed validation pattern
                  </p>
                </div>
                <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-purple-800 dark:bg-zinc-800 dark:text-purple-200 border border-purple-200 dark:border-purple-700">
                  Dot-bracket guidance
                </span>
              </div>
              <p className="text-xs sm:text-sm text-purple-900/80 dark:text-purple-200/80">
                Validate RNA secondary-structure dot-bracket strings:
                parentheses must be balanced and properly ordered; dots (.) mark
                unpaired bases and are ignored by the stack. Extra closings or
                leftover openings are rejected. Use these examples as the fixed
                reference diagram.
              </p>
              <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
                {pdaExamples.map((item) => (
                  <div
                    key={item.example}
                    className="flex items-center justify-between rounded-lg border border-purple-200 bg-white/80 px-3 py-2.5 shadow-sm dark:border-purple-800 dark:bg-zinc-900"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-sm sm:text-base font-semibold text-purple-900 dark:text-purple-50">
                        {item.example}
                      </span>
                      <span className="text-[11px] sm:text-xs text-purple-700 dark:text-purple-200/80">
                        {item.description}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] sm:text-xs font-bold ${
                        item.verdict === "accept"
                          ? "bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/40 dark:text-green-200 dark:border-green-800"
                          : "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800"
                      }`}
                    >
                      {item.verdict}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          statePath.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-2 sm:p-3 dark:border-zinc-800 dark:bg-zinc-900 gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={handlePlayPause}
                  disabled={statePath.length === 0}
                  className="h-8 sm:h-9 w-8 sm:w-9 p-0 touch-manipulation"
                >
                  {isPlaying ? (
                    <Pause className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  ) : (
                    <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleStepForward}
                  disabled={currentStep >= statePath.length - 1}
                  className="h-8 sm:h-9 w-8 sm:w-9 p-0 touch-manipulation"
                >
                  <SkipForward className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="h-8 sm:h-9 w-8 sm:w-9 p-0 touch-manipulation"
                >
                  <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              </div>
              <div className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                Step {currentStep + 1} of {statePath.length}
              </div>
            </div>
          )
        )}
        {!isPDA && (
          <div className="h-[400px] sm:h-[500px] lg:h-[600px] w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              fitView
              fitViewOptions={{ padding: 0.3, minZoom: 0.5, maxZoom: 1.5 }}
              defaultEdgeOptions={{
                type: "smoothstep",
                animated: false,
              }}
            >
              <Background />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  const stateId = parseInt(node.id.replace("node-", ""));
                  const state = automaton?.states.find((s) => s.id === stateId);
                  if (state?.id === automaton?.accept || state?.accept) {
                    return "#22c55e";
                  }
                  if (state?.id === automaton?.start) {
                    return "#3b82f6";
                  }
                  return "#e5e7eb";
                }}
                maskColor="rgba(0, 0, 0, 0.1)"
              />
            </ReactFlow>
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
}
