import { config } from "./config.ts";
import type { TokenData } from "./types.ts";

export type HttpMethod = "GET" | "POST" | "DELETE";

export class LichessResponse {
  private closed = false;
  private textCache: string | null = null;
  private jsonCache: unknown = undefined;

  constructor(
    private rawResponse: globalThis.Response,
    private options: { stream: boolean; abortController?: AbortController },
  ) {}

  get statusCode(): number {
    return this.rawResponse.status;
  }

  get headers(): Headers {
    return this.rawResponse.headers;
  }

  async json(): Promise<unknown> {
    if (this.jsonCache !== undefined) {
      return this.jsonCache;
    }
    const raw = await this.text();
    this.jsonCache = JSON.parse(raw);
    return this.jsonCache;
  }

  async text(): Promise<string> {
    if (this.textCache !== null) {
      return this.textCache;
    }
    this.textCache = await this.rawResponse.text();
    if (this.options.stream) {
      this.close();
    }
    return this.textCache;
  }

  async *ndjson(): AsyncGenerator<unknown> {
    const body = this.rawResponse.body;
    if (!body) {
      this.close();
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            yield JSON.parse(trimmed);
          }
        }
      }

      buffer += decoder.decode();
      const trimmed = buffer.trim();
      if (trimmed) {
        yield JSON.parse(trimmed);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Ignore release failures on already-closed streams.
      }
      this.close();
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.options.abortController?.abort();
    try {
      void this.rawResponse.body?.cancel();
    } catch {
      // Body may already be consumed or locked.
    }
  }
}

export async function makeRequest(
  method: HttpMethod,
  endpoint: string,
  options: {
    accept?: string | null;
    tokenData?: TokenData | null;
  } = {},
): Promise<LichessResponse> {
  return request(method, endpoint, { ...options, stream: false });
}

export async function makeRequestStreaming(
  method: HttpMethod,
  endpoint: string,
  options: {
    accept?: string | null;
    tokenData?: TokenData | null;
  } = {},
): Promise<LichessResponse> {
  return request(method, endpoint, { ...options, stream: true });
}

async function request(
  method: HttpMethod,
  endpoint: string,
  options: {
    accept?: string | null;
    tokenData?: TokenData | null;
    stream: boolean;
  },
): Promise<LichessResponse> {
  const abortController = new AbortController();
  const headers = buildHeaders(options.accept, options.tokenData);
  const response = await fetch(config.getEndpoint(endpoint), {
    method,
    headers,
    signal: abortController.signal,
  });
  return new LichessResponse(response, {
    stream: options.stream,
    abortController,
  });
}

function buildHeaders(accept?: string | null, tokenData?: TokenData | null): HeadersInit {
  const headers: Record<string, string> = {};
  if (accept) {
    headers.Accept = accept;
  }

  const accessToken = tokenData?.access_token;
  if (typeof accessToken === "string" && accessToken) {
    const tokenType = typeof tokenData?.token_type === "string" ? tokenData.token_type : "Bearer";
    headers.Authorization = `${tokenType} ${accessToken}`;
  }

  return headers;
}
