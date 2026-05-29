import type { Socket } from "node:net";
import { exchangeCode } from "./auth.ts";
import { saveTokenData } from "./credentials.ts";
import type { ConnectionState } from "./state.ts";

export const AUTH_PENDING_BODY = "Authentication flow still pending.";
export const MISSING_CODE_BODY = "Missing authorization code. Please retry the login.";
export const STATE_MISMATCH_BODY = "State mismatch during authentication.";
export const AUTH_SUCCESS_BODY = "Authentication completed. You can return to the application.";

export async function handleAuthRequest(socket: Socket, state: ConnectionState): Promise<void> {
  const firstChunk = await readFirstChunk(socket);
  if (!firstChunk) {
    socket.end();
    return;
  }

  const requestText = firstChunk.toString("utf8");
  const requestLine = requestText.split(/\r?\n/, 1)[0] ?? "";
  let method = "GET";
  let target = "/";
  const parts = requestLine.split(" ");
  if (parts.length >= 2) {
    method = parts[0] ?? "GET";
    target = parts[1] ?? "/";
  }

  const parsed = new URL(target, "http://localhost");
  const code = parsed.searchParams.get("code");
  const paramState = parsed.searchParams.get("state");

  let statusLine = "HTTP/1.1 200 OK\r\n";
  let body = AUTH_PENDING_BODY;

  if (method !== "GET" || !code) {
    if (!code) {
      body = MISSING_CODE_BODY;
    }
    await writeResponse(socket, statusLine, body);
    return;
  }

  const context = state.authContext;
  if (!context || paramState !== context.state) {
    statusLine = "HTTP/1.1 400 Bad Request\r\n";
    body = STATE_MISMATCH_BODY;
    await writeResponse(socket, statusLine, body);
    return;
  }

  const tokenData = await exchangeCode(context, code);
  state.authContext = null;
  state.tokenData = tokenData;
  await saveTokenData(tokenData);

  await writeResponse(socket, statusLine, AUTH_SUCCESS_BODY);
  console.log("Access token received!");
}

function readFirstChunk(socket: Socket): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      socket.off("data", onData);
      socket.off("end", onEnd);
      socket.off("close", onEnd);
      socket.off("error", onError);
    };
    const onData = (chunk: Buffer): void => {
      cleanup();
      resolve(chunk);
    };
    const onEnd = (): void => {
      cleanup();
      resolve(null);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    socket.once("data", onData);
    socket.once("end", onEnd);
    socket.once("close", onEnd);
    socket.once("error", onError);
  });
}

function writeResponse(socket: Socket, statusLine: string, body: string): Promise<void> {
  const response = `${statusLine}Content-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(
    body,
  )}\r\n\r\n${body}`;

  return new Promise((resolve) => {
    socket.end(response, "utf8", resolve);
  });
}
