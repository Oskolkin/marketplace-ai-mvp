import { cookies } from "next/headers";

import type { AuthResponse } from "@/lib/auth-types";
import { PUBLIC_API_BASE_URL } from "@/lib/env/api-base-url";

export async function getCurrentUserServer(): Promise<AuthResponse | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/auth/me`, {
    method: "GET",
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  return res.json() as Promise<AuthResponse>;
}
