"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const ADMIN_ONLY_PREFIX = "/app/admin";

function isAdminRoute(pathname: string): boolean {
  return pathname === ADMIN_ONLY_PREFIX || pathname.startsWith(`${ADMIN_ONLY_PREFIX}/`);
}

type AppAuthRedirectProps = {
  isAdminOnly: boolean;
};

export default function AppAuthRedirect({ isAdminOnly }: AppAuthRedirectProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isAdminOnly || !pathname) {
      return;
    }
    if (!isAdminRoute(pathname)) {
      router.replace("/app/admin");
    }
  }, [isAdminOnly, pathname, router]);

  return null;
}
