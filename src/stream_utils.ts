import { config } from "./config.ts";
import type { CommandReader, WritableConnection } from "./types.ts";

export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPIPE" || code === "ECONNRESET" || code === "ECONNABORTED";
}

export async function writeMessage(writer: WritableConnection, message: string): Promise<void> {
  const bytes = Buffer.from(message, BufferEncodingFromConfig());

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      writer.off("drain", onDrain);
      writer.off("error", onError);
    };
    const finish = (error?: Error | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const onDrain = (): void => finish();
    const onError = (error: Error): void => finish(error);

    writer.once("error", onError);
    const flushed = writer.write(bytes, finish);
    if (!flushed) {
      writer.once("drain", onDrain);
    }
  });
}

export class SocketLineReader implements CommandReader {
  private buffer = Buffer.alloc(0);
  private ended = false;
  private pending:
    | {
        resolve: (value: string | null) => void;
        reject: (error: Error) => void;
      }
    | null = null;

  constructor(socket: NodeJS.ReadableStream) {
    socket.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      this.buffer = Buffer.concat([this.buffer, bytes]);
      this.flushPending();
    });
    socket.on("end", () => {
      this.ended = true;
      this.flushPending();
    });
    socket.on("close", () => {
      this.ended = true;
      this.flushPending();
    });
    socket.on("error", (error: Error) => {
      if (this.pending) {
        const pending = this.pending;
        this.pending = null;
        pending.reject(error);
      }
    });
  }

  readLine(): Promise<string | null> {
    const available = this.consumeLineIfAvailable();
    if (available !== undefined) {
      return Promise.resolve(available);
    }

    return new Promise<string | null>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  private flushPending(): void {
    if (!this.pending) {
      return;
    }
    const available = this.consumeLineIfAvailable();
    if (available === undefined) {
      return;
    }
    const pending = this.pending;
    this.pending = null;
    pending.resolve(available);
  }

  private consumeLineIfAvailable(): string | null | undefined {
    const newlineIndex = this.buffer.indexOf(0x0a);
    if (newlineIndex !== -1) {
      const line = this.buffer.subarray(0, newlineIndex);
      this.buffer = this.buffer.subarray(newlineIndex + 1);
      return line.toString(BufferEncodingFromConfig()).trim();
    }

    if (this.ended) {
      if (this.buffer.length === 0) {
        return null;
      }
      const line = this.buffer;
      this.buffer = Buffer.alloc(0);
      return line.toString(BufferEncodingFromConfig()).trim();
    }

    return undefined;
  }
}

function BufferEncodingFromConfig(): BufferEncoding {
  return config.encoding as BufferEncoding;
}
