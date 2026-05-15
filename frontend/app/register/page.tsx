"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { register } from "@/lib/auth-api";
import { ui } from "@/lib/ui-copy";

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setValidationError("");

    if (!email.trim()) {
      setValidationError("Укажите email");
      return;
    }

    if (password.length < 8) {
      setValidationError("Пароль должен быть не короче 8 символов");
      return;
    }

    if (password !== passwordConfirm) {
      setValidationError("Пароли не совпадают");
      return;
    }

    try {
      setLoading(true);

      await register({
        email,
        password,
        password_confirm: passwordConfirm,
      });

      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось зарегистрироваться");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-semibold">{ui.register}</h1>

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
            placeholder="Минимум 8 символов"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm">Подтверждение пароля</label>
          <input
            className="w-full rounded border px-3 py-2"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
        </div>

        {validationError ? (
          <p className="text-sm text-red-600">{validationError}</p>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? ui.creatingAccount : ui.register}
        </button>
      </form>
    </main>
  );
}
