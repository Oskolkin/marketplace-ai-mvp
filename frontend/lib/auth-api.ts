import { apiGet, apiPost } from "@/lib/api";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from "@/lib/auth-types";

export async function register(payload: RegisterRequest): Promise<AuthResponse> {
  return apiPost<AuthResponse>("/api/v1/auth/register", payload);
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  return apiPost<AuthResponse>("/api/v1/auth/login", payload);
}

export async function me(): Promise<AuthResponse> {
  return apiGet<AuthResponse>("/api/v1/auth/me");
}

export async function logout(): Promise<{ status: string }> {
  return apiPost<{ status: string }>("/api/v1/auth/logout");
}