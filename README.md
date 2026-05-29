# icsemu

Icsemu is a bridge to Lichess that exposes an ICS-like TCP interface for
historical chess clients such as XBoard.

## Setup

```sh
bun install
bun run dev
```

On first run, icsemu starts the Lichess OAuth flow and listens on
`ICSEMU_PORT` for the callback and later ICS commands.

## Configuration

The following environment variables are supported:

- `ICSEMU_CLIENT_ID`, default `icsemu`
- `ICSEMU_LICHESS_HOST`, default `https://lichess.org`
- `ICSEMU_PORT`, default `4041`
- `ICSEMU_PROMPT`, default `%fics`
- `ICSEMU_TOKEN_PATH`, default platform config path
- `ICSEMU_ENCODING`, default `utf8`

## Commands

Supported commands include `finger`, `games`, `help`, `observe`, `set`,
`unobserve`, and `variables`. Commands may be abbreviated when the prefix is
unambiguous.

## Build

```sh
bun run build:exe
```

The executable is written to `dist/icsemu`.
