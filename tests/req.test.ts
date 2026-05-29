import { afterEach, describe, expect, test } from "bun:test";
import { config } from "../src/config.ts";
import { LichessResponse, makeRequest, makeRequestStreaming } from "../src/req.ts";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
  config.reload();
});

describe("request wrapper", () => {
  test("makeRequest includes accept and authorization headers", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ ok: true }));
    }) as typeof fetch;

    const response = await makeRequest("GET", "/example", {
      accept: "text/plain",
      tokenData: { access_token: "token", token_type: "Bearer" },
    });

    expect(await response.json()).toEqual({ ok: true });
    expect(calls[0]!.input).toBe(config.getEndpoint("/example"));
    expect(calls[0]!.init?.method).toBe("GET");
    expect(calls[0]!.init?.headers).toEqual({
      Accept: "text/plain",
      Authorization: "Bearer token",
    });
  });

  test("headers are omitted when not configured", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response("plain body");
    }) as typeof fetch;

    const response = await makeRequest("GET", "/default");

    expect(await response.text()).toBe("plain body");
    expect(await response.text()).toBe("plain body");
    expect(calls[0]!.init?.headers).toEqual({});
  });

  test("streaming ndjson yields parsed objects and closes", async () => {
    globalThis.fetch = (async () => new Response('{"value":1}\n\n{"value":2}\n')) as typeof fetch;

    const response = await makeRequestStreaming("GET", "/stream", {
      accept: "application/x-ndjson",
    });
    const items: unknown[] = [];
    for await (const item of response.ndjson()) {
      items.push(item);
    }

    expect(items).toEqual([{ value: 1 }, { value: 2 }]);
  });

  test("context-like close is idempotent", () => {
    const response = new LichessResponse(new Response("ok"), { stream: false });
    response.close();
    response.close();
    expect(response.statusCode).toBe(200);
  });
});
