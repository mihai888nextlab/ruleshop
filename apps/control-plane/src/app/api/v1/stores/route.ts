import { NextResponse } from "next/server";
import { storeListResponseSchema } from "@ruleshop/contracts";
import { prisma } from "@/lib/prisma";

/**
 * Public store directory for the storefront's landing page.
 *
 * Returns identity only. Operational state (kill switches, deployment
 * versions, rule contents) stays inside the control plane.
 */
export async function GET() {
  const stores = await prisma.store.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(storeListResponseSchema.parse({ stores }));
}
