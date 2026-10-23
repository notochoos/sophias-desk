/**
 * Sophia's Desk — MCP 插件接口（让任何支持 MCP 的 AI 工具读写 Desk 数据）
 * 地址：数据接口部署的网址 + ?mcp=你的密钥    例：https://script.google.com/macros/s/…/exec?mcp=xxxx
 * 协议：MCP Streamable HTTP（JSON 响应，无会话），JSON-RPC 2.0
 */
var MCP_TZ = 'Asia/Shanghai';
var MCP_VERSION = '2025-06-18';

function mcpHttp_(key, msg) {
  var real = PropertiesService.getScriptProperties().getProperty('API_KEY');
  var out;
  if (!real || key !== real) {
    out = { jsonrpc: '2.0', id: (msg && msg.id) || null, error: { code: -32001, message: '密钥不对' } };
  } else if (Array.isArray(msg)) {
    out = msg.map(mcpHandle_).filter(function (r) { return r; });
  } else {
    out = mcpHandle_(msg);
  }
  return ContentService.createTextOutput(out ? JSON.stringify(out) : '').setMimeType(ContentService.MimeType.JSON);
}

function mcpHandle_(m) {
  if (!m || m.jsonrpc !== '2.0' || !m.method) return m && m.id != null ? mcpErr_(m.id, -32600, 'Invalid request') : null;
  if (m.id === undefined || m.id === null) return null; // 通知，不需要回复
  try {
    if (m.method === 'initialize') return mcpOk_(m.id, {
      protocolVersion: (m.params && m.params.protocolVersion) || MCP_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'sophias-desk', version: '1.0.0' },
      instructions: MCP_INSTRUCTIONS
    });
    if (m.method === 'ping') return mcpOk_(m.id, {});
    if (m.method === 'tools/list') return mcpOk_(m.id, { tools: MCP_TOOLS });
    if (m.method === 'tools/call') {
      var name = m.params && m.params.name, args = (m.params && m.params.arguments) || {};
      var fn = MCP_IMPL[name];
      if (!fn) return mcpErr_(m.id, -32602, '没有这个工具：' + name);
      try {
        var res = fn(args);
        return mcpOk_(m.id, { content: [{ type: 'text', text: typeof res === 'string' ? res : JSON.stringify(res, null, 1) }] });
      } catch (err) {
        return mcpOk_(m.id, { isError: true, content: [{ type: 'text', text: '出错了：' + (err && err.message || err) }] });
      }
    }
    if (m.method === 'resources/list') return mcpOk_(m.id, { resources: [] });
    if (m.method === 'prompts/list') return mcpOk_(m.id, { prompts: [] });
    return mcpErr_(m.id, -32601, 'Method not found: ' + m.method);
  } catch (e) { return mcpErr_(m.id, -32603, String(e && e.message || e)); }
}
function mcpOk_(id, result) { return { jsonrpc: '2.0', id: id, result: result }; }
function mcpErr_(id, code, message) { return { jsonrpc: '2.0', id: id, error: { code: code, message: message } }; }

var MCP_INSTRUCTIONS = [
  "这是 Sophia 的个人工作台 Sophia's Desk 的数据。她是 OMTech 的 MKT，负责 Demo Room Host Program 和 Impact Affiliate，和 TS / MKT / OP 团队合作。",
  '先调用 desk_today 了解今天、本周、本月的目标和今天的会议；需要细节时再用 list_records / search。',
  '日期一律用 YYYY-MM-DD；周用 ISO 周 2026-W43；月用 2026-10；时区 Asia/Shanghai。',
  '改数据时优先用 add_goal / update_goal / add_note / add_topic_item / set_outcome 这些专用工具；只有它们做不到时才用 save_record，并保持原有字段结构（字段说明见 desk_schema）。',
  '删除前先和用户确认。不要编造数据，查不到就说查不到。'
].join('\n');

function mcpS_(desc, props, req) { return { type: 'object', properties: props || {}, required: req || [], additionalProperties: false }; }
var MCP_TOOLS = [
  { name: 'desk_schema', description: '返回 Desk 的数据结构说明（各类记录有哪些字段、取值含义）。第一次改数据前先看。', inputSchema: mcpS_('', {}) },
  { name: 'desk_today', description: '某一天的概览：当天日目标、所在周的周目标、所在月的月目标（含固定目标）、当天的会议和会议议题。默认今天。',
    inputSchema: mcpS_('', { date: { type: 'string', description: 'YYYY-MM-DD，默认今天' } }) },
  { name: 'list_records', description: '列出某一类记录，可按字段过滤。collection 取 goals / events / notes / tasks / kb_items / kbmeta。',
    inputSchema: mcpS_('', { collection: { type: 'string', enum: ['goals', 'events', 'notes', 'tasks', 'kb_items', 'kbmeta'] },
      where: { type: 'object', description: '字段等值过滤，例如 {"level":"week","period":"2026-W43"} 或 {"status":"todo"}' },
      limit: { type: 'number', description: '最多返回条数，默认 100' } }, ['collection']) },
  { name: 'search', description: '在目标、速记、会议议题、知识库、日程里按关键词搜索（不区分大小写）。',
    inputSchema: mcpS_('', { query: { type: 'string' }, limit: { type: 'number' } }, ['query']) },
  { name: 'add_goal', description: '新增一条目标。level：day / week / month。period 不填则用今天所在的日 / 周 / 月；也可以只给 due（截止日），自动放进对应的日 / 周 / 月。',
    inputSchema: mcpS_('', { title: { type: 'string' }, level: { type: 'string', enum: ['day', 'week', 'month'] },
      period: { type: 'string', description: 'day: YYYY-MM-DD；week: 2026-W43；month: 2026-10' }, due: { type: 'string', description: 'YYYY-MM-DD' } }, ['title']) },
  { name: 'update_goal', description: '修改目标：改标题、标记完成 / 未完成、移到别的日 / 周 / 月（会记一次顺延）。',
    inputSchema: mcpS_('', { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string', enum: ['todo', 'done'] },
      period: { type: 'string', description: '移到这个日 / 周 / 月' } }, ['id']) },
  { name: 'add_note', description: '记一条速记。cat：rule（规则/口径）| case（Host 个案）| idea（想法）| doubt（待确认）| 空。task=true 且有 due 时会同时生成目标。',
    inputSchema: mcpS_('', { text: { type: 'string' }, cat: { type: 'string', enum: ['', 'rule', 'case', 'idea', 'doubt'] },
      prog: { type: 'string', enum: ['', 'drh', 'impact'] }, task: { type: 'boolean' }, due: { type: 'string' } }, ['text']) },
  { name: 'add_topic_item', description: '给某场会议加一条议题。用 desk_today 或 list_records(events) 找到会议的 eventId 和日期；这场会还没有议题卡时会自动建一张。',
    inputSchema: mcpS_('', { eventId: { type: 'string' }, date: { type: 'string', description: '会议日期 YYYY-MM-DD' }, text: { type: 'string' }, background: { type: 'string', description: '可选：写入这场会的背景' } }, ['eventId', 'date', 'text']) },
  { name: 'set_outcome', description: '写某条议题的会后结论（会覆盖原来的结论）。taskId 是议题卡 id，itemId 是议题 id。',
    inputSchema: mcpS_('', { taskId: { type: 'string' }, itemId: { type: 'string' }, outcome: { type: 'string' } }, ['taskId', 'itemId', 'outcome']) },
  { name: 'save_record', description: '通用写入：新建或合并更新任意一条记录（merge=true 时只改给出的字段）。不给 id 时新建。用前先看 desk_schema。',
    inputSchema: mcpS_('', { collection: { type: 'string', enum: ['goals', 'events', 'notes', 'tasks', 'kb_items', 'kbmeta'] }, id: { type: 'string' },
      data: { type: 'object' }, merge: { type: 'boolean', description: '默认 true' } }, ['collection', 'data']) },
  { name: 'delete_record', description: '删除一条记录。删除前务必先和用户确认。',
    inputSchema: mcpS_('', { collection: { type: 'string', enum: ['goals', 'events', 'notes', 'tasks', 'kb_items', 'kbmeta'] }, id: { type: 'string' } }, ['collection', 'id']) }
];

/* ---------- 实现 ---------- */
function mcpAll_() { var r = listAll_().collections, o = {}; for (var c in r) { o[c] = r[c].map(function (d) { var x = d.data || {}; x.id = d.id; return x; }); } return o; }
function mcpId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }
function mcpToday_() { return Utilities.formatDate(new Date(), MCP_TZ, 'yyyy-MM-dd'); }
function mcpDate_(k) { var p = k.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
function mcpWeek_(k) { var t = mcpDate_(k); var wd = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - wd); var y = t.getUTCFullYear(); var w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7); return y + '-W' + (w < 10 ? '0' : '') + w; }
function mcpWeekStart_(wk) { var y = +wk.slice(0, 4), w = +wk.slice(6); var j4 = new Date(Date.UTC(y, 0, 4)); var wd = j4.getUTCDay() || 7; j4.setUTCDate(j4.getUTCDate() - wd + 1 + (w - 1) * 7); return j4; }
function mcpKey_(d) { return d.toISOString().slice(0, 10); }
function mcpWeeksBetween_(a, b) { return Math.round((mcpWeekStart_(b) - mcpWeekStart_(a)) / (7 * 864e5)); }
function mcpPeriodFor_(level, day) { return level === 'month' ? day.slice(0, 7) : level === 'week' ? mcpWeek_(day) : day; }
function mcpRoute_(due) { var t = mcpToday_(); if (!due || due <= t) return { level: 'day', period: t }; var tw = mcpWeek_(t), dw = mcpWeek_(due); if (dw <= tw || mcpWeeksBetween_(tw, dw) === 1) return { level: 'week', period: dw }; return { level: 'month', period: due.slice(0, 7) }; }
function mcpOccurs_(e, k) {
  if ((e.except || []).indexOf(k) >= 0) return false;
  if (e.date === k) return true;
  if ((e.repeat !== 'weekly' && e.repeat !== 'biweekly') || !e.date || k < e.date) return false;
  var days = Math.round((mcpDate_(k) - mcpDate_(e.date)) / 864e5); return days % (e.repeat === 'biweekly' ? 14 : 7) === 0;
}
function mcpRoutinesFor_(all, level, key, day) {
  var meta = (all.kbmeta || []).filter(function (d) { return d.id === 'routines'; })[0];
  var items = (meta && meta.items) || [];
  return items.filter(function (r) {
    var lv = r.level || 'day'; if (lv !== level) return false;
    if (r.since && key < r.since) return false; if (r.until && key > r.until) return false;
    if ((r.skip || []).indexOf(key) >= 0) return false;
    if (lv === 'day' && r.days !== 'all') { var wd = mcpDate_(key).getUTCDay(); if (wd === 0 || wd === 6) return false; }
    if (lv === 'week' && r.every === 2 && r.since && mcpWeeksBetween_(r.since, key) % 2 !== 0) return false;
    return true;
  }).map(function (r) {
    var id = 'r-' + r.id + '-' + key; var doc = (all.goals || []).filter(function (g) { return g.id === id; })[0];
    return { id: id, title: r.title, status: doc ? doc.status : 'todo', routine: r.id, fixed: true };
  });
}
function mcpGoalsView_(all, level, key) {
  var list = mcpRoutinesFor_(all, level, key).concat((all.goals || []).filter(function (g) { return g.level === level && g.period === key && !g.routine; })
    .map(function (g) { return { id: g.id, title: g.title, status: g.status, due: g.due || undefined, delays: g.delays || undefined }; }));
  var done = list.filter(function (g) { return g.status === 'done'; }).length;
  return { period: key, done: done, total: list.length, items: list };
}
function mcpWrite_(ops) { return write_(ops); }

var MCP_IMPL = {
  desk_schema: function () {
    try { var r = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('README'); if (r) return r.getRange(1, 1, r.getLastRow(), 1).getValues().map(function (x) { return x[0]; }).join('\n'); } catch (e) {}
    return 'goals / events / notes / tasks / kb_items / kbmeta，字段见 README 分页。';
  },
  desk_today: function (a) {
    var day = a.date || mcpToday_(); var all = mcpAll_();
    var ev = (all.events || []).filter(function (e) { return mcpOccurs_(e, day); }).sort(function (x, y) { return (x.start || '') < (y.start || '') ? -1 : 1; })
      .map(function (e) {
        var t = (all.tasks || []).filter(function (t) { return t.eventId === e.id && t.evDate === day; })[0];
        return { eventId: e.id, title: e.title, start: e.start, end: e.end, kind: e.kind, place: e.place || undefined,
          topics: t ? { taskId: t.id, background: t.bg || '', items: (t.items || []).map(function (i) { return { itemId: i.id, text: i.text, outcome: i.outcome || undefined, files: (i.files || []).map(function (f) { return f.name; }) }; }) } : null };
      });
    var overdue = (all.goals || []).filter(function (g) { return g.level === 'day' && g.period < day && g.status !== 'done' && !g.routine; }).map(function (g) { return { id: g.id, title: g.title, period: g.period }; });
    return { date: day, today: mcpGoalsView_(all, 'day', day), week: mcpGoalsView_(all, 'week', mcpWeek_(day)), month: mcpGoalsView_(all, 'month', day.slice(0, 7)),
      overdue_day_goals: overdue, meetings: ev };
  },
  list_records: function (a) {
    var list = mcpAll_()[a.collection] || []; var w = a.where || {};
    list = list.filter(function (r) { for (var k in w) { if (String(r[k]) !== String(w[k])) return false; } return true; });
    return list.slice(0, a.limit || 100);
  },
  search: function (a) {
    var q = String(a.query || '').toLowerCase(); if (!q) throw new Error('请给关键词'); var all = mcpAll_(); var out = [];
    ['goals', 'notes', 'tasks', 'kb_items', 'events'].forEach(function (c) {
      (all[c] || []).forEach(function (r) { var s = JSON.stringify(r).toLowerCase(); if (s.indexOf(q) >= 0) out.push({ collection: c, id: r.id, title: r.title || r.text || r.summary || '', period: r.period || r.date || r.evDate || undefined }); });
    });
    return out.slice(0, a.limit || 50);
  },
  add_goal: function (a) {
    var r = a.level ? { level: a.level, period: a.period || mcpPeriodFor_(a.level, a.due && a.level === 'day' ? a.due : mcpToday_()) } : mcpRoute_(a.due);
    if (a.period) r.period = a.period;
    var id = mcpId_(), now = Date.now();
    var d = { level: r.level, period: r.period, title: a.title, status: 'todo', delays: 0, origin: r.period, history: [], order: now, createdAt: now, by: 'mcp' };
    if (a.due) d.due = a.due;
    mcpWrite_([{ op: 'set', coll: 'goals', id: id, data: d }]);
    return { id: id, level: r.level, period: r.period, title: a.title };
  },
  update_goal: function (a) {
    var all = mcpAll_(); var g = (all.goals || []).filter(function (x) { return x.id === a.id; })[0];
    if (!g) { // 固定目标的某一期还没被勾过时，表格里没有这一行，按模板补出来
      var m = /^r-(.+)-(\d{4}-(?:W\d{2}|\d{2}(?:-\d{2})?))$/.exec(a.id || '');
      var meta = (all.kbmeta || []).filter(function (d) { return d.id === 'routines'; })[0];
      var rt = m && meta && (meta.items || []).filter(function (r) { return r.id === m[1]; })[0];
      if (!rt) throw new Error('找不到这条目标：' + a.id);
      g = { id: a.id, level: rt.level || 'day', period: m[2], title: rt.title, status: 'todo', routine: rt.id, order: -1, createdAt: Date.now() };
    }
    var p = {};
    if (a.title) p.title = a.title;
    if (a.status) { p.status = a.status; p.doneAt = a.status === 'done' ? Date.now() : null; }
    if (a.period && a.period !== g.period) { p.period = a.period; p.delays = (g.delays || 0) + 1; p.history = (g.history || []).concat([g.period]); if (!g.origin) p.origin = g.period; }
    if (g.routine && !a.status) throw new Error('这是固定目标的某一期，只能改完成状态；改标题请改 kbmeta/routines');
    if (g.routine) { var full = {}; for (var k in g) if (k !== 'id') full[k] = g[k]; for (var k2 in p) full[k2] = p[k2]; mcpWrite_([{ op: 'set', coll: 'goals', id: a.id, data: full }]); }
    else mcpWrite_([{ op: 'update', coll: 'goals', id: a.id, data: p }]);
    return { id: a.id, updated: p };
  },
  add_note: function (a) {
    var id = mcpId_(), now = Date.now(), day = mcpToday_();
    var n = { date: day, quick: true, text: a.text, cat: a.cat || '', prog: a.prog || '', track: '', teams: [], people: '', meeting: '', task: !!a.task, due: a.task ? (a.due || '') : '', createdAt: now, done: false, goalId: '', by: 'mcp' };
    var ops = [{ op: 'set', coll: 'notes', id: id, data: n }];
    var res = { id: id };
    if (a.task) { var r = mcpRoute_(a.due); var gid = mcpId_(); var g = { level: r.level, period: r.period, title: a.text.slice(0, 200), status: 'todo', delays: 0, origin: r.period, history: [], order: now, createdAt: now, noteId: id }; if (a.due) g.due = a.due;
      ops.push({ op: 'set', coll: 'goals', id: gid, data: g }); n.goalId = gid; res.goal = { id: gid, level: r.level, period: r.period }; }
    mcpWrite_(ops); return res;
  },
  add_topic_item: function (a) {
    var all = mcpAll_(); var e = (all.events || []).filter(function (x) { return x.id === a.eventId; })[0]; if (!e) throw new Error('找不到这场会议：' + a.eventId);
    if (!mcpOccurs_(e, a.date)) throw new Error('这场会议在 ' + a.date + ' 没有安排');
    var t = (all.tasks || []).filter(function (x) { return x.eventId === a.eventId && x.evDate === a.date; })[0];
    var item = { id: mcpId_().slice(0, 12), text: a.text, done: false };
    if (!t) { var tid = mcpId_(); var d = { title: e.title, due: a.date, eventId: e.id, evDate: a.date, bg: a.background || '', items: [item], archived: false, createdAt: Date.now(), updatedAt: Date.now() };
      mcpWrite_([{ op: 'set', coll: 'tasks', id: tid, data: d }]); return { taskId: tid, itemId: item.id, created: true }; }
    var p = { items: (t.items || []).concat([item]), updatedAt: Date.now() }; if (a.background) p.bg = a.background;
    mcpWrite_([{ op: 'update', coll: 'tasks', id: t.id, data: p }]); return { taskId: t.id, itemId: item.id };
  },
  set_outcome: function (a) {
    var t = (mcpAll_().tasks || []).filter(function (x) { return x.id === a.taskId; })[0]; if (!t) throw new Error('找不到议题卡：' + a.taskId);
    var hit = false; var items = (t.items || []).map(function (i) { if (i.id === a.itemId) { hit = true; var c = {}; for (var k in i) c[k] = i[k]; c.outcome = a.outcome; return c; } return i; });
    if (!hit) throw new Error('这张议题卡里没有议题：' + a.itemId);
    mcpWrite_([{ op: 'update', coll: 'tasks', id: t.id, data: { items: items, updatedAt: Date.now() } }]); return { ok: true };
  },
  save_record: function (a) {
    var id = a.id || mcpId_(); var merge = a.merge !== false && !!a.id;
    mcpWrite_([{ op: merge ? 'update' : 'set', coll: a.collection, id: id, data: a.data || {} }]); return { id: id, merged: merge };
  },
  delete_record: function (a) { mcpWrite_([{ op: 'delete', coll: a.collection, id: a.id }]); return { deleted: a.id }; }
};
