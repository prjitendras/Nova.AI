/**
 * Application Providers
 * Wraps the app with all required context providers
 * Uses MsalAuthenticationTemplate pattern from wiki3-frontend
 */
"use client";

import { ReactNode, useEffect, useState, useCallback, useRef } from "react";
import { MsalProvider, MsalAuthenticationTemplate, useMsal } from "@azure/msal-react";
import { InteractionType, InteractionRequiredAuthError } from "@azure/msal-browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { msalInstance, loginRequest } from "@/lib/msal-config";
import { ThemeProvider } from "./theme-provider";
import { ErrorBoundary } from "./error-boundary";
import { setTokenRefreshFunction } from "@/lib/api-client";

// Create query client with defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

interface ProvidersProps {
  children: ReactNode;
}

// Token refresh interval (5 minutes - tokens typically expire in 1 hour)
const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000;

// Inner component that handles auth - runs after MSAL is ready
function AuthenticatedApp({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Token refresh function
  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (accounts.length === 0) return null;

    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });
      
      if (response.accessToken) {
        sessionStorage.setItem("msal.authToken", response.accessToken);
        return response.accessToken;
      }
      return null;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Token expired, user needs to re-login
        // Clear the stored token
        sessionStorage.removeItem("msal.authToken");
        // Trigger login redirect
        instance.loginRedirect(loginRequest);
      }
      return null;
    }
  }, [instance, accounts]);

  // Set up the token refresh function for API client
  useEffect(() => {
    setTokenRefreshFunction(refreshToken);
  }, [refreshToken]);

  useEffect(() => {
    // Handle redirect promise for auth completion
    instance.handleRedirectPromise()
      .then((response) => {
        if (response) {
          instance.setActiveAccount(response.account);
          if (response.accessToken) {
            sessionStorage.setItem("msal.authToken", response.accessToken);
          }
          
          // Redirect to stored URL after login if available
          const returnUrl = sessionStorage.getItem("msal.returnUrl");
          if (returnUrl && returnUrl !== "/" && typeof window !== "undefined") {
            sessionStorage.removeItem("msal.returnUrl");
            // Use window.location for full navigation to ensure proper routing
            window.location.href = returnUrl;
          }
        }
      })
      .catch(() => {
        // Auth redirect error - silently handled
      });
  }, [instance]);

  // Acquire token silently when accounts change and set up periodic refresh
  useEffect(() => {
    if (accounts.length > 0 && instance.getConfiguration()) {
      // Initial token acquisition
      refreshToken();

      // Set up periodic token refresh
      refreshIntervalRef.current = setInterval(() => {
        refreshToken();
      }, TOKEN_REFRESH_INTERVAL);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [accounts, instance, refreshToken]);

  return <>{children}</>;
}

// Loading component shown during authentication
function LoadingComponent() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mx-auto" />
        <p className="text-slate-300 font-medium">Signing you in...</p>
        <p className="text-slate-500 text-sm">Please wait while we authenticate</p>
      </div>
    </div>
  );
}

// Error component shown if authentication fails
function ErrorComponent({ error }: { error: Error | null }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center space-y-4 p-8">
        <div className="text-red-500 text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-semibold text-white">Authentication Error</h1>
        <p className="text-slate-400 max-w-md">
          {error?.message || "An error occurred during authentication. Please try again."}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// Public routes that don't require authentication
const PUBLIC_ROUTES = ["/admin-setup"];

function isPublicRoute(): boolean {
  if (typeof window === "undefined") return false;
  return PUBLIC_ROUTES.some((route) => window.location.pathname.startsWith(route));
}

// Public app wrapper - no MSAL authentication
function PublicApp({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider delayDuration={300}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
            }}
          />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export function Providers({ children }: ProvidersProps) {
  const [isClient, setIsClient] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  // Only render MSAL on client side
  useEffect(() => {
    setIsClient(true);
    setIsPublic(isPublicRoute());
    
    // Store the current URL so we can redirect back after login
    // Only store if it's not the root or login page
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname + window.location.search;
      if (currentPath && currentPath !== "/" && !currentPath.includes("login")) {
        sessionStorage.setItem("msal.returnUrl", currentPath);
      }
    }
  }, []);

  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  // For public routes, skip MSAL authentication
  if (isPublic) {
    return <PublicApp>{children}</PublicApp>;
  }

  return (
    <MsalProvider instance={msalInstance}>
      <MsalAuthenticationTemplate
        interactionType={InteractionType.Redirect}
        authenticationRequest={loginRequest}
        loadingComponent={LoadingComponent}
        errorComponent={ErrorComponent}
      >
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider delayDuration={300}>
              <ErrorBoundary>
                <AuthenticatedApp>
                  {children}
                </AuthenticatedApp>
              </ErrorBoundary>
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                }}
              />
            </TooltipProvider>
          </ThemeProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </MsalAuthenticationTemplate>
    </MsalProvider>
  );
}
