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
  performance_token_set: boolean;
  performance_status: string;
  performance_last_check_at: string | null;
  performance_last_check_result: string | null;
  performance_last_error: string | null;
};

export type GetOzonConnectionResponse = {
  connection: OzonConnectionDto | null;
};

export type UpsertOzonConnectionRequest = {
  client_id: string;
  api_key: string;
  performance_bearer_token?: string;
};

export type PutOzonPerformanceTokenRequest = {
  performance_bearer_token?: string;
  clear_performance_token?: boolean;
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

export type IngestionSyncJobDto = {
  id: number;
  type: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
};

export type IngestionImportJobDto = {
  id: number;
  domain: string;
  status: string;
  source_cursor: string | null;
  records_received: number;
  records_imported: number;
  records_failed: number;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
};

export type OzonIngestionStatusResponse = {
  connection_status: string;
  last_check_at: string | null;
  last_check_result: string | null;
  last_error: string | null;
  performance_connection_status: string;
  performance_token_set: boolean;
  performance_last_check_at: string | null;
  performance_last_check_result: string | null;
  performance_last_error: string | null;
  current_sync: IngestionSyncJobDto | null;
  last_successful_sync_at: string | null;
  latest_import_jobs: IngestionImportJobDto[];
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

export async function putOzonPerformanceToken(
  payload: PutOzonPerformanceTokenRequest
): Promise<GetOzonConnectionResponse> {
  return apiPut<GetOzonConnectionResponse>(
    "/api/v1/integrations/ozon/performance-token",
    payload
  );
}

export async function checkOzonConnection(): Promise<OzonCheckResponse> {
  return apiPost<OzonCheckResponse>("/api/v1/integrations/ozon/check");
}

export async function checkOzonPerformanceConnection(): Promise<OzonCheckResponse> {
  return apiPost<OzonCheckResponse>("/api/v1/integrations/ozon/check-performance");
}

export async function startInitialSync(): Promise<OzonSyncStartResponse> {
  return apiPost<OzonSyncStartResponse>("/api/v1/integrations/ozon/initial-sync");
}

export async function getOzonIngestionStatus(): Promise<OzonIngestionStatusResponse> {
  return apiGet<OzonIngestionStatusResponse>("/api/v1/integrations/ozon/status");
}