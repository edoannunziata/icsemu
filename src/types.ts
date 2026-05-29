export type TokenData = Record<string, unknown>;

export interface WritableConnection {
  write(data: string | Uint8Array, callback?: (error?: Error | null) => void): boolean;
  once(event: "drain", listener: () => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  off(event: "drain", listener: () => void): this;
  off(event: "error", listener: (error: Error) => void): this;
  end(callback?: () => void): this;
  destroy(error?: Error): this;
}

export interface CommandReader {
  readLine(): Promise<string | null>;
}
