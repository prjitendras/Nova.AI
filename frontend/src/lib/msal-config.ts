/**
 * MSAL Configuration
 * Simplified configuration matching wiki3-frontend approach
 */
import { Configuration, PublicClientApplication, LogLevel } from "@azure/msal-browser";
import { config } from "./config";

const msalConfig: Configuration = {
  auth: {
    clientId: config.auth.clientId,
    authority: `https://login.microsoftonline.com/${config.auth.tenantId}`,
    redirectUri: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    postLogoutRedirectUri: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    navigateToLoginRequestUrl: true,  // Navigate back to original URL after login
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error("[MSAL]", message);
            break;
          case LogLevel.Warning:
            // Suppress warnings in production
            if (process.env.NODE_ENV === "development") {
              console.warn("[MSAL]", message);
            }
            break;
          default:
            break;
        }
      },
      logLevel: LogLevel.Error,
      piiLoggingEnabled: false,
    },
  },
};

// Create MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig);

// Login request - only User.Read (no admin consent required)
// User search will work with People.Read if available, otherwise returns empty
export const loginRequest = {
  scopes: ["User.Read"],
};
