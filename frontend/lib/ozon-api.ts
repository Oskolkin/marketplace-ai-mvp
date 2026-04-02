import { apiGet, apiPost, apiPut } from "@/lib/api";

export type OzonConnectionDto = {
  id: number;
  seller_account_id: number;
  status: string;
  last_check_at: string | null;
  last_check_result: string | null;
  last_error: string | null;
  has_credentials: boolean;
  client_id_masked: string;
};

export type GetOzonConnectionResponse = {
  connection: OzonConnectionDto | null;
};

export type UpsertOzonConnectionRequest = {
  client_id: string;
  api_key: string;
};

export type OzonCheckResponse = {
  status: string;
  checked_at: string;
  message: string;
  error_code: string | null;
};

export type OzonSyncStartResponse = {
  sync_job: {
    id: number;
    type: string;
    status: string;
  };
};

export type OzonSyncStatusResponse = {
  connection_status: string;
  last_check_at: string | null;
  last_check_result: string | null;
  last_error: string | null;
  initial_sync_status: string | null;
  last_sync_error: string | null;
};

export async function getOzonConnection(): Promise<GetOzonConnectionResponse> {
  return apiGet<GetOzonConnectionResponse>("/api/v1/integrations/ozon/");
}

export async function createOzonConnection(
  payload: UpsertOzonConnectionRequest
): Promise<GetOzonConnectionResponse> {
  return apiPost<GetOzonConnectionResponse>("/api/v1/integrations/ozon/", payload);
}

export async function updateOzonConnection(
  payload: UpsertOzonConnectionRequest
): Promise<GetOzonConnectionResponse> {
  return apiPut<GetOzonConnectionResponse>("/api/v1/integrations/ozon/", payload);
}

export async function checkOzonConnection(): Promise<OzonCheckResponse> {
  return apiPost<OzonCheckResponse>("/api/v1/integrations/ozon/check");
}

export async function startInitialSync(): Promise<OzonSyncStartResponse> {
  return apiPost<OzonSyncStartResponse>("/api/v1/integrations/ozon/initial-sync");
}

export async function getOzonSyncStatus(): Promise<OzonSyncStatusResponse> {
  return apiGet<OzonSyncStatusResponse>("/api/v1/integrations/ozon/status");
}