# Sophia's Desk

一个个人工作台网页：**速记 · 日程与会议议题 · 月 / 周 / 日目标（含固定目标）· 知识库 · 周报**。

- 打开就能用，不需要注册。数据只存在**你自己的浏览器**里，别人打开同一个网址看到的是一个空白的 Desk。
- 顶部「导出备份」：把全部数据（含附件）下载成一个 json 文件。「导入备份」：用这个文件一键恢复，可以在另一台电脑或另一个浏览器里恢复。
- 换电脑、清理浏览器数据前，记得先导出备份。

## 文件说明
| 路径 | 作用 |
|---|---|
| `index.html` | 发布出去的网页（浏览器本地版），由 build.py 生成 |
| `src/desk.html` | 页面本体：界面和全部功能，**改功能改这里** |
| `src/local-shim.js` | 浏览器本地版的数据层（localStorage + IndexedDB） |
| `google/` | Google 版：数据存 Google 表格。`Code.gs` 是后台；`Index.html` 由 build.py 生成 |
| `build.py` | 改完 src 或 shim 后运行 `python3 build.py`，重新生成两个网页 |
| `AGENTS.md` | 给 AI 编程工具看的修改规则 |
| `google/Mcp.gs` | MCP 插件接口：让任何支持 MCP 的 AI 读写 Desk 数据 |
| `mcp/` | 插件说明和本地桥接文件，见 mcp/README.md |

## 数据结构
数据分 6 类（collection），每条记录 = `id` + 字段：
- `goals` 目标：`level`(month/week/day)、`period`(2026-10 / 2026-W43 / 2026-10-23)、`title`、`status`(todo/done)、`routine`(固定目标模板 id)、`delays`、`history`、`due`、`noteId`
- `events` 日程：`date`、`start`、`end`、`title`、`kind`(meeting/discussion/other)、`mno`、`place`、`repeat`(weekly/biweekly)、`except`
- `tasks` 会议议题卡：`eventId`+`evDate`(对应哪场会)、`title`、`bg`(背景)、`bgFiles`、`items`[{`id`,`text`,`outcome`(会后结论),`files`}]
- `notes` 速记：`date`、`text`、`cat`(rule/case/idea/doubt)、`task`、`due`、`goalId`、`routineId`、`kbStatus`
- `kb_items` 知识库条目：`prog`、`topic`、`title`、`summary`、`detail`、`cases`、`sources`、`history`
- `kbmeta` 设置：`routines.items`(固定目标模板)、`config.topics`(知识库目录)、`draft`

备份文件格式：`{"app":"Sophia's Desk","format":1,"collections":{<上面 6 类>:[…]},"files":{<附件 id>:{"b64"|"text":…}}}`
