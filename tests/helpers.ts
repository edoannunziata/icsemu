import { EventEmitter } from "node:events";
import type { CommandReader, WritableConnection } from "../src/types.ts";

export class FakeWriter extends EventEmitter implements WritableConnection {
  chunks: Buffer[] = [];
  ended = false;
  destroyed = false;

  write(data: string | Uint8Array, callback?: (error?: Error | null) => void): boolean {
    this.chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
    queueMicrotask(() => callback?.());
    return true;
  }

  end(callback?: () => void): this {
    this.ended = true;
    queueMicrotask(() => callback?.());
    return this;
  }

  destroy(_error?: Error): this {
    this.destroyed = true;
    return this;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

export class FakeReader implements CommandReader {
  private index = 0;

  constructor(private readonly lines: Array<string | null>) {}

  async readLine(): Promise<string | null> {
    if (this.index >= this.lines.length) {
      return null;
    }
    return this.lines[this.index++] ?? null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
