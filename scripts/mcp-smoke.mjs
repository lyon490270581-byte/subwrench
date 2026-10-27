// Smoke test: talk to the MCP server over stdio like a real client.
import { spawn } from "node:child_process";

const proc = spawn(process.execPath, ["packages/mcp/bin/server.js"], { stdio: ["pipe", "pipe", "inherit"] });
let buf = "";
const pending = new Map();
let nextId = 1;

proc.stdout.on("data", (d) => {
  buf += d;
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function rpc(method, params) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function notify(method, params) {
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

const SRT = "1\n00:00:01,000 --> 00:00:04,000\nHello world\n";

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "1.0" },
});
console.log("server:", init.result.serverInfo.name, init.result.serverInfo.version);
notify("notifications/initialized", {});

const tools = await rpc("tools/list", {});
console.log("tools:", tools.result.tools.map((t) => t.name).join(", "));

const conv = await rpc("tools/call", {
  name: "subtitle_convert",
  arguments: { content: SRT, to: "vtt" },
});
console.log("subtitle_convert:", JSON.stringify(conv.result.content[0].text.slice(0, 40)));

const tok = await rpc("tools/call", {
  name: "estimate_tokens",
  arguments: { text: "hello world", model: "gpt" },
});
console.log("estimate_tokens:", tok.result.content[0].text);

const h = await rpc("tools/call", { name: "hash_tool", arguments: { op: "sha256", input: "abc" } });
console.log("hash_tool:", h.result.content[0].text);

proc.kill();
console.log("MCP SMOKE TEST PASSED");
process.exit(0);
