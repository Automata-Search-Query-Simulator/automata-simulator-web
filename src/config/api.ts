import axios from "axios";

export const API_BASE_URL = "http://127.0.0.1:5002";
export const SIMULATE_ENDPOINT = "/simulate";
export const DEFAULT_HEADERS = {
  Accept: "application/json",
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: DEFAULT_HEADERS,
  timeout: 30000,
});
