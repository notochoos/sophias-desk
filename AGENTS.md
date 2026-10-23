# 给 AI 编程工具的说明（Claude Code / Codex / Cursor 等通用）

这是 Sophia 的个人工作台网页，已在日常使用。修改时请遵守：

1. **功能改 `src/desk.html`**，数据层改 `src/local-shim.js` 或 `google/shim.js`。改完运行 `python3 build.py`，把生成的 `index.html`、`google/Index.html` 一起提交。不要手改这两个生成文件。
2. **不改数据字段的含义，不删字段**（见 README「数据结构」）。旧备份文件必须仍能导入。需要新字段时只能新增。
3. 页面通过 `window.claude.use('db' | 'assets' | 'user')` 取数据接口，由 shim 提供；在 Claude 平台上则由平台提供。三种环境都要能跑，不要绕过这个接口直接读写存储。
4. 只按需求改，不顺手重构无关部分；界面文字用中文。
5. 改完自查：浏览器打开 index.html，「导入备份」→ 目标、日程、会议议题、附件都能显示；新增一条目标后刷新页面，仍然存在；「导出备份」能下载。
6. 不要把任何备份 json、密钥、个人数据提交进仓库（仓库是公开的）。
