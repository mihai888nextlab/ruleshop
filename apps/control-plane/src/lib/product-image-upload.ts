import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * Persists an uploaded product image under `public/uploads/{storeSlug}/`
 * and returns the public path stored on the product row.
 */
export async function saveProductImage(
  storeSlug: string,
  file: File,
): Promise<string> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new Error("Folosește JPEG, PNG, WebP sau GIF.");
  }
  if (file.size <= 0) {
    throw new Error("Fișierul de imagine este gol.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Imaginea trebuie să aibă cel mult 5 MB.");
  }

  const safeStore = storeSlug.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
  if (!safeStore) throw new Error("Slug magazin invalid");

  const dir = path.join(process.cwd(), "public", "uploads", safeStore);
  await mkdir(dir, { recursive: true });

  const name = `${Date.now()}-${randomBytes(4).toString("hex")}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, name), buffer);

  return `/uploads/${safeStore}/${name}`;
}
