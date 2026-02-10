/**
 * Authentication Hook
 * Fetches actual user roles from backend /admin/my-access endpoint
 */
"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useMsal, useAccount, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus, InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "@/lib/msal-config";
import { apiClient } from "@/lib/api-client";

export interface User {
  aad_id: string;
  email: string;
  display_name: string;
  roles: string[];
}

interface UserAccessResponse {
  email: string;
  has_designer_access: boolean;
  has_manager_access: boolean;
  has_agent_access: boolean;
  is_admin: boolean;
  admin_role: string | null;
}

export function useAuth() {
  const { instance, accounts, inProgress } = useMsal();
  const account = useAccount(accounts[0] || {});
  const msalAuthenticated = useIsAuthenticated();
  const [user, setUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const rolesFetchedRef = useRef(false);

  // Compute isLoading based on MSAL state
  const isLoading = inProgress !== InteractionStatus.None || !isInitialized;
  
  // Compute isAuthenticated
  const isAuthenticated = msalAuthenticated && !!account && isInitialized;

  // Initialize user data once when account is available
  useEffect(() => {
    // Wait for MSAL to finish any interactions
    if (inProgress !== InteractionStatus.None) {
      return;
    }

    if (msalAuthenticated && account) {
      // First set basic user info with just requester role (everyone has this)
      const basicUser: User = {
        aad_id: account.localAccountId || "",
        email: account.username || "",
        display_name: account.name || account.username || "",
        roles: ["requester"], // Default - everyone is a requester
      };
      setUser(basicUser);
      setIsInitialized(true);
      
      // Then fetch actual roles from backend (non-blocking)
      if (!rolesFetchedRef.current) {
        rolesFetchedRef.current = true;
        fetchUserRoles(basicUser);
      }
    } else {
      setUser(null);
      setIsInitialized(true);
      rolesFetchedRef.current = false;
    }
  }, [msalAuthenticated, account, inProgress]);
  
  // Fetch actual user roles from backend
  const fetchUserRoles = async (basicUser: User) => {
    try {
      const accessData = await apiClient.get<UserAccessResponse>("/admin/my-access");
      
      // Build roles array based on access
      const roles: string[] = ["requester"]; // Everyone is a requester
      
      if (accessData?.has_designer_access) roles.push("designer");
      if (accessData?.has_manager_access) roles.push("manager");
      if (accessData?.has_agent_access) roles.push("agent");
      if (accessData?.is_admin) roles.push("admin");
      
      // Update user with actual roles
      setUser({
        ...basicUser,
        roles,
      });
    } catch (error) {
      // If fetch fails, keep just requester role (safe default)
      console.error("Failed to fetch user roles:", error);
    }
  };

  // Get access token - callable function
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!account) return null;

    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: account,
      });
      
      // Store in session storage
      if (response.accessToken) {
        sessionStorage.setItem("msal.authToken", response.accessToken);
      }
      
      return response.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Token expired, user needs to re-login
        // Don't trigger automatic redirect here - let the user click login
        return null;
      }
      return null;
    }
  }, [instance, account]);

  // Login function
  const login = useCallback(async () => {
    try {
      await instance.loginRedirect(loginRequest);
    } catch {
      // Login error - silently handled
    }
  }, [instance]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      sessionStorage.removeItem("msal.authToken");
      await instance.logoutRedirect();
    } catch {
      // Logout error - silently handled
    }
  }, [instance]);

  // Check if user has a specific role
  const hasRole = useCallback((role: string) => {
    if (!user) return false;
    return user.roles.includes(role);
  }, [user]);

  // Get roles array
  const roles = useMemo(() => user?.roles || [], [user]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    getAccessToken,
    hasRole,
    roles,
  };
}
