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
import type { Automaton, AutomatonState, AutomatonEdge } from "@/features/simulator/types";

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
          for (const edge of state.edges) {
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

      const maxLevel = Math.max(...Array.from(statesByLevel.keys()));
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

      // Create circular nodes
      automaton.states.forEach((state) => {
        const pos = nodePositions.get(state.id);
        if (!pos) return;

        const isStart = state.id === automaton.start;
        const isAccept = state.id === automaton.accept || state.accept;
        const isActive = currentActive.includes(state.id);

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
      const edgeGroups = new Map<string, Array<{ state: AutomatonState; edge: AutomatonEdge; edgeIndex: number }>>();
      
      automaton.states.forEach((state) => {
        state.edges.forEach((edge, edgeIndex) => {
          const edgeKey = `${state.id}-${edge.to}`;
          if (!edgeGroups.has(edgeKey)) {
            edgeGroups.set(edgeKey, []);
          }
          edgeGroups.get(edgeKey)!.push({ state, edge, edgeIndex });
        });
      });

      edgeGroups.forEach((edges, edgeKey) => {
        edges.forEach(({ state, edge, edgeIndex }, groupIndex) => {
          const sourcePos = nodePositions.get(state.id);
          const targetPos = nodePositions.get(edge.to);

          if (!sourcePos || !targetPos) return;

          const isEpsilon = edge.type === "epsilon";
          const label = isEpsilon ? "ε" : edge.literal || "";
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
              fontSize: 13,
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
      });

      return { nodes: flowNodes, edges: flowEdges };
    },
    []
  );

  useEffect(() => {
    if (automaton) {
      const { nodes: flowNodes, edges: flowEdges } =
        convertAutomatonToFlow(automaton, currentActiveStates);
      setNodes(flowNodes);
      setEdges(flowEdges);
    }
  }, [automaton, currentActiveStates, convertAutomatonToFlow, setNodes, setEdges]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStepForward = () => {
    if (currentStep < statePath.length - 1) {
      setCurrentStep(currentStep + 1);
    }
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
    if (isPlaying && currentStep < statePath.length - 1) {
      const timer = setTimeout(() => {
        setCurrentStep(currentStep + 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (isPlaying && currentStep >= statePath.length - 1) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentStep, statePath.length]);

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

  return (
    <ReactFlowProvider>
      <div className="space-y-4">
        {statePath.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlayPause}
                disabled={statePath.length === 0}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStepForward}
                disabled={currentStep >= statePath.length - 1}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Step {currentStep + 1} of {statePath.length}
            </div>
          </div>
        )}
        <div className="h-[600px] w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
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
      </div>
    </ReactFlowProvider>
  );
}

