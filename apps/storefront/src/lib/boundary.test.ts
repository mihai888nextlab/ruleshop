import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The storefront's value as evidence rests on one claim: it cannot reach the
 * database and cannot evaluate rules itself, so every price, shipping option,
 * fraud verdict and theme it shows came from the decisioning API.
 *
 * These tests fail if that claim ever stops being true — a dependency someone
 * adds "just to check something quickly" breaks the build instead of quietly
 * hollowing out the architecture.
 */

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("storefront / control-plane boundary", () => {
  const manifest = JSON.parse(
    readFileSync(join(appRoot, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const allDeps = Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  });

  it("declares no database driver or ORM", () => {
    const forbidden = [
      "@prisma/client",
      "prisma",
      "pg",
      "postgres",
      "mysql2",
      "sqlite3",
      "better-sqlite3",
      "drizzle-orm",
      "typeorm",
      "knex",
      "mongoose",
    ];
    const found = allDeps.filter((dep) => forbidden.includes(dep));
    expect(found, `storefront must not depend on: ${found.join(", ")}`).toEqual(
      [],
    );
  });

  it("does not depend on the rule engine directly", () => {
    // Engine types arrive transitively through @ruleshop/contracts for
    // rendering traces. A direct dependency would mean this app could start
    // evaluating rules locally, which is exactly what must not happen.
    expect(allDeps).not.toContain("@ruleshop/engine");
  });

  const files = sourceFiles(join(appRoot, "src"));

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("never imports a database client or the engine's evaluator", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      if (
        /from\s+["']@prisma\/client["']/.test(contents) ||
        /from\s+["']@ruleshop\/engine["']/.test(contents) ||
        /require\(\s*["']@prisma\/client["']\s*\)/.test(contents)
      ) {
        offenders.push(file.replace(appRoot, "apps/storefront"));
      }
    }
    expect(offenders, `forbidden imports in: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });

  it("never reads a database connection string", () => {
    const offenders = files.filter((file) =>
      /DATABASE_URL/.test(readFileSync(file, "utf8")),
    );
    expect(
      offenders.map((f) => f.replace(appRoot, "apps/storefront")),
    ).toEqual([]);
  });

  it("reaches the control plane only through the shared api module", () => {
    // Any other file calling fetch() against the control plane would bypass
    // the schema validation and identity headers in lib/api.ts.
    const offenders = files
      .filter((file) => !file.endsWith(join("lib", "api.ts")))
      .filter((file) => /CONTROL_PLANE_URL/.test(readFileSync(file, "utf8")))
      .map((f) => f.replace(appRoot, "apps/storefront"));

    expect(
      offenders,
      `CONTROL_PLANE_URL should only be read by lib/api.ts, found in: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
