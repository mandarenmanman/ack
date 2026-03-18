// ack-mcp-native-host.js
// A Native Messaging host that also exposes an MCP server over HTTP (Streamable HTTP).
//
// Chrome <extension>  <->  (this process via Native Messaging stdio)  <->  MCP clients (HTTP on localhost)

import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const MCP_HTTP_HOST = '127.0.0.1';
const MCP_HTTP_PORT = process.env.MCP_HTTP_PORT ? parseInt(process.env.MCP_HTTP_PORT, 10) : 8765;

// ---- Native Messaging (Chrome <-> host) protocol ----
// Chrome uses a length-prefixed framing:
// 4 bytes little-endian length, followed by UTF-8 JSON payload.

let stdinBuffer = Buffer.alloc(0);
const pendingToolCalls = new Map(); // id -> {resolve, reject}

function sendToExtension(obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([lenBuf, payload]));
}

function startNativeMessagingReceiver() {
  process.stdin.on('data', (chunk) => {
    stdinBuffer = Buffer.concat([stdinBuffer, chunk]);
    while (stdinBuffer.length >= 4) {
      const msgLen = stdinBuffer.readUInt32LE(0);
      if (stdinBuffer.length < 4 + msgLen) break;

      const raw = stdinBuffer.slice(4, 4 + msgLen);
      stdinBuffer = stdinBuffer.slice(4 + msgLen);

      let msg;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch (e) {
        continue;
      }

      if (!msg || typeof msg !== 'object') continue;

      if (msg.type === 'ping' && msg.id != null) {
        sendToExtension({ type: 'pong', id: msg.id, result: { success: true } });
        continue;
      }

      if (msg.type === 'pong' && msg.id != null) {
        // ping response for connection test
        const waiter = pendingToolCalls.get(msg.id);
        if (waiter) {
          pendingToolCalls.delete(msg.id);
          waiter.resolve(msg.result || { success: true });
        }
        continue;
      }

      if (msg.type === 'tool_result' && msg.id != null) {
        const waiter = pendingToolCalls.get(msg.id);
        if (waiter) {
          pendingToolCalls.delete(msg.id);
          waiter.resolve(msg.result);
        }
        continue;
      }
    }
  });
}

function nextId() {
  return Date.now() + '_' + Math.random().toString(16).slice(2);
}

function callExtensionTool(name, args) {
  const id = nextId();
  return new Promise((resolve, reject) => {
    pendingToolCalls.set(id, { resolve, reject });
    try {
      sendToExtension({ type: 'tool_call', id: id, name: name, arguments: args || {} });
    } catch (e) {
      pendingToolCalls.delete(id);
      reject(e);
    }
    // safety timeout
    setTimeout(() => {
      if (pendingToolCalls.has(id)) {
        pendingToolCalls.delete(id);
        reject(new Error('tool call timeout'));
      }
    }, 30000);
  });
}

function startHTTPMcpServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, mcpHost: MCP_HTTP_HOST, mcpPort: MCP_HTTP_PORT });
  });

  app.post('/mcp', async (req, res) => {
    // Create a server per request (stateless) for simplicity.
    const server = new McpServer({ name: 'ack', version: '0.1.0' });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    server.registerTool(
      'search_bookmarks',
      {
        title: 'Search bookmarks in ACK graph',
        description: 'Search within the analyzed bookmark knowledge graph. Supports optional keyword plus optional @folder or #category scoping.',
        inputSchema: z.object({
          keyword: z.string().optional().default(''),
          folder: z.string().optional(),
          category: z.string().optional(),
          limit: z.number().optional()
        }).partial()
      },
      async (input) => {
        const result = await callExtensionTool('search_bookmarks', input || {});
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result
        };
      }
    );

    server.registerTool(
      'get_graph_stats',
      {
        title: 'Graph statistics',
        description: 'Get node/edge counts and categories. Supports optional @folder or #category scoping.',
        inputSchema: z.object({
          folder: z.string().optional(),
          category: z.string().optional()
        }).partial()
      },
      async (input) => {
        const result = await callExtensionTool('get_graph_stats', input || {});
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result
        };
      }
    );

    server.registerTool(
      'open_url',
      {
        title: 'Open URL',
        description: 'Open a URL in a new browser tab.',
        inputSchema: z.object({
          url: z.string()
        })
      },
      async (input) => {
        const result = await callExtensionTool('open_url', input || {});
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result
        };
      }
    );

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(MCP_HTTP_PORT, MCP_HTTP_HOST, () => {
    // Keep logs concise
    console.log(`[ack-mcp-native-host] MCP server listening on http://${MCP_HTTP_HOST}:${MCP_HTTP_PORT}/mcp`);
  });
}

startNativeMessagingReceiver();
startHTTPMcpServer();

