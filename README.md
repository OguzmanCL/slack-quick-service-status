# slack-quick-service-status

Slack slash command (`/ss`) that answers with the current health of GitHub and Claude,
read straight from their public Statuspage APIs. Runs as a Cloudflare Worker, so there is no
server to keep alive.

## Usage in Slack

| Command | Result |
| --- | --- |
| `/ss` or `/ss all` | GitHub and Claude, visible only to you |
| `/ss g` or `/ss github` | GitHub only |
| `/ss c` or `/ss claude` | Claude only |
| `/ss g --public` | Posts the answer in the channel |
| `/ss help` | Lists the commands, always visible only to you |

An unknown service answers with the help message. Each answer is a Block Kit message with:

- A header and a headline that reflects the worst state across the requested services, plus the
  query time rendered in the reader's timezone.
- A side-by-side summary row when more than one service is shown.
- One card per service with its logo, overall state and `healthy/total` component count. Affected
  components are listed worst first in a two-column grid (up to ten fields); healthy components
  collapse into one compact gray line.
- Every active incident with an impact emoji, its latest update as a quote and a relative time.
- Link buttons to the status page and to each incident.

A source that fails to answer is flagged in the summary and replaced by a warning, without hiding
the other services.

## Data sources

Both pages run on Atlassian Statuspage and expose the same `api/v2/summary.json` shape:

- GitHub: `https://www.githubstatus.com/api/v2/summary.json`
- Claude: `https://status.claude.com/api/v2/summary.json`

Adding another Statuspage-backed service is one entry in `SOURCES` inside `src/statuspage.ts`, with its
key, short aliases, label, logo URL and summary URL. The help message picks it up automatically.

## Project layout

- `src/statuspage.ts` defines the sources, resolves the command text, fetches summaries and builds the
  help message.
- `src/blocks.ts` renders the Block Kit message and the per-service cards.
- `src/slack.ts` verifies the Slack request signature and rejects stale timestamps.
- `src/index.ts` is the Worker entry point. It also acknowledges interaction payloads from the link
  buttons with an empty 200.
- `scripts/preview.ts` prints a Block Kit Builder URL that renders the message with live data.
- `test/` vitest suites for every module.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm preview github
```

To run the worker locally copy `.dev.vars.example` to `.dev.vars`, fill in the Slack signing
secret and run `pnpm dev`.

## Deploy

1. `pnpm wrangler login`
2. `pnpm wrangler secret put SLACK_SIGNING_SECRET`
3. `pnpm run deploy` and note the `*.workers.dev` URL.

## Slack app setup

Create the app at https://api.slack.com/apps using "From a manifest" and paste:

```json
{
  "display_information": { "name": "Status Bot" },
  "features": {
    "bot_user": { "display_name": "Status Bot", "always_online": true },
    "slash_commands": [
      {
        "command": "/ss",
        "url": "https://slack-quick-service-status.<your-subdomain>.workers.dev",
        "description": "GitHub and Claude service status",
        "usage_hint": "[g|github|c|claude|all|help] [--public]",
        "should_escape": false
      }
    ]
  },
  "oauth_config": { "scopes": { "bot": ["commands"] } },
  "settings": {
    "interactivity": {
      "is_enabled": true,
      "request_url": "https://slack-quick-service-status.<your-subdomain>.workers.dev"
    },
    "socket_mode_enabled": false
  }
}
```

Then copy the Signing Secret from "Basic Information" into the worker secret, install the app
to the workspace and try `/ss`.

Slack notifies the app whenever someone clicks a link button. To avoid a warning icon next to the
buttons, enable "Interactivity & Shortcuts" and set its Request URL to the same worker URL.
