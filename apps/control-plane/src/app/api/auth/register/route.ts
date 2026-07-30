import { NextResponse } from "next/server";

/**
 * Staff signup is store provisioning, not a bare account.
 * Use POST via the /register page (openStoreAction) instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Înregistrarea creează un magazin. Folosește pagina /register (Deschide un magazin).",
    },
    { status: 410 },
  );
}
