import { NextResponse } from "next/server";
import { apiError } from "./api-identity";
import {
  resolveStoreFromApiKey,
  type StoreFromApiKey,
} from "./store-api-key";

export async function requireStoreApiKey(
  request: Request,
): Promise<StoreFromApiKey | NextResponse> {
  const store = await resolveStoreFromApiKey(request);
  if (!store) return apiError("Cheie magazin invalidă sau revocată", 401);
  return store;
}

export function isErrorResponse(
  value: StoreFromApiKey | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}
