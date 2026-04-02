export function mapConnectionStatus(status: string | null | undefined): string {
  switch (status) {
    case "draft":
      return "Not connected";
    case "checking":
      return "Checking";
    case "valid":
      return "Connected";
    case "invalid":
      return "Invalid credentials";
    case "sync_pending":
      return "Sync pending";
    case "sync_in_progress":
      return "Sync running";
    case "sync_failed":
      return "Sync failed";
    default:
      return "Unknown";
  }
}

export function mapSyncStatus(status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return "Sync pending";
    case "running":
      return "Sync running";
    case "completed":
      return "Sync completed";
    case "failed":
      return "Sync failed";
    default:
      return "Not started";
  }
}