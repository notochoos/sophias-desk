#!/usr/bin/env node
// Sophia's Desk — 本地 MCP 桥接（给只支持本地插件的 AI 工具用：Claude Desktop、Claude Code、Cursor、Codex CLI 等）
// 它把 AI 的请求原样转发到你的 Google 数据接口。不需要安装任何依赖，只要 Node.js 18 以上。
// 用法：在 AI 工具的 MCP 配置里写
//   command: node   args: ["/路径/desk-mcp.mjs"]
//   env: { "DESK_MCP_URL": "https://script.google.com/macros/s/…/exec?mcp=你的密钥" }
import readline from 'node:readline';
const URL_ = process.env.DESK_MCP_URL;
if (!URL_) { console.error('缺少环境变量 DESK_MCP_URL（数据接口网址 + ?mcp=密钥）'); process.exit(1); }
const rl = readline.createInterface({ input: process.stdin });
let chain = Promise.resolve();
rl.on('line', line => {
  if (!line.trim()) return;
  chain = chain.then(async () => {
    let msg; try { msg = JSON.parse(line); } catch { return; }
    try {
      const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(msg), redirect: 'follow' });
      const text = await r.text();
      if (text.trim()) process.stdout.write(text.trim().replace(/\n/g, ' ') + '\n');
    } catch (e) {
      if (msg && msg.id != null) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: '连不上 Google 数据接口：' + e.message } }) + '\n');
    }
  });
});
