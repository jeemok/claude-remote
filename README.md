# claude-remote

Trigger [Claude Code](https://claude.ai/code) sessions on your **local desktop** from anywhere, then control them from the **Claude app**.

claude-remote is a tiny, mobile-friendly web dashboard. Tap **Start Session** and it spins up a Claude Code session on your machine and automatically runs `/remote-control` — handing the session off to the Claude app so you can drive it from your phone or any device. Put it behind a reverse proxy like [ngrok](https://ngrok.com) and your desktop is one tap away.

![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue)

## Why

You want Claude Code working in your real project, on your real machine — full filesystem, your tools, your environment — but you're not at your desk. claude-remote lets you:

1. **Start** a Claude Code session on your desktop remotely, from a phone-friendly dashboard.
2. **Hand it off** to the Claude app automatically — each session runs `/remote-control` on launch, so it shows up for remote control.
3. **Monitor & stop** sessions from the same dashboard.

No SSH, no terminal on your phone. Just a tap to launch, then continue in the Claude app.

## How it works

Each session is a [`tmux`](https://github.com/tmux/tmux) session running `claude` in your project directory. The server:

- **Starts** a new session and, after a few seconds, sends `/remote-control` into it so the Claude app can take over.
- **Lists** active sessions, auto-refreshing every 5 seconds.
- **Stops** sessions individually or all at once.
- **Copies** the `tmux attach` command if you want to reconnect locally.

Auth is a shared secret passed as a Bearer token or `?token=` query param.

## Requirements

- [Node.js](https://nodejs.org) 18+
- [tmux](https://github.com/tmux/tmux) on your `PATH` (or set `TMUX_BIN` to its full path)
- [Claude Code CLI](https://claude.ai/code) (`claude` on PATH), signed in
- [ngrok](https://ngrok.com) (or any reverse proxy) to reach your desktop from outside your network

## Setup

```bash
git clone https://github.com/jeemok/claude-remote
cd claude-remote
npm install
cp .env.example .env
```

Edit `.env`:

```env
REMOTE_SECRET=replace-with-a-long-random-string
PORT=4242
WORK_DIR=/path/to/your/project
```

`WORK_DIR` is the directory new Claude sessions start in.

## Running

Start the server on your desktop:

```bash
npm start
```

Locally it's now at `http://localhost:4242/?token=your-secret`.

### Expose it with ngrok

To reach your desktop from your phone, put the server behind a reverse proxy. With ngrok:

```bash
ngrok http 4242
```

ngrok prints a public HTTPS URL like `https://abc123.ngrok-free.app`. Open it with your token:

```
https://abc123.ngrok-free.app/?token=your-secret
```

Bookmark that on your phone. Tap **Start Session**, give it a few seconds, then open the **Claude app** — the new session is ready for remote control.

> Any reverse proxy with HTTPS works (Cloudflare Tunnel, Tailscale Funnel, Caddy, nginx). ngrok is just the quickest to get going.

### Keeping it running

Use a process manager so the server survives logout/reboot:

```bash
npm install -g pm2
pm2 start npm --name claude-remote -- start
pm2 save
```

Or run it as a `launchd` (macOS) / `systemd` (Linux) service.

## Typical flow

1. Server + ngrok running on your desktop.
2. On your phone, open the ngrok URL with your token.
3. Tap **Start Session** → a `tmux` + `claude` session launches in `WORK_DIR` and auto-runs `/remote-control`.
4. Open the **Claude app** and take control of the session.
5. Done? Tap **Stop** in the dashboard (or `/stop` the session).

## Security

- Use a long random secret: `openssl rand -hex 32`.
- Always expose it over **HTTPS** (ngrok gives you this for free).
- The token appears in URLs — prefer the `Authorization: Bearer <secret>` header on shared networks.
- Anyone with the URL + token can start sessions and run code on your machine. Treat the secret like a password and rotate it if leaked.

## API

| Endpoint | Description |
|----------|-------------|
| `GET /` | Web dashboard (requires auth) |
| `GET /sessions` | List active sessions as JSON |
| `GET /start` | Start a new Claude session (auto-runs `/remote-control`) |
| `GET /stop?name=<session>` | Stop a specific session |

All endpoints require `Authorization: Bearer <secret>` or `?token=<secret>`.

## License

MIT
