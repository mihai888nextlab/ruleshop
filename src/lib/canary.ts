import { createHash } from "crypto";

/** Deterministic canary bucket 0–99 for store + subject */
export function canaryBucket(storeId: string, subjectKey: string): number {
  const hash = createHash("sha256")
    .update(`${storeId}:${subjectKey}`)
    .digest("hex");
  return parseInt(hash.slice(0, 8), 16) % 100;
}

export function isInCanary(
  storeId: string,
  subjectKey: string,
  percent: number,
): boolean {
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return canaryBucket(storeId, subjectKey) < percent;
}
