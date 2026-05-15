"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminMe } from "@/lib/admin-api";
import { logout } from "@/lib/auth-api";
import { nav, ui } from "@/lib/ui-copy";

type NavItem =
  | { kind: "link"; href: string; label: string }
  | { kind: "disabled"; label: string; hint: string };

const SELLER_NAV: NavItem[] = [
  { kind: "link", href: "/app", label: nav.mvpHome },
  { kind: "link", href: "/app/dashboard", label: nav.dashboard },
  { kind: "link", href: "/app/integrations/ozon", label: nav.ozonIntegration },
  { kind: "link", href: "/app/sync-status", label: nav.syncStatus },
  { kind: "link", href: "/app/critical-skus", label: nav.criticalSkus },
  { kind: "link", href: "/app/stocks-replenishment", label: nav.stocksReplenishment },
  { kind: "link", href: "/app/advertising", label: nav.advertising },
  { kind: "link", href: "/app/pricing-constraints", label: nav.pricingConstraints },
  { kind: "link", href: "/app/alerts", label: nav.alerts },
  { kind: "link", href: "/app/recommendations", label: nav.recommendations },
  { kind: "link", href: "/app/chat", label: nav.aiChat },
];

const ADMIN_ONLY_NAV: NavItem[] = [
  { kind: "link", href: "/app/admin", label: nav.adminSupport },
];

const SECTION_TITLE_RULES: Array<{ prefix: string; title: string }> = [
  { prefix: "/app/dashboard", title: nav.dashboard },
  { prefix: "/app/integrations/ozon", title: nav.ozonIntegration },
  { prefix: "/app/sync-status", title: nav.syncStatus },
  { prefix: "/app/critical-skus", title: nav.criticalSkus },
  { prefix: "/app/stocks-replenishment", title: nav.stocksReplenishment },
  { prefix: "/app/advertising", title: nav.advertising },
  { prefix: "/app/pricing-constraints", title: nav.pricingConstraints },
  { prefix: "/app/alerts", title: nav.alerts },
  { prefix: "/app/recommendations", title: nav.recommendations },
  { prefix: "/app/chat", title: nav.aiChat },
  { prefix: "/app/account", title: nav.sellerAccount },
  { prefix: "/app/admin", title: nav.adminSupport },
];

function normalizePath(pathname: string | null): string {
  if (!pathname) return "/app";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function sectionTitle(pathname: string | null, isAdminOnly: boolean): string {
  const p = normalizePath(pathname);
  if (isAdminOnly) {
    return nav.adminSupport;
  }
  if (p === "/app") {
    return nav.mvpHome;
  }
  for (const { prefix, title } of SECTION_TITLE_RULES) {
    if (prefix === "/app") continue;
    if (p === prefix || p.startsWith(`${prefix}/`)) {
      return title;
    }
  }
  return ui.marketplaceAI;
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
  sellerAccountName: string | null;
  isAdminOnly: boolean;
  isAdmin: boolean;
};

export default function AppShell({
  children,
  userEmail,
  sellerAccountName,
  isAdminOnly,
  isAdmin: isAdminFromAuth,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const title = useMemo(() => sectionTitle(pathname, isAdminOnly), [pathname, isAdminOnly]);
  const homeHref = isAdminOnly ? "/app/admin" : "/app";
  const accountLabel = isAdminOnly ? nav.adminSupport : (sellerAccountName ?? "");

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showAdminNav, setShowAdminNav] = useState(isAdminFromAuth);
  const [adminChecked, setAdminChecked] = useState(isAdminOnly || isAdminFromAuth);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (isAdminOnly || isAdminFromAuth) {
      return;
    }

    let cancelled = false;
    void getAdminMe()
      .then((result) => {
        if (!cancelled && result.is_admin) {
          setShowAdminNav(true);
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
  }, [isAdminOnly, isAdminFromAuth]);

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

  const navItems = useMemo(() => {
    if (isAdminOnly) {
      return ADMIN_ONLY_NAV;
    }
    const items = [...SELLER_NAV];
    if (showAdminNav) {
      items.push({ kind: "link", href: "/app/admin", label: nav.adminSupport });
    }
    return items;
  }, [isAdminOnly, showAdminNav]);

  const userBlock = (
    <div className="flex flex-col gap-1 text-right text-xs text-gray-600 md:text-sm">
      <span className="truncate text-gray-900">{userEmail}</span>
      <span className="truncate">{accountLabel}</span>
    </div>
  );

  const renderNavItems = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-0.5 p-3" aria-label={ui.primaryNav}>
      {navItems.map((item) => {
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
        if (item.href === "/app/admin" && !isAdminOnly && (!adminChecked || !showAdminNav)) {
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
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
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
            <span className="sr-only">{mobileNavOpen ? ui.closeMenu : ui.openMenu}</span>
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
                <div>{accountLabel}</div>
              </div>
              <button
                type="button"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
              >
                {loggingOut ? ui.signingOut : ui.logout}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="border-b border-gray-200 px-4 py-4">
          <Link href={homeHref} className="text-sm font-semibold text-gray-900 hover:text-gray-700">
            {ui.marketplaceAI}
          </Link>
          <p className="mt-1 text-xs text-gray-500">{isAdminOnly ? ui.admin : ui.mvp}</p>
        </div>
        <div className="flex-1 overflow-y-auto">{renderNavItems()}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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
              {loggingOut ? ui.signingOut : ui.logout}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
