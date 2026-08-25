/* ============================================================
 *  乳腺健康自查小程序 - 后端服务（零依赖 Node http）
 *  单数据源：data/db.json
 *  - 托管小程序静态文件（根目录）
 *  - 托管后台管理界面（/admin）
 *  - 提供 /api REST 接口
 * ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
// 云托管可通过环境变量 DB_PATH 指向持久化挂载卷（如 /data/db.json），容器重启数据不丢
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'db.json');
const PORT = process.env.PORT || 8123;

/* ---------------- 数据库（同步读写，单进程安全） ---------------- */
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    // 文件缺失（云托管持久卷首次为空）：回退到仓库内置种子，避免进程直接退出
    const seedPath = path.join(ROOT, 'data', 'db.json');
    try {
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      try { fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), 'utf8'); } catch (_) {}
      console.log('db.json 缺失，已用仓库种子初始化 ->', DB_PATH);
      return seed;
    } catch (e2) {
      console.error('读取 db.json 失败且无种子:', e.message);
      process.exit(1);
    }
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}
let DB = loadDB();

/* ---------------- 账号 / 角色 / 权限 / 日志 ---------------- */
const crypto = require('crypto');
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

/* 权限点（与后台角色管理一致，单一可信源） */
const ALL_PERMS = [
  'dashboard.read', 'questionnaire.read', 'questionnaire.write',
  'hospitals.read', 'hospitals.write', 'articles.read', 'articles.write',
  'tutorials.read', 'tutorials.write', 'archive.read',
  'links.read', 'links.write', 'accounts.read', 'accounts.write',
  'roles.read', 'roles.write', 'logs.read'
];
const DEFAULT_ROLES = [
  { key: 'super', name: '超级管理员', perms: ALL_PERMS.slice() },
  { key: 'editor', name: '内容编辑', perms: ['dashboard.read', 'questionnaire.read', 'questionnaire.write', 'hospitals.read', 'hospitals.write', 'articles.read', 'articles.write', 'tutorials.read', 'tutorials.write', 'archive.read', 'links.read', 'links.write'] },
  { key: 'viewer', name: '只读访客', perms: ['dashboard.read', 'questionnaire.read', 'hospitals.read', 'articles.read', 'tutorials.read', 'archive.read', 'links.read', 'logs.read'] }
];

function rolePerms(roleKey) {
  const r = (DB.roles || []).find(x => x.key === roleKey);
  return (r && Array.isArray(r.perms)) ? r.perms : [];
}
function publicAccount(a) {
  const direct = Array.isArray(a.perms) ? a.perms : [];
  const perms = a.role === 'super' ? ALL_PERMS.slice() : rolePerms(a.role).concat(direct);
  return { id: a.id, username: a.username, name: a.name, role: a.role, perms: [...new Set(perms)], disabled: !!a.disabled };
}
function hasPerm(a, perm) {
  if (!a) return false;
  if (a.role === 'super') return true;
  return publicAccount(a).perms.includes(perm);
}
function accountByToken(token) {
  if (!token) return null;
  return (DB.accounts || []).find(a => a.token === token) || null;
}
function logAction(acc, action, target, detail) {
  if (!DB.logs) DB.logs = [];
  DB.logs.unshift({
    id: genId('log'),
    time: new Date().toISOString(),
    accountId: acc ? acc.id : '',
    username: acc ? acc.username : '(系统/匿名)',
    action, target: String(target || ''), detail: String(detail || '').slice(0, 300)
  });
  if (DB.logs.length > 3000) DB.logs = DB.logs.slice(0, 3000);
  saveDB(DB);
}

/* 确保 settings 含外网链接字段（后台「外网链接管理」使用） */
if (!DB.settings) DB.settings = {};
if (typeof DB.settings.publicLink !== 'string') DB.settings.publicLink = '';
if (typeof DB.settings.adminLink !== 'string') DB.settings.adminLink = '';
if (typeof DB.settings.publicNote !== 'string') DB.settings.publicNote = '';

/* 默认角色（首次启动 seed，之后以 db.json 为准，可在后台「角色管理」编辑） */
if (!Array.isArray(DB.roles) || DB.roles.length === 0) {
  DB.roles = JSON.parse(JSON.stringify(DEFAULT_ROLES));
}
/* 默认超级管理员（token 沿用 settings.adminToken，兼容旧会话；密码沿用 settings.adminPassword） */
if (!Array.isArray(DB.accounts) || DB.accounts.length === 0) {
  DB.accounts = [{
    id: genId('acc'),
    username: 'admin',
    name: '超级管理员',
    role: 'super',
    password: sha256(DB.settings.adminPassword || 'admin123'),
    token: DB.settings.adminToken || 'BCS_ADMIN_TOKEN_2026',
    disabled: false,
    createdAt: new Date().toISOString()
  }];
}
if (!Array.isArray(DB.logs)) DB.logs = [];

saveDB(DB);

/* ---------------- 工具 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 8 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}
function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* 规范化患者基本信息（年龄/身高/体重/BMI，BMI 由前端计算后随请求上报，服务端仅存储） */
function normalizeBasicInfo(b) {
  const src = (b && typeof b === 'object') ? b : {};
  const bi = (src.basicInfo && typeof src.basicInfo === 'object') ? src.basicInfo : {};
  const num = (v) => (v === undefined || v === null || v === '') ? '' : String(v);
  return {
    age: num(bi.age != null ? bi.age : src.age),
    height: num(bi.height),
    weight: num(bi.weight),
    bmi: num(bi.bmi)
  };
}

/* 服务端风险评估（与小程序 data.js 的 getRiskAssessment 保持一致）
 * 依据 A/B/C/D/E/F 证据类，按 F → DE(乳腺可能有疾病) → A/B 或 C≥2 → 一般 优先级判定。 */
function assess(answers) {
  const questionnaire = DB.questionnaire || [];
  const categories = DB.riskCategories || [];
  const config = DB.riskConfig || { cMinCount: 2 };
  const trig = {};
  let cCount = 0;
  for (const q of questionnaire) {
    const ai = answers ? answers[q.id] : undefined;
    if (ai == null || ai === undefined) continue;
    const opt = q.options[Number(ai)];
    if (!opt) continue;
    // 激素替代治疗（q10/q11/q12）为组合判定，单选项不触发证据
    if (q.id === 'q10' || q.id === 'q11' || q.id === 'q12') continue;
    // 适用性保护：仅当适用前提成立时才计分，避免不适人群误答误判
    if (q.id === 'q4' && answers['q3'] !== 0) continue;     // 仅“已绝经”时计绝经年龄
    if (q.id === 'q16' && answers['q15'] !== 0) continue;   // 仅“有溢液”时计血性溢液
    if (opt.evidence) {
      trig[opt.evidence] = true;
      if (opt.evidence === 'C') cCount++;
    } else if (opt.risk === true) {
      trig['F'] = true;
    }
  }
  // 激素替代治疗组合判定（与 q10/q11/q12 联动）
  const q10 = answers ? answers['q10'] : undefined;
  const q11 = answers ? answers['q11'] : undefined;
  const q12 = answers ? answers['q12'] : undefined;
  if (q10 === 0 && q12 !== undefined && q12 !== null) {
    if (q11 === 0 && (q12 === 1 || q12 === 2)) trig['B'] = true;            // 雌孕激素联合且 ≥ 半年 → B 类
    if (q11 === 1 && (q12 === 1 || q12 === 2)) { trig['C'] = true; cCount++; }  // 单纯雌激素且 ≥ 半年 → C 类
  }
  const cMin = config.cMinCount || 2;
  let key, rule;
  if (trig['F']) { key = 'F'; rule = 'F 类确诊证据 → 判定确诊疾病人群，请到专科医院诊治'; }
  else if (trig['D'] || trig['E']) { key = 'DE'; rule = 'D/E 类证据（影像/体征可疑或高度可疑）→ 判定乳腺可能有疾病，近期就诊'; }
  else {
    const ab = trig['A'] || trig['B'];
    if (ab) { key = '高危'; rule = 'A/B 类证据任意一项触发 → 判定乳腺癌高危风险人群'; }
    else if (cCount >= cMin) { key = '高危'; rule = 'C 类证据累计 ≥' + cMin + ' 项同时触发 → 判定乳腺癌高危风险人群'; }
    else { key = '一般'; rule = '未触发任何 A/B/C/D/E/F 证据类 → 乳腺癌一般风险人群'; }
  }
  const cat = categories.find(c => c.key === key) || categories[categories.length - 1] || { key, label: key };
  return {
    key: cat.key, label: cat.label, color: cat.color || '#888',
    headline: cat.headline || '', detail: cat.detail || '',
    score: Object.keys(trig).length, triggered: Object.keys(trig), cCount, rule, cMin
  };
}

/* 规范化风险分类（4 类文案，后台可编辑：F / DE / 高危 / 一般） */
function normalizeCategories(arr) {
  const order = ['F', 'DE', '高危', '一般'];
  const t = (arr || []).map(x => ({
    key: String(x.key || ''),
    label: String(x.label || '').slice(0, 30),
    color: String(x.color || '#888888').slice(0, 32),
    headline: String(x.headline || '').slice(0, 120),
    detail: String(x.detail || '').slice(0, 1000)
  }));
  t.forEach((x, i) => { if (!x.key) x.key = 'cat' + i; });
  t.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const seen = {};
  t.forEach((x) => { let k = x.key || 'cat'; if (seen[k]) { let i = 1; while (seen[k + i]) i++; k = k + i; } seen[k] = true; x.key = k; });
  return t;
}
function normalizeConfig(c) {
  c = c || {};
  return {
    cMinCount: Number.isFinite(Number(c.cMinCount)) ? Number(c.cMinCount) : 2
  };
}

/* ---------------- 鉴权（按账号 token） ---------------- */
function requireAuth(req, res) {
  const acc = accountByToken(req.headers['x-admin-token'] || '');
  if (!acc) { sendJSON(res, 401, { error: '未授权，请先登录' }); return null; }
  return acc;
}
function requirePerm(req, res, perm) {
  const acc = requireAuth(req, res);
  if (!acc) return null;
  if (!hasPerm(acc, perm)) { sendJSON(res, 403, { error: '无权限执行该操作（需要权限：' + perm + '）' }); return null; }
  return acc;
}

/* ---------------- 静态文件 ---------------- */
function serveStatic(req, res, pathname) {
  // 目录型路由补斜杠，保证相对资源（admin.css/admin.js）路径解析正确
  if (pathname === '/admin') {
    res.writeHead(301, { Location: '/admin/' });
    return res.end();
  }
  let filePath;
  if (pathname === '/' || pathname === '/index.html') filePath = path.join(ROOT, 'index.html');
  else if (pathname === '/admin' || pathname === '/admin/') filePath = path.join(ROOT, 'admin', 'index.html');
  else if (pathname.startsWith('/admin/')) filePath = path.join(ROOT, 'admin', pathname.slice('/admin/'.length));
  else if (pathname.startsWith('/uploads/')) filePath = path.join(ROOT, 'data', pathname.slice(1)); // 教程上传图片等静态资源（data/uploads/）
  else filePath = path.join(ROOT, pathname);

  // 防目录穿越
  filePath = path.normalize(filePath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); return res.end('Not Found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------- API 路由 ---------------- */
async function handleApi(req, res, parsed) {
  const method = req.method;
  const p = parsed.pathname;          // 例如 /api/hospitals/h1
  const segments = p.split('/').filter(Boolean); // ['api','hospitals','h1']
  const resource = segments[1] || '';
  const id = segments[2] || '';

  // 登录（用户名 + 密码；成功返回该账号 token 与权限）
  if (resource === 'login' && method === 'POST') {
    const body = await readBody(req);
    const username = String(body.username || '').trim();
    const acc = (DB.accounts || []).find(a => a.username === username);
    if (!acc || acc.password !== sha256(body.password || '') || acc.disabled) {
      logAction(null, 'login_fail', 'account', username);
      return sendJSON(res, 403, { ok: false, error: (acc && acc.disabled) ? '账号已停用' : '用户名或密码错误' });
    }
    logAction(acc, 'login', 'account', '');
    return sendJSON(res, 200, { ok: true, token: acc.token, account: publicAccount(acc) });
  }

  // 当前账号信息（前端拉取权限用于导航/按钮控制）
  if (resource === 'me' && method === 'GET') {
    const acc = requireAuth(req, res);
    if (!acc) return;
    return sendJSON(res, 200, publicAccount(acc));
  }

  // 公开配置（小程序启动拉取）
  if (resource === 'config' && method === 'GET') {
    return sendJSON(res, 200, {
      questionnaire: DB.questionnaire,
      hospitals: DB.hospitals,
      articles: DB.articles,
      tutorials: DB.tutorials,
      riskCategories: DB.riskCategories,
      riskConfig: DB.riskConfig,
      scaleMeta: DB.scaleMeta || null,
      publicLink: DB.settings.publicLink,
      adminLink: DB.settings.adminLink
    });
  }

  // 外网链接管理（后台设置：用户访问地址 / 后台管理地址 / 分享说明）
  if (resource === 'settings') {
    if (method === 'GET') {
      if (!requirePerm(req, res, 'links.read')) return;
      return sendJSON(res, 200, {
        publicLink: DB.settings.publicLink,
        adminLink: DB.settings.adminLink,
        publicNote: DB.settings.publicNote
      });
    }
    if (method === 'PUT') {
      const acc = requirePerm(req, res, 'links.write'); if (!acc) return;
      const b = await readBody(req);
      if (b.publicLink != null) DB.settings.publicLink = String(b.publicLink).slice(0, 500);
      if (b.adminLink != null) DB.settings.adminLink = String(b.adminLink).slice(0, 500);
      if (b.publicNote != null) DB.settings.publicNote = String(b.publicNote).slice(0, 300);
      saveDB(DB);
      logAction(acc, 'links_update', 'settings', '更新外网链接');
      return sendJSON(res, 200, {
        ok: true,
        publicLink: DB.settings.publicLink,
        adminLink: DB.settings.adminLink,
        publicNote: DB.settings.publicNote
      });
    }
  }

  // 问卷题库（小程序读取已发布版本；后台支持草稿 / 发布 / 放弃）
  if (resource === 'questionnaire') {
    if (method === 'GET' && !id) return sendJSON(res, 200, DB.questionnaire); // 已发布（小程序用）
    if (method === 'GET' && id === 'draft') { if (!requirePerm(req, res, 'questionnaire.read')) return; return sendJSON(res, 200, { data: DB.questionnaireDraft || DB.questionnaire, dirty: !!DB.questionnaireDraft }); }
    const acc = requirePerm(req, res, 'questionnaire.write'); if (!acc) return;
    if (method === 'PUT' && !id) { // 保存到草稿（不发布）
      const b = await readBody(req);
      if (!Array.isArray(b) || b.length === 0) return sendJSON(res, 400, { error: '问卷数据格式错误' });
      const clean = [];
      for (let i = 0; i < b.length; i++) {
        const q = b[i];
        if (!q || typeof q.q !== 'string' || !q.q.trim()) return sendJSON(res, 400, { error: '第 ' + (i + 1) + ' 题题干不能为空' });
        const opts = Array.isArray(q.options) ? q.options : [];
        if (opts.length < 1) return sendJSON(res, 400, { error: '第 ' + (i + 1) + ' 题至少需要一个选项' });
        const options = opts.map(o => ({
          text: String(o.text || '').trim() || '选项',
          evidence: String(o.evidence || '').slice(0, 8),
          risk: !!o.risk
        }));
        const no = q.no ? String(q.no).slice(0, 8) : ('Q' + (i + 1));
        const sc = q.sc ? String(q.sc).slice(0, 40) : '';
        const evidenceClass = q.evidenceClass ? String(q.evidenceClass).slice(0, 24) : '';
        const rule = q.rule ? String(q.rule).slice(0, 60) : '';
        const maxScore = (q.maxScore === null || q.maxScore === undefined || q.maxScore === '') ? null : (Number(q.maxScore) || 0);
        const showIf = (q.showIf && q.showIf.q) ? { q: String(q.showIf.q).slice(0, 8), in: Array.isArray(q.showIf.in) ? q.showIf.in.map(Number) : [] } : undefined;
        clean.push({
          id: String(q.id || ('q' + (i + 1))).trim() || ('q' + (i + 1)),
          no, sc, evidenceClass, rule, maxScore,
          section: String(q.section || '').slice(0, 30),
          type: q.type === 'bool' ? 'bool' : 'single',
          evidence: String(q.evidence || '').slice(0, 8),
          showIf,
          skipRest: !!q.skipRest,
          q: q.q.trim(),
          options
        });
      }
      DB.questionnaireDraft = clean; saveDB(DB);
      logAction(acc, 'questionnaire_draft_save', 'questionnaire', '保存问卷草稿');
      return sendJSON(res, 200, { data: clean, dirty: true });
    }
    if (method === 'POST' && id === 'publish') {
      if (!DB.questionnaireDraft) return sendJSON(res, 400, { error: '没有待发布的问卷草稿' });
      DB.questionnaire = DB.questionnaireDraft; DB.questionnaireDraft = null; saveDB(DB);
      logAction(acc, 'questionnaire_publish', 'questionnaire', '发布问卷到小程序');
      return sendJSON(res, 200, { data: DB.questionnaire, dirty: false });
    }
    if (method === 'POST' && id === 'discard') {
      DB.questionnaireDraft = null; saveDB(DB);
      logAction(acc, 'questionnaire_discard', 'questionnaire', '放弃问卷草稿');
      return sendJSON(res, 200, { data: DB.questionnaire, dirty: false });
    }
  }

  // 风险分类与文案（5 类：F/E/D/高危/一般；后台可编辑；支持草稿 / 发布 / 放弃）
  if (resource === 'risk-categories') {
    if (method === 'GET' && !id) return sendJSON(res, 200, DB.riskCategories);
    if (method === 'GET' && id === 'draft') { if (!requirePerm(req, res, 'questionnaire.read')) return; return sendJSON(res, 200, { data: DB.riskCategoriesDraft || DB.riskCategories, dirty: !!DB.riskCategoriesDraft }); }
    const acc = requirePerm(req, res, 'questionnaire.write'); if (!acc) return;
    if (method === 'PUT' && !id) { // 保存到草稿（不发布）
      const b = await readBody(req);
      if (!Array.isArray(b) || b.length === 0) return sendJSON(res, 400, { error: '风险分类格式错误' });
      const clean = normalizeCategories(b);
      DB.riskCategoriesDraft = clean; saveDB(DB);
      logAction(acc, 'risk_categories_draft_save', 'riskCategories', '保存风险分类草稿');
      return sendJSON(res, 200, { data: clean, dirty: true });
    }
    if (method === 'POST' && id === 'publish') {
      if (!DB.riskCategoriesDraft) return sendJSON(res, 400, { error: '没有待发布的风险分类草稿' });
      DB.riskCategories = normalizeCategories(DB.riskCategoriesDraft); DB.riskCategoriesDraft = null; saveDB(DB);
      logAction(acc, 'risk_categories_publish', 'riskCategories', '发布风险分类');
      return sendJSON(res, 200, { data: DB.riskCategories, dirty: false });
    }
    if (method === 'POST' && id === 'discard') {
      DB.riskCategoriesDraft = null; saveDB(DB);
      logAction(acc, 'risk_categories_discard', 'riskCategories', '放弃风险分类草稿');
      return sendJSON(res, 200, { data: DB.riskCategories, dirty: false });
    }
  }

  // 判定参数（scoreThreshold / cMinCount / maxScore；后台可编辑；支持草稿 / 发布 / 放弃）
  if (resource === 'risk-config') {
    if (method === 'GET' && !id) return sendJSON(res, 200, DB.riskConfig);
    if (method === 'GET' && id === 'draft') { if (!requirePerm(req, res, 'questionnaire.read')) return; return sendJSON(res, 200, { data: DB.riskConfigDraft || DB.riskConfig, dirty: !!DB.riskConfigDraft }); }
    const acc = requirePerm(req, res, 'questionnaire.write'); if (!acc) return;
    if (method === 'PUT' && !id) { // 保存到草稿（不发布）
      const b = await readBody(req);
      const clean = normalizeConfig(b);
      DB.riskConfigDraft = clean; saveDB(DB);
      logAction(acc, 'risk_config_draft_save', 'riskConfig', '保存判定参数草稿');
      return sendJSON(res, 200, { data: clean, dirty: true });
    }
    if (method === 'POST' && id === 'publish') {
      if (!DB.riskConfigDraft) return sendJSON(res, 400, { error: '没有待发布的判定参数草稿' });
      DB.riskConfig = normalizeConfig(DB.riskConfigDraft); DB.riskConfigDraft = null; saveDB(DB);
      logAction(acc, 'risk_config_publish', 'riskConfig', '发布判定参数');
      return sendJSON(res, 200, { data: DB.riskConfig, dirty: false });
    }
    if (method === 'POST' && id === 'discard') {
      DB.riskConfigDraft = null; saveDB(DB);
      logAction(acc, 'risk_config_discard', 'riskConfig', '放弃判定参数草稿');
      return sendJSON(res, 200, { data: DB.riskConfig, dirty: false });
    }
  }

  // 评分计算（按《评分规则总表》证据优先级：F→E→D→A/B→C累积→积分，单一可信源）
  // 入参 { answers: { q1: 选项下标, ... } }，返回完整评估（总分 / 触发证据 / 命中规则 / 风险等级 / 处理建议）
  if (resource === 'score' && method === 'POST') {
    const b = await readBody(req);
    const a = assess(b.answers || {});
    return sendJSON(res, 200, a);
  }

  // 医院
  if (resource === 'hospitals') {
    if (method === 'GET') return sendJSON(res, 200, DB.hospitals);
    const acc = requirePerm(req, res, 'hospitals.write'); if (!acc) return;
    if (method === 'POST') {
      const b = await readBody(req);
      const h = {
        id: genId('h'),
        name: String(b.name || '').trim() || '未命名医院',
        city: String(b.city || '').trim(),
        level: String(b.level || '').trim(),
        department: String(b.department || '').trim(),
        address: String(b.address || '').trim(),
        phone: String(b.phone || '').trim(),
        lat: Number(b.lat) || 0, lng: Number(b.lng) || 0,
        note: String(b.note || '').trim()
      };
      DB.hospitals.push(h); saveDB(DB);
      logAction(acc, 'hospital_create', 'hospital', h.name);
      return sendJSON(res, 200, h);
    }
    if ((method === 'PUT' || method === 'DELETE') && id) {
      const idx = DB.hospitals.findIndex((x) => x.id === id);
      if (idx < 0) return sendJSON(res, 404, { error: '医院不存在' });
      if (method === 'DELETE') { const nm = DB.hospitals[idx].name; DB.hospitals.splice(idx, 1); saveDB(DB); logAction(acc, 'hospital_delete', 'hospital', nm); return sendJSON(res, 200, { ok: true }); }
      const b = await readBody(req);
      DB.hospitals[idx] = { ...DB.hospitals[idx], ...b, id };
      saveDB(DB); logAction(acc, 'hospital_update', 'hospital', DB.hospitals[idx].name); return sendJSON(res, 200, DB.hospitals[idx]);
    }
  }

  // 资讯（科普 / 新闻）
  if (resource === 'articles') {
    if (method === 'GET') {
      const type = parsed.query.type;
      if (type) return sendJSON(res, 200, DB.articles[type] || []);
      return sendJSON(res, 200, DB.articles);
    }
    const acc = requirePerm(req, res, 'articles.write'); if (!acc) return;
    if (method === 'POST') {
      const b = await readBody(req);
      const type = b.type === 'news' ? 'news' : 'science';
      const a = {
        id: genId(type === 'news' ? 'n' : 's'), type,
        title: String(b.title || '').trim() || '未命名',
        summary: String(b.summary || '').trim(),
        content: String(b.content || '').trim(),
        tag: type === 'science' ? (String(b.tag || '').trim() || '科普') : undefined,
        source: type === 'news' ? (String(b.source || '').trim() || '来源待补充') : undefined,
        date: type === 'news' ? (String(b.date || '').trim() || new Date().toISOString().slice(0, 7)) : undefined
      };
      DB.articles[type].unshift(a); saveDB(DB);
      logAction(acc, 'article_create', 'article', a.title);
      return sendJSON(res, 200, a);
    }
    if ((method === 'PUT' || method === 'DELETE') && id) {
      const types = ['science', 'news'];
      let found = null, ftype = null, fidx = -1;
      for (const t of types) {
        const i = DB.articles[t].findIndex((x) => x.id === id);
        if (i >= 0) { found = DB.articles[t][i]; ftype = t; fidx = i; break; }
      }
      if (!found) return sendJSON(res, 404, { error: '资讯不存在' });
      if (method === 'DELETE') { DB.articles[ftype].splice(fidx, 1); saveDB(DB); logAction(acc, 'article_delete', 'article', found.title); return sendJSON(res, 200, { ok: true }); }
      const b = await readBody(req);
      DB.articles[ftype][fidx] = { ...found, ...b, id, type: ftype };
      saveDB(DB); logAction(acc, 'article_update', 'article', found.title); return sendJSON(res, 200, DB.articles[ftype][fidx]);
    }
  }

  // 教程（步骤图片 + 标题/文字，已去除示范视频）
  if (resource === 'tutorials') {
    if (method === 'GET') return sendJSON(res, 200, DB.tutorials);
    const acc = requirePerm(req, res, 'tutorials.write'); if (!acc) return;
    // 图片上传：接收 base64 data URL，保存到 data/uploads/，返回可访问的相对路径
    if (method === 'POST' && id === 'upload') {
      const b = await readBody(req);
      const dataUrl = (b && b.dataUrl) || '';
      const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
      if (!m) return sendJSON(res, 400, { error: '无效的图片数据' });
      const mime = m[1];
      const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
      const ext = extMap[mime] || 'png';
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 5 * 1024 * 1024) return sendJSON(res, 400, { error: '图片过大（上限 5MB）' });
      const dir = path.join(ROOT, 'data', 'uploads');
      fs.mkdirSync(dir, { recursive: true });
      const fname = genId('tut') + '.' + ext;
      fs.writeFileSync(path.join(dir, fname), buf);
      return sendJSON(res, 200, { url: '/uploads/' + fname, size: buf.length });
    }
    if (method === 'PUT') {
      const b = await readBody(req);
      if (!Array.isArray(b.steps)) return sendJSON(res, 400, { error: '步骤数据格式错误' });
      const existing = DB.tutorials.steps || [];
      const byId = {};
      existing.forEach((s) => { if (s && s.id) byId[s.id] = s; });
      const newSteps = b.steps.map((nb) => {
        const prev = (nb && nb.id && byId[nb.id]) ? byId[nb.id] : {};
        const id2 = (nb && nb.id && byId[nb.id]) ? nb.id : genId('t');
        const type = (nb && nb.type && typeof nb.type === 'string') ? nb.type.slice(0, 16) : (prev.type || 'custom');
        return {
          id: id2,
          type,
          title: String(nb && nb.title != null ? nb.title : (prev.title || '')).slice(0, 80),
          desc: String(nb && nb.desc != null ? nb.desc : (prev.desc || '')).slice(0, 800),
          image: String(nb && nb.image != null ? nb.image : (prev.image || ''))
        };
      });
      DB.tutorials = { steps: newSteps };
      saveDB(DB); logAction(acc, 'tutorials_save', 'tutorials', newSteps.length + ' 个步骤'); return sendJSON(res, 200, DB.tutorials);
    }
  }

  // 用户 upsert（小程序保存资料时调用）
  if (resource === 'users' && method === 'POST') {
    const b = await readBody(req);
    const uid = String(b.uid || '').trim();
    if (!uid) return sendJSON(res, 400, { error: '缺少 uid' });
    if (!DB.users[uid]) DB.users[uid] = { uid, createdAt: new Date().toISOString() };
    DB.users[uid].name = String(b.name || DB.users[uid].name || '匿名用户').slice(0, 20);
    DB.users[uid].age = b.age != null ? String(b.age) : DB.users[uid].age;
    DB.users[uid].lastActive = new Date().toISOString();
    saveDB(DB);
    return sendJSON(res, 200, DB.users[uid]);
  }

  // 问卷提交
  if (resource === 'submissions') {
    if (method === 'POST') {
      const b = await readBody(req);
      const uid = String(b.uid || '').trim() || genId('u');
      const answers = b.answers || {};
      const a = assess(answers);   // 服务端按证据规则权威计算（单一可信源）
      const basicInfo = normalizeBasicInfo(b);
      const rec = {
        id: genId('sub'),
        uid,
        name: String(b.name || '匿名用户').slice(0, 20),
        age: basicInfo.age,
        basicInfo,
        answers,
        score: a.score,
        levelKey: a.key,
        level: a.label,
        riskColor: a.color,
        triggered: a.triggered,
        date: String(b.date || new Date().toISOString())
      };
      DB.submissions.unshift(rec);
      if (DB.submissions.length > 5000) DB.submissions = DB.submissions.slice(0, 5000);
      if (!DB.users[uid]) DB.users[uid] = { uid, createdAt: rec.date };
      DB.users[uid].lastActive = rec.date;
      DB.users[uid].name = rec.name;
      DB.users[uid].age = rec.age || DB.users[uid].age;
      DB.users[uid].basicInfo = basicInfo;
      saveDB(DB);
      return sendJSON(res, 200, rec);
    }
    if (method === 'GET') {
      const uid = parsed.query.uid;
      if (uid) {
        const list = DB.submissions.filter((s) => s.uid === uid)
          .map((s) => ({ id: s.id, name: s.name, date: s.date, score: s.score, level: s.level, levelKey: s.levelKey, basicInfo: s.basicInfo, answers: s.answers, triggered: s.triggered }));
        return sendJSON(res, 200, list);
      }
      if (!requirePerm(req, res, 'archive.read')) return;     // 全部提交记录仅后台可见
      return sendJSON(res, 200, DB.submissions);
    }
  }

  // 用户统计列表（后台）
  if (resource === 'userstats' && method === 'GET') {
    if (!requirePerm(req, res, 'archive.read')) return;
    const list = Object.values(DB.users).map((u) => {
      const subs = DB.submissions.filter((s) => s.uid === u.uid);
      return {
        uid: u.uid, name: u.name, age: u.age,
        count: subs.length,
        lastDate: subs[0] ? subs[0].date : (u.lastActive || ''),
        lastLevel: subs[0] ? subs[0].level : ''
      };
    }).sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''));
    return sendJSON(res, 200, list);
  }

  // 仪表盘统计（后台）
  if (resource === 'stats' && method === 'GET') {
    if (!requirePerm(req, res, 'dashboard.read')) return;
    const subs = DB.submissions;
    const total = subs.length;
    const riskDist = {};
    (DB.riskCategories || []).forEach(t => { riskDist[t.key] = 0; });
    subs.forEach((s) => { riskDist[s.levelKey] = (riskDist[s.levelKey] || 0) + 1; });

    // 按日期聚合（最近 14 天）
    const dayMap = {};
    subs.forEach((s) => {
      const day = (s.date || '').slice(0, 10);
      if (day) dayMap[day] = (dayMap[day] || 0) + 1;
    });
    const days = Object.keys(dayMap).sort().slice(-14);
    const byDay = days.map((d) => ({ day: d, count: dayMap[d] }));

    // 按 uid 去重：每位患者仅取最近一次提交（与「患者档案」保持一致），用于人群分布统计
    const latestByUid = new Map();
    subs.forEach((s) => {
      const cur = latestByUid.get(s.uid);
      if (!cur || (s.date || '') > (cur.date || '')) latestByUid.set(s.uid, s);
    });
    const deduped = [...latestByUid.values()];

    // 年龄分布（兼容 basicInfo.age 与旧版顶层 age；按 uid 去重后统计，避免同一人多填被重复计数）
    const ageBuckets = { '≤35': 0, '36-50': 0, '51-65': 0, '>65': 0, '未知': 0 };
    deduped.forEach((s) => {
      const a = Number((s.basicInfo && s.basicInfo.age) || s.age);
      if (!a) ageBuckets['未知']++;
      else if (a <= 35) ageBuckets['≤35']++;
      else if (a <= 50) ageBuckets['36-50']++;
      else if (a <= 65) ageBuckets['51-65']++;
      else ageBuckets['>65']++;
    });

    const userCount = Object.keys(DB.users).length;
    return sendJSON(res, 200, {
      total, userCount, riskDist, riskCategories: DB.riskCategories, byDay, ageBuckets,
      hospitals: DB.hospitals.length,
      articles: DB.articles.science.length + DB.articles.news.length
    });
  }

  // 后台账号管理（accounts.read / accounts.write）
  if (resource === 'accounts') {
    if (method === 'GET') {
      const acc = requirePerm(req, res, 'accounts.read'); if (!acc) return;
      return sendJSON(res, 200, (DB.accounts || []).map(publicAccount));
    }
    const actor = requirePerm(req, res, 'accounts.write'); if (!actor) return;
    if (method === 'POST') {
      const b = await readBody(req);
      const username = String(b.username || '').trim();
      if (!username) return sendJSON(res, 400, { error: '用户名不能为空' });
      if ((DB.accounts || []).find(a => a.username === username)) return sendJSON(res, 409, { error: '用户名已存在' });
      const pwd = String(b.password || 'admin123');
      if (pwd.length < 6) return sendJSON(res, 400, { error: '密码至少 6 位' });
      const newAcc = {
        id: genId('acc'), username, name: String(b.name || username).slice(0, 20),
        role: DEFAULT_ROLES.find(r => r.key === b.role) ? b.role : 'editor',
        password: sha256(pwd), token: genId('tok'), disabled: !!b.disabled,
        createdAt: new Date().toISOString()
      };
      DB.accounts.push(newAcc); saveDB(DB);
      logAction(actor, 'account_create', 'account', username + ' / 角色:' + newAcc.role);
      return sendJSON(res, 200, publicAccount(newAcc));
    }
    if (method === 'PUT' && id) {
      const t = (DB.accounts || []).find(a => a.id === id); if (!t) return sendJSON(res, 404, { error: '账号不存在' });
      const b = await readBody(req);
      if (b.username != null) { const u = String(b.username).trim(); if (!u) return sendJSON(res, 400, { error: '用户名不能为空' }); if ((DB.accounts).find(a => a.username === u && a.id !== id)) return sendJSON(res, 409, { error: '用户名已存在' }); t.username = u; }
      if (b.name != null) t.name = String(b.name).slice(0, 20);
      if (b.role != null && DEFAULT_ROLES.find(r => r.key === b.role)) t.role = b.role;
      if (b.password != null && String(b.password) !== '') { if (String(b.password).length < 6) return sendJSON(res, 400, { error: '密码至少 6 位' }); t.password = sha256(String(b.password)); }
      if (b.disabled != null) t.disabled = !!b.disabled;
      saveDB(DB);
      logAction(actor, 'account_update', 'account', t.username + (b.disabled != null ? (' / ' + (t.disabled ? '停用' : '启用')) : ''));
      return sendJSON(res, 200, publicAccount(t));
    }
    if (method === 'DELETE' && id) {
      if ((DB.accounts || []).length <= 1) return sendJSON(res, 400, { error: '至少保留一个账号' });
      const i = (DB.accounts || []).findIndex(a => a.id === id); if (i < 0) return sendJSON(res, 404, { error: '账号不存在' });
      if (DB.accounts[i].token === (req.headers['x-admin-token'] || '')) return sendJSON(res, 400, { error: '不能删除当前登录账号' });
      const un = DB.accounts[i].username;
      DB.accounts.splice(i, 1); saveDB(DB);
      logAction(actor, 'account_delete', 'account', un);
      return sendJSON(res, 200, { ok: true });
    }
  }

  // 角色管理（roles.read / roles.write）
  if (resource === 'roles') {
    if (method === 'GET') {
      const acc = requirePerm(req, res, 'roles.read'); if (!acc) return;
      return sendJSON(res, 200, DB.roles || []);
    }
    const actor = requirePerm(req, res, 'roles.write'); if (!actor) return;
    if (method === 'POST') {
      const b = await readBody(req);
      const key = String(b.key || '').trim();
      if (!key) return sendJSON(res, 400, { error: '角色标识不能为空' });
      if ((DB.roles || []).find(r => r.key === key)) return sendJSON(res, 409, { error: '角色标识已存在' });
      const role = { key, name: String(b.name || key).slice(0, 20), perms: Array.isArray(b.perms) ? b.perms.filter(p => ALL_PERMS.includes(p)) : [] };
      DB.roles.push(role); saveDB(DB);
      logAction(actor, 'role_create', 'role', key);
      return sendJSON(res, 200, role);
    }
    if (method === 'PUT' && id) {
      const t = (DB.roles || []).find(r => r.key === id); if (!t) return sendJSON(res, 404, { error: '角色不存在' });
      const b = await readBody(req);
      if (b.name != null) t.name = String(b.name).slice(0, 20);
      if (b.perms != null) t.perms = Array.isArray(b.perms) ? b.perms.filter(p => ALL_PERMS.includes(p)) : [];
      saveDB(DB);
      logAction(actor, 'role_update', 'role', t.key);
      return sendJSON(res, 200, t);
    }
    if (method === 'DELETE' && id) {
      if (id === 'super') return sendJSON(res, 400, { error: '内置超级管理员角色不可删除' });
      if ((DB.accounts || []).some(a => a.role === id)) return sendJSON(res, 400, { error: '仍有账号使用该角色，无法删除' });
      const i = (DB.roles || []).findIndex(r => r.key === id); if (i < 0) return sendJSON(res, 404, { error: '角色不存在' });
      DB.roles.splice(i, 1); saveDB(DB);
      logAction(actor, 'role_delete', 'role', id);
      return sendJSON(res, 200, { ok: true });
    }
  }

  // 操作日志（logs.read）
  if (resource === 'logs' && method === 'GET') {
    const acc = requirePerm(req, res, 'logs.read'); if (!acc) return;
    let list = (DB.logs || []).slice();
    const q = parsed.query;
    if (q.action) list = list.filter(l => l.action === q.action);
    if (q.username) list = list.filter(l => (l.username || '').includes(String(q.username)));
    return sendJSON(res, 200, list.slice(0, 500));
  }

  return sendJSON(res, 404, { error: '接口不存在' });
}

/* ---------------- 主服务 ---------------- */
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, { pathname, query: parsed.query })
      .catch((e) => sendJSON(res, 400, { error: e.message || '请求错误' }));
  } else {
    serveStatic(req, res, pathname);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('乳腺自查后端已启动:');
  console.log('  小程序:  http://localhost:' + PORT + '/');
  console.log('  后台:    http://localhost:' + PORT + '/admin');
  console.log('  默认后台密码: ' + DB.settings.adminPassword);
});
