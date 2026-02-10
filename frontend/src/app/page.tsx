/**
 * Landing Page
 * Clean, professional design with EXL branding
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { Workflow, Sparkles, Shield, Zap, ArrowRight, CheckCircle, Users, Clock, BarChart3, GitBranch, Mail, Bot, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginRequest } from "@/lib/msal-config";
import { EXLLogo } from "@/components/exl-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LandingPage() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const { instance } = useMsal();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Only redirect to dashboard if no return URL is stored
    // This prevents overriding the intended destination from email links
    if (isAuthenticated) {
      const returnUrl = sessionStorage.getItem("msal.returnUrl");
      if (returnUrl && returnUrl !== "/") {
        sessionStorage.removeItem("msal.returnUrl");
        router.replace(returnUrl);
      } else {
        router.replace("/dashboard");
      }
    }
  }, [isAuthenticated, router]);

  const handleSignIn = () => instance.loginRedirect(loginRequest);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <EXLLogo size="xl" variant="full" />
          <div className="h-1 w-24 bg-muted rounded-full overflow-hidden">
            <div className="h-full w-1/2 bg-primary rounded-full animate-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <EXLLogo size="lg" variant="full" />
            <div className="hidden md:flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">|</span>
              <span className="font-medium ml-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">NOVA.ai Workflow</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button onClick={handleSignIn} className="btn-primary rounded-lg px-5">
              Sign In <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-fade-in">
              <Sparkles className="h-4 w-4" />
              AI-Powered Workflow Automation
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 animate-fade-in" style={{ animationDelay: "50ms" }}>
              Enterprise workflows,{" "}
              <span className="gradient-text">simplified</span>
            </h1>

            {/* Description */}
            <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed animate-fade-in" style={{ animationDelay: "100ms" }}>
              Design, automate, and manage business workflows with AI assistance. 
              From approvals to complex multi-step processes—all in one platform.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in" style={{ animationDelay: "150ms" }}>
              <Button size="lg" onClick={handleSignIn} className="btn-premium rounded-lg px-8 h-12 text-base">
                Get Started <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-lg px-8 h-12 text-base">
                <Bot className="h-5 w-5 mr-2" /> Watch Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { 
                icon: Sparkles, 
                title: "AI Generation", 
                desc: "Describe your workflow in plain English and let AI create it for you.",
                color: "bg-orange-500"
              },
              { 
                icon: GitBranch, 
                title: "Visual Designer", 
                desc: "Intuitive drag-and-drop builder with real-time preview and validation.",
                color: "bg-blue-500"
              },
              { 
                icon: Zap, 
                title: "Smart Automation", 
                desc: "Auto-assign tasks, send notifications, and handle escalations.",
                color: "bg-emerald-500"
              },
            ].map((feature, i) => (
              <div 
                key={feature.title} 
                className="bg-card border rounded-xl p-6 card-hover animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={`w-10 h-10 ${feature.color} rounded-lg flex items-center justify-center mb-4`}>
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { icon: CheckCircle, value: "10K+", label: "Workflows Created" },
              { icon: Users, value: "500+", label: "Active Users" },
              { icon: Clock, value: "75%", label: "Time Saved" },
              { icon: BarChart3, value: "92%", label: "Automation Rate" },
            ].map((stat, i) => (
              <div key={stat.label} className="text-center animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                <stat.icon className="h-5 w-5 mx-auto mb-2 text-primary" />
                <div className="text-3xl font-bold mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-4">Built for Enterprise</h2>
              <p className="text-muted-foreground mb-6">
                Security, compliance, and audit trails built-in. Designed for organizations that need reliability at scale.
              </p>
              <div className="space-y-3">
                {[
                  { icon: Shield, text: "Azure AD SSO & Role-Based Access Control" },
                  { icon: Mail, text: "Email Notifications via Microsoft Graph" },
                  { icon: Users, text: "Active Directory Integration" },
                  { icon: GitBranch, text: "Version Control & Complete Audit Trail" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card border">
                    <div className="p-2 rounded-md bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border rounded-xl p-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <Workflow className="h-4 w-4" />
                Sample Workflow
              </div>
              <div className="space-y-3">
                {["Submit Request", "Manager Approval", "IT Setup", "Complete"].map((step, i) => (
                  <div 
                    key={step} 
                    className={`flex items-center gap-3 p-3 rounded-lg ${i === 1 ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-muted/50"}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i <= 1 ? "bg-emerald-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"}`}>
                      {i < 1 ? <CheckCircle className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className={`text-sm ${i === 1 ? "font-medium text-emerald-600 dark:text-emerald-400" : ""}`}>{step}</span>
                    {i === 1 && (
                      <span className="ml-auto text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">Active</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to streamline your workflows?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join thousands of organizations using NOVA.ai Workflow to automate their business processes.
          </p>
          <Button size="lg" onClick={handleSignIn} className="btn-premium rounded-lg px-8 h-12 text-base">
            Get Started Now <ChevronRight className="h-5 w-5 ml-1" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <EXLLogo size="sm" variant="full" />
            <span className="text-sm text-muted-foreground">NOVA.ai Workflow</span>
          </div>
          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} EXL Service. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
