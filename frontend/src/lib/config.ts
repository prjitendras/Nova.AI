/**
 * Application Configuration
 * Environment-based configuration for the frontend
 * Simplified to match wiki3-frontend approach
 */

export const config = {
  // API Configuration
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api/v1",
  
  // Azure AD (Entra) Configuration - simplified
  auth: {
    clientId: process.env.NEXT_PUBLIC_AAD_CLIENT_ID || "",
    tenantId: process.env.NEXT_PUBLIC_AAD_TENANT_ID || "",
  },
  
  // App Settings
  app: {
    name: "AI OPS Workflow",
    description: "Enterprise Workflow & Ticketing Platform",
    version: "1.0.0",
  },
  
  // Feature Flags
  features: {
    aiWorkflowGeneration: true,
    darkMode: true,
    notifications: true,
  },
  
  // File Upload
  upload: {
    maxSizeMB: 50,
    allowedTypes: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "text/csv",
    ],
  },
  
  // Polling intervals (ms)
  polling: {
    tickets: 30000,
    notifications: 60000,
  },
} as const;

export type Config = typeof config;
