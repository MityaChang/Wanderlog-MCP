# wanderlog-itinerary-mcp

Local MCP server for planning Wanderlog itineraries through conversation.

This project lets an MCP-compatible assistant connect to your local Wanderlog
browser session and use tools for trip planning. The first implemented tools
list trips, read a trip itinerary, return a shareable trip URL, and return a
trip import email. More itinerary-building tools are planned in tested slices.

Wanderlog does not provide a public API for this workflow. Treat the
`connect.sid` cookie like a password, and do not commit it to this repository.

## Requirements

- Node.js 22 or newer.
- A Wanderlog account.
- An MCP-compatible client such as Claude Code, Claude Desktop, Cursor,
  VS Code, Codex, Codex Desktop, or Antigravity.
- Your Wanderlog `connect.sid` browser session cookie.

## Security Notes

Your `connect.sid` cookie grants access to your Wanderlog account. Treat it like
a password.

- Do not commit it to git.
- Do not paste it into issue reports or logs.
- Store it only in your local MCP client configuration.
- Refresh it if you log out of Wanderlog, change your password, or tools start
  returning authentication errors.

This server runs locally. It does not use a relay server or third-party
credential storage.

## Step 1: Get Your Wanderlog Cookie

### Chrome Or Edge

1. Open [Wanderlog](https://wanderlog.com/) and sign in.
2. Open DevTools with `F12` or `Option` + `Command` + `I` on macOS.
3. Select the **Application** tab.
4. In the left sidebar, open **Storage** > **Cookies** >
   `https://wanderlog.com`.
5. Find the cookie named `connect.sid`.
6. Copy its full value. It usually starts with `s%3A`.

### Firefox

1. Open [Wanderlog](https://wanderlog.com/) and sign in.
2. Open DevTools with `F12` or `Option` + `Command` + `I` on macOS.
3. Select the **Storage** tab.
4. In the left sidebar, open **Cookies** > `https://wanderlog.com`.
5. Find the cookie named `connect.sid`.
6. Copy its full value. It usually starts with `s%3A`.

`document.cookie` will not show this value because Wanderlog marks the cookie as
`HttpOnly`. Browser DevTools can still display it.

## Step 2: Configure Your MCP Client

Published usage will be:

```bash
npx wanderlog-itinerary-mcp
```

During local development from this repository, build first and point your client
at the local executable:

```bash
npm install
npm run build
```

Then use `node /absolute/path/to/Wanderlog-MCP/dist/index.js` in client configs
until the package is published to npm.

### Claude Code

Published package:

```bash
claude mcp add wanderlog-itinerary-mcp npx wanderlog-itinerary-mcp \
	--env WANDERLOG_COOKIE="s%3A...your value here..."
```

Local checkout:

```bash
claude mcp add wanderlog-itinerary-mcp node \
	/Users/necmsbu/Projects/Wanderlog-MCP/dist/index.js \
	--env WANDERLOG_COOKIE="s%3A...your value here..."
```

### Claude Desktop

Edit `claude_desktop_config.json`.

macOS path:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Published package:

```json
{
  "mcpServers": {
    "wanderlog": {
      "command": "npx",
      "args": ["wanderlog-itinerary-mcp"],
      "env": {
        "WANDERLOG_COOKIE": "s%3A...your value here..."
      }
    }
  }
}
```

Local checkout:

```json
{
  "mcpServers": {
    "wanderlog": {
      "command": "node",
      "args": ["/Users/necmsbu/Projects/Wanderlog-MCP/dist/index.js"],
      "env": {
        "WANDERLOG_COOKIE": "s%3A...your value here..."
      }
    }
  }
}
```

Restart Claude Desktop after editing the file.

### VS Code

Create or edit `.vscode/mcp.json` in your workspace.

Published package:

```json
{
  "servers": {
    "wanderlog": {
      "type": "stdio",
      "command": "npx",
      "args": ["wanderlog-itinerary-mcp"],
      "env": {
        "WANDERLOG_COOKIE": "s%3A...your value here..."
      }
    }
  }
}
```

Local checkout:

```json
{
  "servers": {
    "wanderlog": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/necmsbu/Projects/Wanderlog-MCP/dist/index.js"],
      "env": {
        "WANDERLOG_COOKIE": "s%3A...your value here..."
      }
    }
  }
}
```

### Cursor

Edit `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "wanderlog": {
      "command": "npx",
      "args": ["wanderlog-itinerary-mcp"],
      "env": {
        "WANDERLOG_COOKIE": "s%3A...your value here..."
      }
    }
  }
}
```

Use the local `node` command and `dist/index.js` path instead of `npx` while
developing from this repository.

### Codex

Edit `~/.codex/config.toml`.

```toml
[mcp_servers.wanderlog]
command = "npx"
args = ["wanderlog-itinerary-mcp"]

[mcp_servers.wanderlog.env]
WANDERLOG_COOKIE = "s%3A...your value here..."
```

Use the local `node` command and `dist/index.js` path instead of `npx` while
developing from this repository.

## Step 3: Verify The MCP Server

Ask your MCP client:

```text
What Wanderlog trips do I have?
```

The assistant should call `wanderlog_list_trips` and return your trip list. If
your account has no trips, it should say no Wanderlog trips were found.

## Implemented Tools

| Tool                                  | What it does                                                 |
| ------------------------------------- | ------------------------------------------------------------ |
| `wanderlog_list_trips`                | Lists trips in your Wanderlog account.                       |
| `wanderlog_get_trip`                  | Reads a full trip itinerary, optionally filtered to one day. |
| `wanderlog_get_trip_url`              | Returns a shareable Wanderlog trip link.                     |
| `wanderlog_get_trip_forwarding_email` | Returns a trip import email address when available.          |

## Example Prompts

Current implemented capability:

```text
List my Wanderlog trips.
```

```text
Show my Japan trip itinerary for day 2.
```

```text
Give me the shareable link for my Lisbon trip.
```

Planned capabilities for later releases:

```text
Create a five-day Tokyo itinerary with ramen spots, museums, transit notes, and
a pre-trip checklist.
```

```text
Add booking notes between each stop in my Barcelona trip.
```

```text
Show my Lisbon itinerary for day 3 and add a hotel near the waterfront.
```

## Troubleshooting

### The server says `Set WANDERLOG_COOKIE`

Your MCP client did not pass the environment variable to the server. Recheck the
client config and restart the client.

### The server says the cookie shape is invalid

The value should usually start with `s%3A`. Copy the full `connect.sid` value
from browser DevTools, not from `document.cookie`.

### The tool returns an authentication or request failure

Your browser session may have expired, or Wanderlog may have changed its private
API. Sign in to Wanderlog again, copy a fresh `connect.sid`, update your MCP
client config, and restart the client.

### Running `npx wanderlog-itinerary-mcp` appears to hang

This is normal when run directly in a terminal. MCP stdio servers wait for an
MCP client to send protocol messages. Run it through a compatible MCP client.

## Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run typecheck
npm test
npm run test:fixtures
npm run build
```

Run the live read-only integration smoke test only when you have a valid cookie:

```bash
RUN_WANDERLOG_INTEGRATION=1 WANDERLOG_COOKIE='s%3A...' npm run test:integration
```

Inspect package contents before publishing:

```bash
npm pack --dry-run
```

## License

MIT. See [LICENSE](LICENSE).
