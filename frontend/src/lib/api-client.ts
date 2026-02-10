/**
 * API Client
 * Axios-based HTTP client with auth token injection and auto-refresh
 */
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";
import { config } from "./config";

// Generate correlation ID for request tracing
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Token refresh function reference (will be set by providers.tsx)
let tokenRefreshFn: (() => Promise<string | null>) | null = null;

export function setTokenRefreshFunction(fn: () => Promise<string | null>) {
  tokenRefreshFn = fn;
}

// Create axios instance
const axiosInstance: AxiosInstance = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - add auth token and correlation ID
axiosInstance.interceptors.request.use(
  (reqConfig) => {
    // Get token from session storage (set by MSAL)
    if (typeof window !== "undefined") {
      const token = sessionStorage.getItem("msal.authToken");
      if (token) {
        reqConfig.headers.Authorization = `Bearer ${token}`;
      }
    }

    // Add correlation ID
    reqConfig.headers["X-Correlation-ID"] = generateCorrelationId();

    return reqConfig;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Flag to prevent multiple simultaneous token refresh attempts
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
}

// Response interceptor - handle errors and token refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 - token expired, try to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Wait for the token refresh to complete
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token: string) => {
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(axiosInstance(originalRequest));
            } else {
              reject(error);
            }
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        if (tokenRefreshFn) {
          const newToken = await tokenRefreshFn();
          if (newToken) {
            sessionStorage.setItem("msal.authToken", newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            onTokenRefreshed(newToken);
            isRefreshing = false;
            return axiosInstance(originalRequest);
          }
        }
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError);
      }

      isRefreshing = false;
      onTokenRefreshed("");
      console.warn("Unauthorized - token refresh failed, user needs to re-login");
    }

    // Handle 403 - forbidden
    if (error.response?.status === 403) {
      console.warn("Forbidden - insufficient permissions");
    }

    return Promise.reject(error);
  }
);

// Helper to filter out undefined/null values from params
function cleanParams(params?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

// API client wrapper with typed methods
export const apiClient = {
  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const response = await axiosInstance.get<T>(url, { params: cleanParams(params) });
    return response.data;
  },

  async post<T>(url: string, data?: unknown): Promise<T> {
    const response = await axiosInstance.post<T>(url, data);
    return response.data;
  },

  async put<T>(url: string, data?: unknown): Promise<T> {
    const response = await axiosInstance.put<T>(url, data);
    return response.data;
  },

  async patch<T>(url: string, data?: unknown): Promise<T> {
    const response = await axiosInstance.patch<T>(url, data);
    return response.data;
  },

  async delete<T>(url: string): Promise<T> {
    const response = await axiosInstance.delete<T>(url);
    return response.data;
  },

  // For file uploads
  async upload<T>(url: string, formData: FormData): Promise<T> {
    const response = await axiosInstance.post<T>(url, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },
};

// Custom API Error type
export class ApiError extends Error {
  status?: number;
  data?: unknown;
  
  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export default apiClient;
