import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { authRequired, isAuthenticated } from "@/lib/auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <div className="min-h-screen md:flex">
      <Nav mock={env.aiMock} authRequired={authRequired()} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
