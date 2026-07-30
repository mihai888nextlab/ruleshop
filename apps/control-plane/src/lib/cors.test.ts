import { afterEach, describe, expect, it } from "vitest";
import { corsHeaders } from "./cors";

/**
 * One control plane serves many storefronts, each on its own origin. These lock
 * the allowlist behaviour that makes running several shops in parallel possible.
 */

const original = process.env.STOREFRONT_ORIGIN;

afterEach(() => {
  if (original === undefined) delete process.env.STOREFRONT_ORIGIN;
  else process.env.STOREFRONT_ORIGIN = original;
});

function headersFor(origin: string | null): Record<string, string> {
  const request = new Request("https://control.example.com/api/v1/store/cart", {
    headers: origin ? { origin } : {},
  });
  return corsHeaders(request) as Record<string, string>;
}

describe("CORS allowlist", () => {
  it("echoes whichever configured origin is calling", () => {
    process.env.STOREFRONT_ORIGIN =
      "http://localhost:3008,http://localhost:3009,http://localhost:3010";

    for (const port of [3008, 3009, 3010]) {
      const origin = `http://localhost:${port}`;
      expect(headersFor(origin)["Access-Control-Allow-Origin"]).toBe(origin);
    }
  });

  it("refuses an origin that is not on the list", () => {
    process.env.STOREFRONT_ORIGIN = "http://localhost:3008";

    // Naming a different origin is what makes the browser block the response.
    expect(headersFor("http://evil.example")["Access-Control-Allow-Origin"]).not.toBe(
      "http://evil.example",
    );
  });

  it("ignores surrounding whitespace and trailing slashes", () => {
    process.env.STOREFRONT_ORIGIN = " http://localhost:3009/ , http://shop.test ";

    expect(headersFor("http://localhost:3009")["Access-Control-Allow-Origin"]).toBe(
      "http://localhost:3009",
    );
    expect(headersFor("http://shop.test")["Access-Control-Allow-Origin"]).toBe(
      "http://shop.test",
    );
  });

  it("still supports the wildcard escape hatch", () => {
    process.env.STOREFRONT_ORIGIN = "*";

    expect(headersFor("http://anything.test")["Access-Control-Allow-Origin"]).toBe(
      "http://anything.test",
    );
  });

  it("falls back to the dev origin when unset", () => {
    delete process.env.STOREFRONT_ORIGIN;

    expect(headersFor("http://localhost:3008")["Access-Control-Allow-Origin"]).toBe(
      "http://localhost:3008",
    );
  });

  it("marks every response as origin-dependent so caches cannot cross shops", () => {
    process.env.STOREFRONT_ORIGIN = "http://localhost:3008,http://localhost:3009";

    expect(headersFor("http://localhost:3009").Vary).toBe("Origin");
  });
});
