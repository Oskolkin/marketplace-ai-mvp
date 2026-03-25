"use client";

export default function DevSentryPage() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">Sentry Test</h1>
        <button
          className="mt-6 rounded bg-black px-4 py-2 text-white"
          onClick={() => {
            throw new Error("Frontend Sentry test error");
          }}
        >
          Throw frontend error
        </button>
      </div>
    </main>
  );
}