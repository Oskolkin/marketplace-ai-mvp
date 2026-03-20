import { apiGet } from "@/lib/api/client";

type HealthResponse = {
  status: string;
};

export default async function HealthPage() {
  let liveStatus = "unknown";
  let readyStatus = "unknown";
  let errorMessage = "";

  try {
    const live = await apiGet<HealthResponse>("/health/live");
    const ready = await apiGet<HealthResponse>("/health/ready");

    liveStatus = live.status;
    readyStatus = ready.status;
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unknown error";
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">System Health</h1>

        <div className="mt-6 space-y-2">
          <p>
            <span className="font-semibold">Live:</span> {liveStatus}
          </p>
          <p>
            <span className="font-semibold">Ready:</span> {readyStatus}
          </p>
          {errorMessage ? (
            <p className="text-red-600">
              <span className="font-semibold">Error:</span> {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}