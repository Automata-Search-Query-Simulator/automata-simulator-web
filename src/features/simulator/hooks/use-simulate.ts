import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { apiClient, SIMULATE_ENDPOINT, API_BASE_URL } from "@/config/api";
import { SimulationVariables, NormalizedResult, FormValues } from "../types";
import { normalizeResponse, buildPreviewPayload } from "../utils";

export type UseSimulateOptions = {
  onSuccess?: (result: NormalizedResult) => void;
  onError?: (error: string) => void;
};

export type SimulateMutationResult = {
  data: unknown;
  runtimeMs: number;
};

export const useSimulate = (options?: UseSimulateOptions) => {
  const mutation = useMutation<
    SimulateMutationResult,
    unknown,
    SimulationVariables
  >({
    mutationFn: async ({ params, controller }: SimulationVariables) => {
      const startedAt = Date.now();

      // Custom params serializer to handle arrays as repeated query params
      const paramsSerializer = (params: Record<string, unknown>): string => {
        const parts: string[] = [];

        for (const [key, value] of Object.entries(params)) {
          if (Array.isArray(value)) {
            // For arrays, repeat the key for each value
            for (const item of value) {
              parts.push(
                `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`
              );
            }
          } else if (value !== null && value !== undefined) {
            parts.push(
              `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
            );
          }
        }

        return parts.join("&");
      };

      const queryString = paramsSerializer(params);
      const endpointUrl = `${API_BASE_URL}${SIMULATE_ENDPOINT}${
        queryString ? `?${queryString}` : ""
      }`;
      console.log(`[API] GET ${endpointUrl}`);

      try {
        const response = await apiClient.get(SIMULATE_ENDPOINT, {
          params,
          paramsSerializer,
          signal: controller.signal,
        });
        const runtimeMs = Math.round(Date.now() - startedAt);
        console.log(
          `[API] ✓ ${endpointUrl} [${response.status}] (${runtimeMs} ms)`
        );
        return { data: response.data, runtimeMs };
      } catch (error) {
        const runtimeMs = Math.round(Date.now() - startedAt);
        const message = axios.isAxiosError(error)
          ? error.message
          : error instanceof Error
          ? error.message
          : "Unknown error";
        console.error(
          `[API] ✗ ${endpointUrl} (${runtimeMs} ms) -> ${message}`
        );
        throw error;
      }
    },
  });

  const simulate = (
    values: FormValues,
    modeLabel: string,
    controller: AbortController
  ) => {
    const { payload, sequences, secondaryStructures } =
      buildPreviewPayload(values);
    const mismatchBudget = values.mode === "efa" ? values.mismatchBudget : 0;
    const rnaPrimaryEnabled =
      values.mode === "pda" ? values.allowDotBracket : false;

    mutation.mutate(
      {
        params: payload,
        controller,
        contextSequences: sequences,
        modeLabel,
        mismatchBudget,
        rnaPrimaryEnabled,
        secondaryStructures,
      },
      {
        onSuccess: (payloadResult, variables) => {
          const normalized = normalizeResponse(
            payloadResult.data,
            variables.modeLabel,
            variables.contextSequences,
            variables.mismatchBudget,
            payloadResult.runtimeMs,
            {
              rnaPrimaryEnabled: variables.rnaPrimaryEnabled,
              secondaryStructures: variables.secondaryStructures,
            }
          );
          options?.onSuccess?.(normalized);
        },
        onError: (error: unknown) => {
          let errorMessage = "Simulation failed. Review your inputs.";

          if (axios.isCancel(error)) {
            errorMessage = "Request cancelled.";
          } else if (axios.isAxiosError(error)) {
            if (error.code === "ERR_NETWORK") {
              errorMessage =
                "Unable to reach the backend. Verify the server is running on " +
                API_BASE_URL;
            } else {
              errorMessage =
                typeof error.response?.data === "object" &&
                error.response?.data !== null &&
                "message" in error.response.data
                  ? String(error.response.data.message)
                  : error.message ?? errorMessage;
            }
          } else if (error instanceof Error) {
            errorMessage = error.message || errorMessage;
          }

          options?.onError?.(errorMessage);
        },
      }
    );
  };

  return {
    mutation,
    simulate,
    isSubmitting: mutation.isPending,
  };
};
