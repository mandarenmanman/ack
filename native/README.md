# ACK MCP Native Host (Local Bridge)

This folder provides the **local MCP bridge** for ACK.

It consists of:
- A **Chrome Native Messaging host** (stdin/stdout) that the extension can call
- An **MCP server endpoint** exposed over **Streamable HTTP** on `127.0.0.1`

After setup, external MCP clients can connect to:
- `http://127.0.0.1:8765/mcp`

## Prerequisites

1. Node.js (>= 18, tested with Node 22)
2. Chrome installed (Native Messaging registration uses Chrome’s native host manifest)

## Files

- `ack-mcp-native-host.js`: Native host + MCP server implementation
- `run-ack-mcp-native-host.bat`: starts the Node process (used by Chrome)
- `ack_mcp_native_host.json`: Native Messaging host manifest
- `register-ack-mcp-native-host.ps1`: registers the native host in Windows (HKCU)
- `package.json`: MCP SDK dependencies

## Important: update `allowed_origins`

Edit `ack_mcp_native_host.json` and replace:
- `YOUR_EXTENSION_ID_HERE` with your real Chrome extension id

You can find the extension id in:
- `chrome://extensions/` (Developer mode)

Example:
```json
"allowed_origins": ["chrome-extension://<YOUR_EXTENSION_ID>/"]
```

## Install (Windows)

1. Open PowerShell as the same user who runs Chrome
2. Register the native host:
   - Run: `.\register-ack-mcp-native-host.ps1`

If registration succeeds, you should see a “Registered Native Messaging host …” message.

## Enable and Test in ACK Settings

1. Open ACK → `settings.html`
2. Enable: **Enable local MCP bridge**
3. Click: **Test MCP bridge**

This triggers the extension to connect to the Native host and do a quick ping.

## MCP endpoint for external clients

Use the MCP Streamable HTTP endpoint:
- `http://127.0.0.1:8765/mcp`

### Tools available (MVP)

The MCP server currently exposes:
- `search_bookmarks`  
  Supports optional `keyword`, and optional scoping via `folder` / `category`.
- `get_graph_stats`  
  Supports optional scoping via `folder` / `category`.
- `open_url`  
  Opens a URL in a new browser tab.

## Debugging

1. Check whether Node process starts:
   - Open Windows Task Manager / Services (you should see a Node process when the host is invoked)
2. If Native host can’t connect:
   - Verify `allowed_origins`
   - Verify you registered the host under the same Chrome user profile (HKCU)
3. If MCP clients can’t reach the endpoint:
   - Ensure port `8765` is listening: `http://127.0.0.1:8765/healthz`

## Notes / Safety

- The Native host only runs locally (localhost).
- Tool execution is still controlled by the extension side and the current graph data stored in `chrome.storage.local`.

