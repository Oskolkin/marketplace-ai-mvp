"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminMe } from "@/lib/admin-api";
import { logout } from "@/lib/auth-api";

type NavItem =
  | { kind: "link"; href: string; label: string }
  | { kind: "disabled"; label: string; hint: string }
  | { kind: "admin"; href: string; label: string };

const MAIN_NAV: NavItem[] = [
  { kind: "link", href: "/app", label: "MVP Test Home" },
  { kind: "link", href: "/app/dashboard", label: "Dashboard" },
  { kind: "link", href: "/app/integrations/ozon", label: "Ozon Integration" },
  { kind: "link", href: "/app/sync-status", label: "Sync Status" },
  { kind: "link", href: "/app/critical-skus", label: "Critical SKU" },
  { kind: "link", href: "/app/stocks-replenishment", label: "Stocks & Replenishment" },
  { kind: "link", href: "/app/advertising", label: "Advertising" },
  { kind: "link", href: "/app/pricing-constraints", label: "Pricing Constraints" },
  { kind: "link", href: "/app/alerts", label: "Alerts" },
  { kind: "link", href: "/app/recommendations", label: "Recommendations" },
  { kind: "link", href: "/app/chat", label: "AI Chat" },
  { kind: "admin", href: "/app/admin", label: "Admin / Support" },
];

const SECTION_TITLE_RULES: Array<{ prefix: string; title: string }> = [
  { prefix: "/app/dashboard", title: "Dashboard" },
  { prefix: "/app/integrations/ozon", title: "Ozon Integration" },
  { prefix: "/app/sync-status", title: "Sync Status" },
  { prefix: "/app/critical-skus", title: "Critical SKU" },
  { prefix: "/app/stocks-replenishment", title: "Stocks & Replenishment" },
  { prefix: "/app/advertising", title: "Advertising" },
  { prefix: "/app/pricing-constraints", title: "Pricing Constraints" },
  { prefix: "/app/alerts", title: "Alerts" },
  { prefix: "/app/recommendations", title: "Recommendations" },
  { prefix: "/app/chat", title: "AI Chat" },
  { prefix: "/app/account", title: "Seller account" },
  { prefix: "/app/admin", title: "Admin / Support" },
];

function normalizePath(pathname: string | null): string {
  if (!pathname) return "/app";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function sectionTitle(pathname: string | null): string {
  const p = normalizePath(pathname);
  if (p === "/app") {
    return "MVP Test Home";
  }
  for (const { prefix, title } of SECTION_TITLE_RULES) {
    if (prefix === "/app") continue;
    if (p === prefix || p.startsWith(`${prefix}/`)) {
      return title;
    }
  }
  return "App";
}

function isNavActive(pathname: string | null, href: string): boolean {
  const p = normalizePath(pathname);
  if (href === "/app") {
    return p === "/app";
  }
  return p === href || p.startsWith(`${href}/`);
}

const navLinkClass = (active: boolean) =>
  [
    "block rounded-md px-3 py-2 text-sm transition-colors",
    active
      ? "bg-gray-200 font-medium text-gray-900"
      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
  ].join(" ");

type AppShellProps = {
  children: React.ReactNode;
  userEmail: string;
  sellerAccountName: string;
};

export default function AppShell({ children, userEmail, sellerAccountName }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const title = useMemo(() => sectionTitle(pathname), [pathname]);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAdminMe()
      .then((result) => {
        if (!cancelled && result.is_admin) {
          setIsAdmin(true);
        }
      })
      .catch(() => {
        // Forbidden and network errors stay silent; shell must keep working.
      })
      .finally(() => {
        if (!cancelled) {
          setAdminChecked(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // Still navigate away so a broken API does not trap the user in the shell.
    } finally {
      setLoggingOut(false);
      router.push("/login");
      router.refresh();
    }
  }, [router]);

  const userBlock = (
    <div className="flex flex-col gap-1 text-right text-xs text-gray-600 md:text-sm">
      <span className="truncate text-gray-900">{userEmail}</span>
      <span className="truncate">{sellerAccountName}</span>
    </div>
  );

  const renderNavItems = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Primary">
      {MAIN_NAV.map((item) => {
        if (item.kind === "disabled") {
          return (
            <div
              key={item.label}
              className="rounded-md px-3 py-2 text-sm text-gray-400"
              title={item.hint}
            >
              {item.label}
              <span className="mt-0.5 block text-xs text-gray-400">{item.hint}</span>
            </div>
          );
        }
        if (item.kind === "admin") {
          if (!adminChecked || !isAdmin) {
            return null;
          }
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={navLinkClass(active)}
              onClick={() => onNavigate?.()}
            >
              {item.label}
            </Link>
          );
        }
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={navLinkClass(active)}
            onClick={() => onNavigate?.()}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex flex-col border-b border-gray-200 bg-white md:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <h1 className="min-w-0 truncate text-base font-semibold text-gray-900">{title}</h1>
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
            aria-expanded={mobileNavOpen}
            aria-controls="app-mobile-nav"
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            <span className="sr-only">{mobileNavOpen ? "Close menu" : "Open menu"}</span>
            {mobileNavOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.9a1 1 0 0 0 1.41-1.41L13.41 12l4.9-4.89a1 1 0 0 0 0-1.4z"
                />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
              </svg>
            )}
          </button>
        </div>
        {mobileNavOpen ? (
          <div
            id="app-mobile-nav"
            className="max-h-[min(70vh,calc(100dvh-3.5rem))] overflow-y-auto border-t border-gray-100"
          >
            {renderNavItems(() => setMobileNavOpen(false))}
            <div className="space-y-3 border-t border-gray-200 p-3">
              <div className="text-xs text-gray-600">
                <div className="font-medium text-gray-900">{userEmail}</div>
                <div>{sellerAccountName}</div>
              </div>
              <button
                type="button"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
              >
                {loggingOut ? "Signing out…" : "Log out"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="border-b border-gray-200 px-4 py-4">
          <Link href="/app" className="text-sm font-semibold text-gray-900 hover:text-gray-700">
            Marketplace AI
          </Link>
          <p className="mt-1 text-xs text-gray-500">MVP</p>
        </div>
        <div className="flex-1 overflow-y-auto">{renderNavItems()}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop header */}
        <header className="hidden h-14 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 md:flex">
          <h1 className="truncate text-lg font-semibold text-gray-900">{title}</h1>
          <div className="flex shrink-0 items-center gap-4">
            {userBlock}
            <button
              type="button"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
            >
              {loggingOut ? "Signing out…" : "Log out"}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
