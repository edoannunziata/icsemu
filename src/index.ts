import { createServer } from "node:net";
import { beginAuthorization } from "./auth.ts";
import { handleAuthRequest } from "./auth_handler.ts";
import { config } from "./config.ts";
import { clearTokenData, loadTokenData } from "./credentials.ts";
import { ConnectionState } from "./state.ts";
import { SocketLineReader } from "./stream_utils.ts";
import { handleTcp } from "./tcp_handler.ts";

let authContext = null as ReturnType<typeof beginAuthorization> | null;

async function handleConnection(socket: import("node:net").Socket): Promise<void> {
  const tokenData = await loadTokenData();
  if (tokenData !== null) {
    const state = new ConnectionState({ tokenData });
    await handleTcp(new SocketLineReader(socket), socket, state);
    return;
  }

  const state = new ConnectionState({ authContext });
  await handleAuthRequest(socket, state);
}

export async function main(): Promise<void> {
  if ((await loadTokenData()) !== null) {
    console.log("Already logged in.");
  } else {
    await clearTokenData();
    authContext = beginAuthorization();
  }

  const server = createServer((socket) => {
    void handleConnection(socket).catch((error) => {
      console.error("Connection failed", error);
      socket.destroy();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, "0.0.0.0", resolve);
  });
  console.log(`Server running on port ${config.port}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
