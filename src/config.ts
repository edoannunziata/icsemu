const DEFAULTS = {
  ICSEMU_CLIENT_ID: "icsemu",
  ICSEMU_LICHESS_HOST: "https://lichess.org",
  ICSEMU_PORT: "4041",
  ICSEMU_PROMPT: "%fics",
  ICSEMU_TOKEN_PATH: "",
  ICSEMU_ENCODING: "utf8",
} as const;

function envValue(name: keyof typeof DEFAULTS): string {
  return process.env[name] ?? DEFAULTS[name];
}

export class Config {
  clientId = "";
  lichessHost = "";
  port = 4041;
  prompt = "";
  tokenPath = "";
  encoding = "";

  constructor() {
    this.reload();
  }

  reload(): void {
    this.clientId = envValue("ICSEMU_CLIENT_ID");
    this.lichessHost = envValue("ICSEMU_LICHESS_HOST").replace(/\/+$/, "");

    const rawPort = envValue("ICSEMU_PORT");
    if (!/^-?\d+$/.test(rawPort)) {
      throw new Error("ICSEMU_PORT must be an integer");
    }
    this.port = Number.parseInt(rawPort, 10);

    this.prompt = envValue("ICSEMU_PROMPT");
    this.tokenPath = envValue("ICSEMU_TOKEN_PATH");
    this.encoding = envValue("ICSEMU_ENCODING");
  }

  redirectUri(): string {
    return `http://localhost:${this.port}`;
  }

  authorizeUrl(): string {
    return `${this.lichessHost}/oauth`;
  }

  tokenUrl(): string {
    return `${this.lichessHost}/api/token`;
  }

  getEndpoint(endpoint: string): string {
    return `${this.lichessHost}/${endpoint.replace(/^\/+/, "")}`;
  }
}

export const config = new Config();
