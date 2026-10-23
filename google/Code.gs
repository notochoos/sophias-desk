/**
 * Sophia's Desk — Google 版后台（Google Apps Script）
 * 数据存在这个 Google 表格里：每个分页一种数据（goals、events、notes、tasks、kb_items、kbmeta），
 * 每行一条：id | 更新时间 | 摘要 | data（JSON）。附件存在云端硬盘「Sophia's Desk 附件」文件夹。
 * 你也可以直接在表格里查看、修改，或交给任何 AI 工具读写（改 data 列里的 JSON 即可）。
 */
var COLLS = ['goals', 'events', 'notes', 'tasks', 'kb_items', 'kbmeta'];
var HEAD = ['id', '更新时间', '摘要', 'data'];

function doGet(e) {
  if (e && e.parameter && e.parameter.api) return api_(e.parameter.key, e.parameter.action, JSON.parse(e.parameter.args || '[]'));
  if (!isOwner_()) return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">这个页面只对所有者开放。</p>');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle("Sophia's Desk")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 第一次使用前在编辑器里运行一次：建好各分页和说明页 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  COLLS.forEach(function (c) { sheet_(c); });
  var r = ss.getSheetByName('README') || ss.insertSheet('README', 0);
  r.clear();
  r.getRange(1, 1, 9, 1).setValues([
    ["Sophia's Desk 数据说明（给人和 AI 工具看）"],
    ['每个分页是一类数据，每行一条记录：id（唯一编号）| 更新时间 | 摘要（只读，方便浏览）| data（这条记录的全部字段，JSON 格式）。'],
    ['goals：月/周/日目标。level = month | week | day；period = 2026-10 / 2026-W43 / 2026-10-23；status = todo | done；routine = 固定目标的模板 id。'],
    ['events：日程。date 首次日期，start/end 时间，repeat = weekly | biweekly，except = 跳过的日期。'],
    ['tasks：会议议题卡。eventId + evDate 对应某场会议；bg 背景；items = 议题列表（text、outcome 会后结论、files 附件）。'],
    ['notes：速记 / 旧记事本。cat = rule | case | idea | doubt；task、due、goalId 关联目标。'],
    ['kb_items：知识库条目（title、summary、detail、cases、sources、history）。'],
    ['kbmeta：设置。routines = 固定目标模板列表；config = 知识库目录。'],
    ['修改方法：直接改 data 列的 JSON（保持合法 JSON），保存后网页 20 秒内自动刷新。删除一行 = 删除这条记录。']
  ]);
  r.setColumnWidth(1, 900);
  folder_();
  stampNow_();
  return 'ok';
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 4).setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(3, 360);
    sh.setColumnWidth(4, 600);
  }
  return sh;
}

function folder_() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder("Sophia's Desk 附件");
  p.setProperty('FOLDER_ID', f.getId());
  return f;
}

function stampNow_() { PropertiesService.getScriptProperties().setProperty('STAMP', String(Date.now())); }
/** 你在表格里手动修改时，通知网页刷新 */
function onEdit() { stampNow_(); }

function stamp_() { return PropertiesService.getScriptProperties().getProperty('STAMP') || '0'; }

function summary_(d) {
  var s = d.title || d.text || d.summary || '';
  if (!s && d.items && d.items.length) s = d.items.length + ' 项';
  if (d.period) s = '[' + d.period + '] ' + s;
  if (d.date && !d.period) s = '[' + d.date + (d.start ? ' ' + d.start : '') + '] ' + s;
  return String(s).slice(0, 300);
}

function listAll_() {
  var out = {};
  COLLS.forEach(function (c) {
    var sh = sheet_(c);
    var n = sh.getLastRow();
    var rows = n > 1 ? sh.getRange(2, 1, n - 1, 4).getValues() : [];
    out[c] = [];
    rows.forEach(function (r) {
      if (!r[0]) return;
      try { out[c].push({ id: String(r[0]), data: JSON.parse(r[3] || '{}') }); } catch (e) {}
    });
  });
  return { stamp: stamp_(), collections: out };
}

function findRow_(sh, id) {
  var n = sh.getLastRow();
  if (n < 2) return 0;
  var hit = sh.getRange(2, 1, n - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

/** ops: [{op:'set'|'update'|'delete', coll, id, data}] */
function write_(ops) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ops.forEach(function (o) {
      if (COLLS.indexOf(o.coll) < 0) throw new Error('unknown collection ' + o.coll);
      var sh = sheet_(o.coll);
      var row = findRow_(sh, o.id);
      if (o.op === 'delete') { if (row) sh.deleteRow(row); return; }
      var data = o.data || {};
      if (o.op === 'update' && row) {
        var cur = {};
        try { cur = JSON.parse(sh.getRange(row, 4).getValue() || '{}'); } catch (e) {}
        for (var k in data) cur[k] = data[k];
        data = cur;
      }
      var json = JSON.stringify(data);
      if (json.length > 49000) throw new Error('这条记录太长（超过 Google 表格单格上限），请拆分');
      var vals = [[o.id, new Date(), summary_(data), json]];
      if (row) sh.getRange(row, 1, 1, 4).setValues(vals);
      else sh.appendRow(vals[0]);
    });
    stampNow_();
  } finally { lock.releaseLock(); }
  return stamp_();
}

/** 导入备份：用备份里的数据覆盖全部分页 */
function importAll_(collections) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    COLLS.forEach(function (c) {
      var sh = sheet_(c);
      var n = sh.getLastRow();
      if (n > 1) sh.getRange(2, 1, n - 1, 4).clearContent();
      var list = collections[c] || [];
      var rows = list.map(function (d) {
        var id = d.id; var data = {};
        for (var k in d) if (k !== 'id') data[k] = d[k];
        return [id, new Date(), summary_(data), JSON.stringify(data)];
      });
      if (rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);
    });
    stampNow_();
  } finally { lock.releaseLock(); }
  return true;
}

function uploadB64_(name, mime, b64) {
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime || 'application/octet-stream', name || 'file');
  return folder_().createFile(blob).getId();
}
function uploadText_(name, text) { return folder_().createFile(name, text, 'application/json').getId(); }
function fileText_(id) { return DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'); }
function fileB64_(id) { return Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()); }
/** 移除附件：放进云端硬盘回收站（30 天内可恢复） */
function trashFile_(id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} return true; }
function saveBackup_(name, json) { return folder_().createFile(name, json, 'application/json').getUrl(); }

/* ---------- 网页调用（只有所有者） ---------- */
function isOwner_() {
  var a = Session.getActiveUser().getEmail(), me = Session.getEffectiveUser().getEmail();
  return !!a && a === me;
}
function guard_() { if (!isOwner_()) throw new Error('没有权限'); }
function listAll() { guard_(); return listAll_(); }
function stamp() { guard_(); return stamp_(); }
function write(ops) { guard_(); return write_(ops); }
function importAll(c) { guard_(); return importAll_(c); }
function uploadB64(n, m, b) { guard_(); return uploadB64_(n, m, b); }
function uploadText(n, t) { guard_(); return uploadText_(n, t); }
function fileText(id) { guard_(); return fileText_(id); }
function fileB64(id) { guard_(); return fileB64_(id); }
function trashFile(id) { guard_(); return trashFile_(id); }
function saveBackup(n, j) { guard_(); return saveBackup_(n, j); }

/* ---------- 数据接口（给其它网页 / AI 工具用，凭密钥访问） ----------
 * 1. 在编辑器里选 makeApiKey 运行一次，到「执行日志」里复制密钥
 * 2. 另建一个部署：Web 应用，执行身份「我」，谁有权访问「任何人」
 * 3. 用那个部署的网址 + 密钥连接。密钥泄露了就再运行一次 makeApiKey 换一个
 * 请求：POST 网址，正文 JSON {"key":"…","action":"listAll","args":[]}（Content-Type 用 text/plain）
 * 也可以 GET：网址?api=1&key=…&action=listAll
 */
var API_ACTIONS = { listAll: listAll_, stamp: stamp_, write: write_, importAll: importAll_, uploadB64: uploadB64_, uploadText: uploadText_, fileText: fileText_, fileB64: fileB64_, trashFile: trashFile_, saveBackup: saveBackup_ };
function makeApiKey() {
  var k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  PropertiesService.getScriptProperties().setProperty('API_KEY', k);
  Logger.log('你的数据接口密钥：' + k);
  return k;
}
function api_(key, action, args) {
  var out;
  try {
    var real = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!real || key !== real) throw new Error('密钥不对');
    if (!API_ACTIONS[action]) throw new Error('不支持的操作 ' + action);
    out = { ok: true, result: API_ACTIONS[action].apply(null, args || []) };
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (x) {}
  if (e.parameter && e.parameter.mcp) return mcpHttp_(e.parameter.mcp, body);
  return api_(body.key, body.action, body.args);
}
