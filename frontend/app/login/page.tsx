"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth-api";
import { getPostLoginPath } from "@/lib/auth-redirect";
import { ui } from "@/lib/ui-copy";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    try {
      setLoading(true);

      const auth = await login({
        email,
        password,
      });

      const path = getPostLoginPath(auth);
      if (!path) {
        setError("Для этого пользователя нужен аккаунт продавца");
        return;
      }

      router.push(path);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-semibold">{ui.login}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm">{ui.email}</label>
          <input
            className="w-full rounded border px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm">{ui.password}</label>
          <input
            className="w-full rounded border px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? ui.signingIn : ui.login}
        </button>
      </form>
    </main>
  );
}
