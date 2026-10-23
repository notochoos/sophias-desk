# Sophia's Desk MCP 插件

让任何支持 MCP 的 AI 工具直接读写你的 Desk 数据（目标、速记、日程、会议议题、知识库）。

## 你的插件地址
数据接口部署的网址，后面加 `?mcp=密钥`：
```
https://script.google.com/macros/s/……/exec?mcp=你的密钥
```
这个地址等于你数据的钥匙，只填进你信任的 AI 工具，不要分享。泄露了就在 Apps Script 里重新运行 `makeApiKey`，旧地址立即失效。

## 接到不同的 AI 工具
- **ChatGPT**（开发者模式）：设置 → 应用与连接器 → 高级设置里打开「开发者模式」→ 创建连接器，URL 填上面的地址，认证选「无」。
- **Claude（网页 / 桌面）**：设置 → 连接器 → 添加自定义连接器，URL 填上面的地址。
- **Claude Code / Cursor / Codex CLI 等本地工具**：用 `desk-mcp.mjs` 这个桥接文件（需要 Node.js 18+）：
  ```json
  { "mcpServers": { "sophias-desk": {
      "command": "node", "args": ["/你的路径/desk-mcp.mjs"],
      "env": { "DESK_MCP_URL": "https://script.google.com/macros/s/……/exec?mcp=你的密钥" } } } }
  ```
  有的工具也支持直接填远程地址（type: http / url），那样就不需要桥接文件。

## 提供的工具
| 工具 | 作用 |
|---|---|
| desk_today | 某天概览：日 / 周 / 月目标（含固定目标）、当天会议和议题 |
| list_records / search | 按条件列出、按关键词搜索任意数据 |
| add_goal / update_goal | 新增目标；改标题、标完成、顺延 |
| add_note | 记速记（可同时生成目标） |
| add_topic_item / set_outcome | 给会议加议题；写会后结论 |
| save_record / delete_record | 通用读写（会先看 desk_schema） |
| desk_schema | 数据字段说明 |

AI 写入的内容会在 20 秒内出现在你的 Desk 网页里。
