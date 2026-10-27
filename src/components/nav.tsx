"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/applications", label: "Applications" },
  { href: "/chat", label: "Chat" },
  { href: "/documents", label: "Documents" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ mock, authRequired }: { mock: boolean; authRequired: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="border-b border-zinc-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between px-4 py-3 md:block md:py-5">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Job Assistant
        </Link>
        {mock ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 md:mt-2 md:inline-block dark:bg-amber-950 dark:text-amber-300">
            Mock mode
          </span>
        ) : null}
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
        {links.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm whitespace-nowrap",
                active ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
              )}
            >
              {l.label}
            </Link>
          );
        })}
        <Link
          href="/applications/new"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white hover:bg-indigo-500 md:mt-3"
        >
          + Capture posting
        </Link>
        {authRequired ? (
          <form action={logoutAction} className="md:mt-auto md:pt-6">
            <button type="submit" className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Sign out
            </button>
          </form>
        ) : null}
      </nav>
    </aside>
  );
}
