# Claude Max Usage Dashboard

Monitor Claude Max usage across multiple accounts in real time.

![Dashboard Screenshot](screenshot.png)

If you run multiple Claude Max accounts (e.g. one for daily conversations, one for coding), this dashboard shows their usage side by side — so you know which account has capacity left.

## Features

- Real-time usage display for up to 9 accounts
- Session (5h), weekly (all models), and Sonnet-only utilization
- Reset time countdown
- Auto-refresh every 60 seconds
- Zero dependencies — just Node.js

## Quick Start

```bash
git clone https://github.com/YOUR_USER/claude-max-usage-dashboard.git
cd claude-max-usage-dashboard
cp .env.example .env
```

Edit `.env` with your tokens, then:

```bash
node server.mjs
# → http://localhost:18800
```

## How to Get Your Token

1. Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code) if you haven't already
2. Run this in your terminal:

```bash
claude setup-token
```

3. Copy the token (starts with `sk-ant-oat01-`)
4. Paste it into `.env`

Repeat for each Claude Max account.

## Configuration

```env
# Account 1
C1_TOKEN=sk-ant-oat01-xxxxx
C1_LABEL=Main

# Account 2
C2_TOKEN=sk-ant-oat01-yyyyy
C2_LABEL=Coding

# Optional: up to C9
# C3_TOKEN=sk-ant-oat01-zzzzz
# C3_LABEL=Backup
```

## Security: Use 1Password (Recommended)

**Never commit your `.env` file.** It contains your Claude Max OAuth tokens.

For secure token management, we recommend [1Password](https://amzn.to/4lqvyxf):

- Store tokens in 1Password instead of plain text `.env` files
- Use [1Password CLI](https://developer.1password.com/docs/cli/) to inject tokens at runtime:

```bash
# .env (safe to commit — contains only references)
C1_TOKEN=op://Private/Claude Token C1/credential
C2_TOKEN=op://Private/Claude Token C2/credential

# Start with 1Password injection
op run --env-file=.env -- node server.mjs
```

This way your actual tokens never touch disk in plain text.

## How It Works

The dashboard makes a minimal API call (1 output token) per account and reads the rate limit headers from the response:

| Header | Description |
|--------|-------------|
| `anthropic-ratelimit-unified-5h-utilization` | Current session usage |
| `anthropic-ratelimit-unified-7d-utilization` | Weekly usage (all models) |
| `anthropic-ratelimit-unified-7d_sonnet-utilization` | Weekly Sonnet-only usage |

Each refresh costs ~10 tokens per account — negligible impact on your quota.

## Token Expiry

`setup-token` tokens (`sk-ant-oat01-`) can expire. If you see authentication errors:

```bash
claude setup-token
```

Then update `.env` with the new token.

## License

MIT
