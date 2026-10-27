import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Notice } from "@/components/ui";
import { authRequired, isAuthenticated, passwordConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!authRequired() || (await isAuthenticated())) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">Job Assistant</h1>
        <p className="mt-1 mb-5 text-sm text-zinc-500">Sign in to continue.</p>
        {passwordConfigured() ? (
          <LoginForm />
        ) : (
          <Notice tone="warn">APP_PASSWORD is not set. Set it in the environment and restart the server.</Notice>
        )}
      </div>
    </main>
  );
}
