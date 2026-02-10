/**
 * Bootstrap Admin Setup Page
 * 
 * This is a standalone page (outside the authenticated layout) for initial admin setup.
 * Uses hardcoded credentials: admin / Admin@123exl
 * Only accessible when no super admin exists.
 */
"use client";

import { useState, useEffect } from "react";
import { useBootstrapLogin, useSetupSuperAdmin, useSetupStatus } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2, CheckCircle, Sparkles, Lock, User, KeyRound, UserPlus, Mail, AlertTriangle } from "lucide-react";

type SetupStep = "login" | "assign" | "complete";

export default function AdminSetupPage() {
  const { data: setupStatus, isLoading: statusLoading, error: statusError, refetch: refetchStatus } = useSetupStatus();
  const bootstrapLoginMutation = useBootstrapLogin();
  const setupMutation = useSetupSuperAdmin();
  
  // Step management
  const [step, setStep] = useState<SetupStep>("login");
  
  // Login form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  
  // Bootstrap token (stored temporarily)
  const [bootstrapToken, setBootstrapToken] = useState<string | null>(null);
  
  // Super admin assignment form
  const [adminEmail, setAdminEmail] = useState("");
  const [setupError, setSetupError] = useState("");

  // Redirect if super admin already exists
  useEffect(() => {
    if (!statusLoading && setupStatus && !setupStatus.requires_setup) {
      // Use window.location for full page reload to switch to MSAL context
      window.location.href = "/";
    }
  }, [statusLoading, setupStatus]);

  const handleBootstrapLogin = async () => {
    setLoginError("");
    
    if (!username || !password) {
      setLoginError("Please enter both username and password");
      return;
    }
    
    try {
      const result = await bootstrapLoginMutation.mutateAsync({ username, password });
      
      if (result.success && result.token) {
        setBootstrapToken(result.token);
        setStep("assign");
      } else {
        setLoginError(result.message || "Login failed");
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    }
  };

  const handleSetupSuperAdmin = async () => {
    setSetupError("");
    
    if (!adminEmail) {
      setSetupError("Please enter the email address");
      return;
    }
    
    // Basic email validation
    if (!adminEmail.includes("@")) {
      setSetupError("Please enter a valid email address");
      return;
    }
    
    if (!bootstrapToken) {
      setSetupError("Session expired. Please login again.");
      setStep("login");
      return;
    }
    
    try {
      // Use email as display name for now - will be updated when user logs in via AD
      const displayName = adminEmail.split("@")[0].replace(/[._-]/g, " ");
      
      await setupMutation.mutateAsync({
        email: adminEmail,
        display_name: displayName,
        bootstrapToken,
      });
      
      setStep("complete");
      
      // Refetch status
      await refetchStatus();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Setup failed");
    }
  };

  // Loading state
  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
          <p className="text-white/70">Checking system status...</p>
        </div>
      </div>
    );
  }

  // Error state - backend not available
  if (statusError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <Card className="max-w-md w-full border-0 shadow-2xl bg-white/10 backdrop-blur-xl">
          <CardHeader className="text-center">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-white">Connection Error</CardTitle>
            <CardDescription className="text-white/70">
              Unable to connect to the backend server. Please ensure the server is running.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-200 text-sm">
              {statusError instanceof Error ? statusError.message : "Failed to connect"}
            </div>
            <Button
              onClick={() => refetchStatus()}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              <Loader2 className="h-4 w-4 mr-2" />
              Retry Connection
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already set up
  if (!setupStatus?.requires_setup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <Card className="max-w-md w-full border-0 shadow-2xl bg-white/10 backdrop-blur-xl text-white">
          <CardHeader className="text-center">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-white">Already Configured</CardTitle>
            <CardDescription className="text-white/70">
              A super admin has already been set up. Please use Azure AD to login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                // Use window.location for full page reload to switch to MSAL context
                window.location.href = "/";
              }}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              Go to Application
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg w-full">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className={`h-3 w-3 rounded-full transition-colors ${step === "login" ? "bg-amber-400" : "bg-white/30"}`} />
            <div className={`h-0.5 w-8 transition-colors ${step !== "login" ? "bg-amber-400" : "bg-white/30"}`} />
            <div className={`h-3 w-3 rounded-full transition-colors ${step === "assign" ? "bg-amber-400" : step === "complete" ? "bg-emerald-400" : "bg-white/30"}`} />
            <div className={`h-0.5 w-8 transition-colors ${step === "complete" ? "bg-emerald-400" : "bg-white/30"}`} />
            <div className={`h-3 w-3 rounded-full transition-colors ${step === "complete" ? "bg-emerald-400" : "bg-white/30"}`} />
          </div>

          {/* Step 1: Bootstrap Login */}
          {step === "login" && (
            <>
              <div className="text-center mb-8">
                <div className="relative inline-block">
                  <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center shadow-2xl shadow-orange-500/30 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                    <Lock className="h-10 w-10 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center">
                    <Sparkles className="h-3 w-3 text-white" />
                  </div>
                </div>
                <h1 className="text-3xl font-bold text-white mt-6 mb-2">
                  Admin Setup
                </h1>
                <p className="text-white/60 text-lg">
                  Enter the bootstrap credentials to begin setup
                </p>
              </div>

              {/* Credentials hint */}
              <div className="bg-amber-500/20 border border-amber-500/30 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <KeyRound className="h-5 w-5 text-amber-400 mt-0.5" />
                  <div>
                    <p className="text-amber-200 text-sm font-medium">Default Credentials</p>
                    <p className="text-amber-100/70 text-xs mt-1">
                      Username: <code className="bg-white/10 px-1 rounded">admin</code><br />
                      Password: <code className="bg-white/10 px-1 rounded">Admin@123exl</code>
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-white/80">Username</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="Enter username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40 pl-10 h-12 rounded-xl"
                      onKeyDown={(e) => e.key === "Enter" && handleBootstrapLogin()}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white/80">Password</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40 pl-10 h-12 rounded-xl"
                      onKeyDown={(e) => e.key === "Enter" && handleBootstrapLogin()}
                    />
                  </div>
                </div>
              </div>

              {loginError && (
                <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-200 text-sm">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  {loginError}
                </div>
              )}

              <Button
                onClick={handleBootstrapLogin}
                disabled={bootstrapLoginMutation.isPending}
                className="w-full h-14 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-600 hover:via-orange-600 hover:to-rose-600 text-white font-semibold text-lg rounded-xl shadow-lg shadow-orange-500/25 hover:shadow-xl transition-all"
              >
                {bootstrapLoginMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Lock className="h-5 w-5 mr-2" />
                    Login to Setup
                  </>
                )}
              </Button>
            </>
          )}

          {/* Step 2: Assign Super Admin */}
          {step === "assign" && (
            <>
              <div className="text-center mb-8">
                <div className="relative inline-block">
                  <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-400 via-indigo-500 to-purple-500 flex items-center justify-center shadow-2xl shadow-indigo-500/30 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                    <UserPlus className="h-10 w-10 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-400 flex items-center justify-center">
                    <CheckCircle className="h-3 w-3 text-white" />
                  </div>
                </div>
                <h1 className="text-3xl font-bold text-white mt-6 mb-2">
                  Assign Super Admin
                </h1>
                <p className="text-white/60 text-lg">
                  Enter the Azure AD user&apos;s email address
                </p>
              </div>

              {/* Info */}
              <div className="bg-blue-500/20 border border-blue-500/30 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-blue-400 mt-0.5" />
                  <div>
                    <p className="text-blue-200 text-sm font-medium">Important</p>
                    <p className="text-blue-100/70 text-xs mt-1">
                      This user will have full admin access. They can grant Designer and Admin access to other users.
                      After this setup, the bootstrap login will be disabled.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="space-y-2">
                  <Label htmlFor="admin-email" className="text-white/80">
                    Azure AD Email Address <span className="text-red-400">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                    <Input
                      id="admin-email"
                      type="email"
                      placeholder="user@company.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/40 pl-10 h-12 rounded-xl"
                    />
                  </div>
                  <p className="text-white/40 text-xs">
                    The display name and other details will be automatically fetched from Azure AD when this user logs in.
                  </p>
                </div>
              </div>

              {setupError && (
                <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-200 text-sm">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  {setupError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={() => setStep("login")}
                  variant="outline"
                  className="flex-1 h-12 bg-white/5 border-white/20 text-white hover:bg-white/10 rounded-xl"
                >
                  Back
                </Button>
                <Button
                  onClick={handleSetupSuperAdmin}
                  disabled={setupMutation.isPending}
                  className="flex-[2] h-12 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 hover:from-blue-600 hover:via-indigo-600 hover:to-purple-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl transition-all"
                >
                  {setupMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Shield className="h-5 w-5 mr-2" />
                      Create Super Admin
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Step 3: Complete */}
          {step === "complete" && (
            <>
              <div className="text-center mb-8">
                <div className="relative inline-block">
                  <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 flex items-center justify-center shadow-2xl shadow-teal-500/30">
                    <CheckCircle className="h-10 w-10 text-white" />
                  </div>
                </div>
                <h1 className="text-3xl font-bold text-white mt-6 mb-2">
                  Setup Complete!
                </h1>
                <p className="text-white/60 text-lg">
                  The super admin has been configured successfully
                </p>
              </div>

              {/* Success info */}
              <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl p-4 mb-6">
                <div className="space-y-2 text-emerald-100/90 text-sm">
                  <p>✓ Super Admin: <strong>{adminEmail}</strong></p>
                  <p>✓ Bootstrap login has been disabled</p>
                  <p>✓ Azure AD authentication is now active</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-white/60 text-sm text-center">
                  The super admin can now login via Azure AD and access the Admin Console.
                </p>
                
                <Button
                  onClick={() => {
                    // Use window.location for full page reload to switch to MSAL context
                    window.location.href = "/";
                  }}
                  className="w-full h-14 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold text-lg rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-xl transition-all"
                >
                  Go to Application
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
