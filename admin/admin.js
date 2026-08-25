/* ============================================================
 *  乳腺健康自查 · 管理后台逻辑
 * ============================================================ */
'use strict';

const TOKEN_KEY = 'bcs_admin_token';
const COLORS = ['#ff5c8a', '#5b8def', '#2bbf6a', '#f5a623', '#a06bff', '#22c1c3', '#ff8f4d'];
// 证据等级（与《评分规则总表》A/B/C/D/E/F 六级证据体系一致；中性 / 未明确仅参与积分）
const EVIDENCE_OPTS = ['A', 'B', 'C', 'D', 'E', 'F', '中性', '未明确'];

/* 导航（按权限显隐）与权限点中文 */
const ROLE_NAMES = { super: '超级管理员', editor: '内容编辑', viewer: '只读访客' };
const PERM_LABELS = {
  'dashboard.read': '仪表盘查看', 'questionnaire.read': '问卷查看', 'questionnaire.write': '问卷编辑',
  'hospitals.read': '医院查看', 'hospitals.write': '医院编辑', 'articles.read': '资讯查看', 'articles.write': '资讯编辑',
  'tutorials.read': '教程查看', 'tutorials.write': '教程编辑', 'archive.read': '患者/用户查看',
  'links.read': '外网链接查看', 'links.write': '外网链接编辑', 'accounts.read': '账号查看', 'accounts.write': '账号管理',
  'roles.read': '角色查看', 'roles.write': '角色管理', 'logs.read': '操作日志查看'
};
const ALL_PERMS_UI = Object.keys(PERM_LABELS);
const NAV = [
  { view: 'dashboard', label: '数据仪表盘', icon: '📊', perm: 'dashboard.read' },
  { view: 'questionnaire', label: '问卷管理', icon: '📝', perm: 'questionnaire.read' },
  { view: 'archive', label: '患者档案', icon: '📁', perm: 'archive.read' },
  { view: 'hospitals', label: '医院管理', icon: '🏥', perm: 'hospitals.read' },
  { view: 'articles', label: '资讯管理', icon: '📰', perm: 'articles.read' },
  { view: 'tutorials', label: '教程管理', icon: '🎬', perm: 'tutorials.read' },
  { view: 'users', label: '用户统计', icon: '👥', perm: 'archive.read' },
  { view: 'links', label: '外网链接', icon: '🔗', perm: 'links.read' },
  { view: 'accounts', label: '后台账号', icon: '👤', perm: 'accounts.read' },
  { view: 'roles', label: '角色管理', icon: '🛡️', perm: 'roles.read' },
  { view: 'logs', label: '操作日志', icon: '📜', perm: 'logs.read' }
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function api(path, opts = {}) {
  return fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(r => {
    if (r.status === 401) { throw Object.assign(new Error('未授权'), { code: 401 }); }
    if (!r.ok) throw new Error('请求失败 ' + r.status);
    return r.json();
  });
}

const state = { view: 'dashboard', articleType: 'science', tutorialsCache: null, editing: { id: null }, account: null, roles: [] };

/* ---------------- 登录 ---------------- */
function bindLogin() {
  $('#loginBtn').addEventListener('click', doLogin);
  $('#pwd').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#usr').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}
async function doLogin() {
  const username = $('#usr').value.trim();
  const pwd = $('#pwd').value;
  const hint = $('#loginHint');
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: pwd }) });
    const j = await r.json();
    if (j.ok && j.token) {
      localStorage.setItem(TOKEN_KEY, j.token);
      state.account = j.account;
      enterAdmin();
    } else { hint.textContent = j.error || '登录失败'; }
  } catch (e) { hint.textContent = '网络错误，无法连接服务'; }
}
function can(perm) { return !!(state.account && (state.account.role === 'super' || (state.account.perms || []).includes(perm))); }
function roleName(key) { return ROLE_NAMES[key] || key; }
function renderNav() {
  const nav = $('#nav'); if (!nav) return;
  nav.innerHTML = NAV.filter(it => can(it.perm)).map(it =>
    `<div class="nav-item ${it.view === 'dashboard' ? 'active' : ''}" data-view="${it.view}">${it.icon} ${it.label}</div>`
  ).join('');
  $$('.nav-item', nav).forEach(n => n.addEventListener('click', () => {
    $$('.nav-item', nav).forEach(x => x.classList.remove('active'));
    n.classList.add('active');
    loadView(n.dataset.view);
  }));
}
function enterAdmin() {
  $('#login').hidden = true;
  $('#admin').hidden = false;
  renderNav();
  $('#logout').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  });
  const su = $('#sideUser'); if (su) su.textContent = state.account ? (state.account.name + '（' + roleName(state.account.role) + '）') : '';
  prefetchLists();
  loadView('dashboard');
}
function showLogin() { $('#login').hidden = false; $('#admin').hidden = true; }

/* ---------------- 视图路由 ---------------- */
async function loadView(view) {
  state.view = view;
  const map = {
    dashboard: renderDashboard, questionnaire: renderQuestionnaire,
    hospitals: renderHospitals,
    articles: renderArticles, tutorials: renderTutorials, users: renderUsers,
    archive: renderArchive, links: renderLinks,
    accounts: renderAccounts, roles: renderRoles, logs: renderLogs
  };
  const c = $('#content');
  c.innerHTML = '<div class="empty">加载中…</div>';
  try {
    await (map[view] || renderDashboard)(c);
  } catch (e) {
    if (e && e.code === 401) { showLogin(); return; }
    c.innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '</div>';
  }
}

/* ---------------- 弹层 ---------------- */
function openModal(title, bodyHtml) {
  $('#modalBox').innerHTML = '<h3>' + esc(title) + '</h3>' + bodyHtml;
  $('#modalMask').hidden = false;
}
function closeModal() { $('#modalMask').hidden = true; }

/* ---------------- 图表 ---------------- */
function donutChart(items) {
  const size = 170, r = 62, cx = 85, cy = 85, sw = 24;
  const total = items.reduce((s, i) => s + i.value, 0);
  const C = 2 * Math.PI * r;
  let acc = 0;
  const segs = (total ? items : [{ value: 1, color: '#eef1f7' }]).map(it => {
    const len = (it.value / (total || 1)) * C;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    acc += len; return seg;
  }).join('');
  const legend = items.map(it => `<div class="lg"><span class="dot" style="background:${it.color}"></span>${esc(it.label)} <b>${it.value}</b></div>`).join('');
  return `<div class="chart-donut"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${segs}` +
    `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-num">${total}</text>` +
    `<text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-lbl">总提交</text></svg>` +
    `<div class="legend">${legend}</div></div>`;
}
function hBars(items, opts = {}) {
  const max = Math.max(1, ...items.map(i => i.value));
  return `<div class="hbar-list">` + items.map((it, i) =>
    `<div class="hbar-row"><div class="hbar-label" title="${esc(it.label)}">${esc(it.label)}</div>` +
    `<div class="hbar-track"><div class="hbar-fill" style="width:${(it.value / max * 100).toFixed(1)}%;background:${it.color || COLORS[i % COLORS.length]}"></div></div>` +
    `<div class="hbar-val">${it.value}</div></div>`).join('') + `</div>`;
}

/* ---------------- 仪表盘 ---------------- */
async function renderDashboard(c) {
  const s = await api('/api/stats');
  const lnk = await api('/api/settings').catch(() => ({}));
  const cats = s.riskCategories || [];
  const hiKey = (cats.find(x => x.key === '高危') || { key: '高危' }).key;
  const riskItems = cats.map(t => ({ label: t.label, value: s.riskDist[t.key] || 0, color: t.color }));
  const ageItems = Object.entries(s.ageBuckets).map(([k, v], i) => ({ label: k, value: v, color: COLORS[i % COLORS.length] }));
  const dayItems = s.byDay.map((d, i) => ({ label: d.day.slice(5), value: d.count, color: '#5b8def' }));

  const statCards = `
    <div class="stat-row">
      <div class="stat-card"><div class="stat-num">${s.total}</div><div class="stat-lbl">问卷提交总数</div></div>
      <div class="stat-card alt"><div class="stat-num">${s.userCount}</div><div class="stat-lbl">注册用户数</div></div>
      <div class="stat-card warn"><div class="stat-num">${s.riskDist[hiKey] || 0}</div><div class="stat-lbl">高风险提交</div></div>
      <div class="stat-card ok clickable" data-jump="hospitals"><div class="stat-num">${s.hospitals}</div><div class="stat-lbl">合作医院 ↗</div></div>
      <div class="stat-card clickable" data-jump="articles"><div class="stat-num">${s.articles}</div><div class="stat-lbl">科普/资讯条数 ↗</div></div>
    </div>`;

  const riskPanel = `<div class="panel"><h3>风险等级分布</h3>${donutChart(riskItems)}</div>`;
  const dayPanel = `<div class="panel"><h3>每日提交量（近 14 天）</h3>${dayItems.length ? hBars(dayItems) : '<div class="muted">暂无提交数据</div>'}</div>`;
  const dayPanelWrap = dayPanel;
  const agePanel = `<div class="panel"><h3>年龄分布</h3>${hBars(ageItems)}</div>`;

  const linkPanel = `
    <div class="panel link-panel">
      <div class="link-panel-head"><b>外网访问地址</b><button class="btn btn-ghost btn-sm" id="goLinks">管理</button></div>
      <div class="link-panel-url">${lnk.publicLink ? esc(lnk.publicLink) : '<span class="muted">尚未配置，请在「外网链接」中设置</span>'}</div>
      <div class="muted">将此地址发给用户，手机浏览器打开即用（无需下载 App）。后台地址：${lnk.adminLink ? esc(lnk.adminLink) : '未配置'}</div>
    </div>`;

  c.innerHTML = `
    <div class="view-head"><div><h1>数据仪表盘</h1><div class="sub">实时统计小程序问卷填写与用户情况</div></div></div>
    ${linkPanel}
    ${statCards}
    <div class="grid-2">
      ${riskPanel}
      ${agePanel}
    </div>
    ${dayPanelWrap}
    <p class="muted">说明：以上数据来自小程序端提交的问卷记录，随用户填写实时同步更新。点击「合作医院」「科普/资讯条数」卡片可跳转至对应管理模块。</p>`;

  // 卡片点击跳转：合作医院 → 医院管理；科普/资讯 → 资讯管理
  $$('[data-jump]').forEach(card => card.addEventListener('click', () => loadView(card.dataset.jump)));

  // 外网访问快捷卡片（指向「外网链接」管理页）
  const gl = $('#goLinks');
  if (gl) gl.addEventListener('click', () => loadView('links'));
}

/* ---------------- 医院管理 ---------------- */
let _hospCityFilter = '';
async function renderHospitals(c) {
  const list = await api('/api/hospitals');
  state._hospitals = list;
  const cities = [...new Set(list.map(h => h.city).filter(Boolean))];
  const opts = ['<option value="">全部城市</option>']
    .concat(cities.map(ct => `<option value="${esc(ct)}" ${_hospCityFilter === ct ? 'selected' : ''}>${esc(ct)}</option>`))
    .join('');
  c.innerHTML = `
    <div class="view-head"><div><h1>医院管理</h1><div class="sub">维护推荐就诊医院（名称/城市/等级/科室/地址/电话/简介）</div></div>
      <button class="btn btn-primary" id="addHosp">+ 新增医院</button></div>
    <div class="arc-search">
      <label class="arc-in" style="display:flex;align-items:center;gap:8px;min-width:auto;flex:0 0 auto">
        <span style="color:#8a8f9c;font-size:13px">城市</span>
        <select id="hospCity" style="border:none;background:transparent;font:inherit;outline:none">${opts}</select>
      </label>
      <span class="muted" id="hospCount"></span>
    </div>
    <div class="panel" style="padding:0;overflow:auto">
      <table class="tbl"><thead><tr>
        <th>名称</th><th>城市</th><th>等级</th><th>科室</th><th>地址</th><th>电话</th><th>操作</th>
      </tr></thead><tbody id="hospBody"></tbody></table>
    </div>`;
  $('#addHosp').addEventListener('click', () => hospitalForm(null));
  $('#hospCity').addEventListener('change', e => { _hospCityFilter = e.target.value; paintHospitals(c); });
  paintHospitals(c);
}

function paintHospitals(c) {
  const list = state._hospitals || [];
  const filtered = _hospCityFilter ? list.filter(h => h.city === _hospCityFilter) : list;
  const rows = filtered.map(h => `
    <tr>
      <td><b>${esc(h.name)}</b></td>
      <td>${esc(h.city)}</td>
      <td>${esc(h.level)}</td>
      <td>${esc(h.department)}</td>
      <td>${esc(h.address)}</td>
      <td>${esc(h.phone)}</td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${h.id}">编辑</button>
        <button class="btn btn-danger btn-sm" data-del="${h.id}">删除</button>
      </div></td>
    </tr>`).join('');
  if (!can('hospitals.write')) { const ah = $('#addHosp'); if (ah) ah.hidden = true; }
  const body = c.querySelector('#hospBody');
  if (body) body.innerHTML = rows || '<tr><td colspan="7" class="empty">暂无医院</td></tr>';
  if (!can('hospitals.write')) c.querySelectorAll('[data-edit],[data-del]').forEach(b => b.hidden = true);
  const cnt = c.querySelector('#hospCount');
  if (cnt) cnt.textContent = `共 ${filtered.length} 家${_hospCityFilter ? '（' + _hospCityFilter + '）' : ''}`;
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => hospitalForm(b.dataset.edit)));
  $$('[data-del]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.del;
    confirmModal('删除医院', '确定删除该医院吗？此操作不可恢复。', async () => {
      await api('/api/hospitals/' + id, { method: 'DELETE' });
      closeModal(); loadView('hospitals');
    });
  }));
}

function hospitalForm(id) {
  const isEdit = !!id;
  const h = isEdit ? state._hospitals?.find(x => x.id === id) : null;
  const v = (k) => h ? esc(h[k]) : '';
  openModal(isEdit ? '编辑医院' : '新增医院', `
    <div class="form-grid">
      <div class="field"><label>医院名称 *</label><input id="f_name" value="${v('name')}" placeholder="如：XX肿瘤医院"></div>
      <div class="field"><label>城市</label><input id="f_city" value="${v('city')}"></div>
      <div class="field"><label>等级 / 类型</label><input id="f_level" value="${v('level')}" placeholder="三甲 · 专科医院"></div>
      <div class="field"><label>科室</label><input id="f_dept" value="${v('department')}" placeholder="乳腺外科"></div>
      <div class="field full"><label>地址</label><input id="f_addr" value="${v('address')}"></div>
      <div class="field"><label>电话</label><input id="f_phone" value="${v('phone')}"></div>
      <div class="field full"><label>简介</label><textarea id="f_note" placeholder="一句话特色">${v('note')}</textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel">取消</button>
      <button class="btn btn-primary" id="save">保存</button>
    </div>`);
  $('#cancel').addEventListener('click', closeModal);
  $('#save').addEventListener('click', async () => {
    const body = {
      name: $('#f_name').value.trim(), city: $('#f_city').value.trim(),
      level: $('#f_level').value.trim(), department: $('#f_dept').value.trim(),
      address: $('#f_addr').value.trim(), phone: $('#f_phone').value.trim(),
      note: $('#f_note').value.trim()
    };
    if (!body.name) { alert('请填写医院名称'); return; }
    if (isEdit) await api('/api/hospitals/' + id, { method: 'PUT', body });
    else await api('/api/hospitals', { method: 'POST', body });
    closeModal(); loadView('hospitals');
  });
}

/* ---------------- 资讯管理 ---------------- */
async function renderArticles(c) {
  const type = state.articleType;
  const list = await api('/api/articles?type=' + type);
  const rows = list.map(a => `
    <tr>
      <td><b>${esc(a.title)}</b><div class="muted">${esc(a.summary)}</div></td>
      <td>${type === 'science' ? `<span class="tag">${esc(a.tag)}</span>` : `${esc(a.source || '')}<br><span class="muted">${esc(a.date || '')}</span>`}</td>
      <td>${can('articles.write') ? `<div class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="${a.id}">编辑</button><button class="btn btn-danger btn-sm" data-del="${a.id}">删除</button></div>` : '<span class="muted">只读</span>'}</td>
    </tr>`).join('');
  c.innerHTML = `
    <div class="view-head"><div><h1>资讯管理</h1><div class="sub">维护小程序「科普资讯」模块的科普知识与健康新闻</div></div>
      <button class="btn btn-primary" id="addArt">+ 新增${type === 'science' ? '科普' : '资讯'}</button></div>
    <div class="seg" style="display:flex;gap:8px;margin-bottom:14px">
      <div class="nav-item ${type === 'science' ? 'active' : ''}" data-t="science" style="margin:0">科普知识</div>
      <div class="nav-item ${type === 'news' ? 'active' : ''}" data-t="news" style="margin:0">健康资讯</div>
    </div>
    <div class="panel" style="padding:0;overflow:auto">
      <table class="tbl"><thead><tr><th>标题 / 摘要</th><th>${type === 'science' ? '标签' : '来源 / 日期'}</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" class="empty">暂无内容，点击右上角新增</td></tr>'}</tbody></table>
    </div>`;
  $$('[data-t]').forEach(t => t.addEventListener('click', () => { state.articleType = t.dataset.t; loadView('articles'); }));
  if (!can('articles.write')) { const aa = $('#addArt'); if (aa) aa.hidden = true; }
  $('#addArt').addEventListener('click', () => articleForm(null));
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => articleForm(b.dataset.edit)));
  $$('[data-del]').forEach(b => b.addEventListener('click', () => {
    confirmModal('删除内容', '确定删除该条内容吗？', async () => {
      await api('/api/articles/' + b.dataset.del, { method: 'DELETE' });
      closeModal(); loadView('articles');
    });
  }));
}

function articleForm(id) {
  const type = state.articleType;
  const isEdit = !!id;
  const list = state._articles || [];
  const a = isEdit ? list.find(x => x.id === id) : null;
  const v = (k) => a ? esc(a[k]) : '';
  const extra = type === 'science'
    ? `<div class="field"><label>标签</label><input id="f_tag" value="${v('tag')}" placeholder="基础 / 预警 / 风险"></div>`
    : `<div class="field"><label>来源</label><input id="f_source" value="${v('source')}" placeholder="如：科普中国"></div>
       <div class="field"><label>日期</label><input id="f_date" value="${v('date')}" placeholder="2026-08"></div>`;
  openModal(isEdit ? '编辑内容' : '新增内容', `
    <div class="field full"><label>标题 *</label><input id="f_title" value="${v('title')}"></div>
    <div class="form-grid">${extra}</div>
    <div class="field full"><label>摘要</label><input id="f_summary" value="${v('summary')}"></div>
    <div class="field full"><label>正文</label><textarea id="f_content" style="min-height:140px">${v('content')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancel">取消</button>
      <button class="btn btn-primary" id="save">保存</button>
    </div>`);
  $('#cancel').addEventListener('click', closeModal);
  $('#save').addEventListener('click', async () => {
    const body = { type, title: $('#f_title').value.trim(), summary: $('#f_summary').value.trim(), content: $('#f_content').value.trim() };
    if (!body.title) { alert('请填写标题'); return; }
    if (type === 'science') body.tag = $('#f_tag').value.trim() || '科普';
    else { body.source = $('#f_source').value.trim() || '来源待补充'; body.date = $('#f_date').value.trim() || new Date().toISOString().slice(0, 7); }
    if (isEdit) await api('/api/articles/' + id, { method: 'PUT', body });
    else await api('/api/articles', { method: 'POST', body });
    closeModal(); loadView('articles');
  });
}

/* ---------------- 教程管理（新增/编辑/删除步骤 + 图片上传） ---------------- */
async function renderTutorials(c) {
  const t = await api('/api/tutorials');
  state.tutorialsCache = JSON.parse(JSON.stringify(t));
  if (!Array.isArray(state.tutorialsCache.steps)) state.tutorialsCache.steps = [];
  paintTutorials(c);
}

function paintTutorials(c) {
  if (!can('tutorials.write')) { const as = $('#addStep'); if (as) as.hidden = true; const st = $('#saveTut'); if (st) st.hidden = true; c.querySelectorAll('.tut-step-ops, .img-actions').forEach(b => b.style.display = 'none'); }
  const steps = state.tutorialsCache.steps;
  const stepsHtml = steps.map((s, i) => `
    <div class="tut-edit" data-i="${i}">
      <div class="tut-edit-head">
        <span class="tut-step-no">步骤 ${i + 1}</span>
        <div class="tut-step-ops">
          <button class="btn btn-ghost btn-sm" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑ 上移</button>
          <button class="btn btn-ghost btn-sm" data-down="${i}" ${i === steps.length - 1 ? 'disabled' : ''}>↓ 下移</button>
          <button class="btn btn-danger btn-sm" data-delstep="${i}">删除步骤</button>
        </div>
      </div>
      <div class="tut-prev" id="prev${i}">${s.image ? `<img src="${esc(s.image)}">` : '<div class="ph">暂无图片（将显示默认插图）</div>'}</div>
      <div class="meta">
        <label class="fld"><span>步骤标题</span><input class="tut-title-in" data-i="${i}" value="${esc(s.title || '')}" placeholder="步骤标题"></label>
        <label class="fld"><span>说明文字</span><textarea class="tut-desc-in" data-i="${i}" placeholder="步骤说明文字">${esc(s.desc || '')}</textarea></label>
        <div class="img-actions">
          <label class="file-btn">${s.image ? '更换图片' : '上传图片'}<input type="file" accept="image/*" data-i="${i}"></label>
          ${s.image ? `<button class="file-btn" data-clear="${i}">清除图片</button>` : ''}
          <span class="img-stat" id="imgstat${i}"></span>
        </div>
      </div>
    </div>`).join('');
  c.innerHTML = `
    <div class="view-head"><div><h1>教程管理</h1><div class="sub">维护小程序「教程」模块的图文步骤：可新增 / 删除 / 排序步骤，每步支持标题、说明文字与图片（建议横向图片）。保存后自动同步到小程序。</div></div>
      <div class="editor-actions">
        <button class="btn btn-ghost btn-sm" id="addStep">+ 新增步骤</button>
        <button class="btn btn-primary btn-sm" id="saveTut">保存修改</button>
      </div></div>
    <div class="panel">
      <h3>图文步骤（可新增 / 删除 / 上下移动，图片建议横向）</h3>
      ${steps.length ? stepsHtml : '<div class="empty">暂无步骤，点击右上角「+ 新增步骤」</div>'}
    </div>`;

  $$('.tut-title-in').forEach(inp => inp.addEventListener('input', e => {
    state.tutorialsCache.steps[+e.target.dataset.i].title = e.target.value;
  }));
  $$('.tut-desc-in').forEach(inp => inp.addEventListener('input', e => {
    state.tutorialsCache.steps[+e.target.dataset.i].desc = e.target.value;
  }));
  $$('input[type=file]').forEach(inp => inp.addEventListener('change', e => {
    const i = Number(inp.dataset.i);
    const file = e.target.files[0]; if (!file) return;
    uploadTutorialImage(file, i);
  }));
  $$('[data-clear]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.dataset.clear);
    state.tutorialsCache.steps[i].image = '';
    $('#prev' + i).innerHTML = '<div class="ph">暂无图片（将显示默认插图）</div>';
    b.remove();
  }));
  $$('[data-up]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.dataset.up);
    if (i <= 0) return;
    const arr = state.tutorialsCache.steps;
    [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    paintTutorials(c);
  }));
  $$('[data-down]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.dataset.down);
    const arr = state.tutorialsCache.steps;
    if (i >= arr.length - 1) return;
    [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
    paintTutorials(c);
  }));
  $$('[data-delstep]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.dataset.delstep);
    if (!confirm('确定删除该步骤？保存后才会生效。')) return;
    state.tutorialsCache.steps.splice(i, 1);
    paintTutorials(c);
  }));
  $('#addStep').addEventListener('click', () => {
    state.tutorialsCache.steps.push({ id: undefined, type: 'custom', title: '新步骤', desc: '', image: '' });
    paintTutorials(c);
  });
  $('#saveTut').addEventListener('click', async () => {
    for (let i = 0; i < state.tutorialsCache.steps.length; i++) {
      if (!state.tutorialsCache.steps[i].title || !state.tutorialsCache.steps[i].title.trim()) {
        alert('第 ' + (i + 1) + ' 步标题为空，请填写后再保存'); return;
      }
    }
    try {
      await api('/api/tutorials', { method: 'PUT', body: { steps: state.tutorialsCache.steps } });
      alert('已保存，小程序端刷新即可生效');
      loadView('tutorials');
    } catch (e) { alert('保存失败：' + e.message); }
  });
}

/* 上传教程图片：本地读取为 dataURL → 调后端 upload 接口落盘到 data/uploads → 返回可访问 URL */
function uploadTutorialImage(file, i) {
  const stat = $('#imgstat' + i);
  if (stat) stat.textContent = '上传中…';
  const reader = new FileReader();
  reader.onload = () => {
    fetch('/api/tutorials/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() },
      body: JSON.stringify({ dataUrl: reader.result })
    }).then(r => r.json()).then(j => {
      if (j.url) {
        state.tutorialsCache.steps[i].image = j.url;
        const prev = $('#prev' + i);
        if (prev) prev.innerHTML = `<img src="${esc(j.url)}">`;
        if (stat) stat.textContent = '已上传';
      } else {
        if (stat) stat.textContent = '上传失败';
      }
    }).catch(() => {
      if (stat) stat.textContent = '上传失败，请重试';
    });
  };
  reader.readAsDataURL(file);
}

/* ---------------- 用户统计 ---------------- */
async function renderUsers(c) {
  const list = await api('/api/userstats');
  const rows = list.map(u => `
    <tr>
      <td><b>${esc(u.name)}</b><div class="muted">${esc(u.uid.slice(0, 10))}</div></td>
      <td>${u.age ? esc(u.age) + ' 岁' : '<span class="muted">未填</span>'}</td>
      <td><b>${u.count}</b> 次</td>
      <td>${u.lastLevel ? `<span class="tag ${u.lastLevel.includes('高') ? '' : u.lastLevel.includes('中') ? 'warn' : 'ok'}">${esc(u.lastLevel)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${u.lastDate ? esc(u.lastDate.slice(0, 16).replace('T', ' ')) : '—'}</td>
      <td><button class="btn btn-ghost btn-sm" data-detail="${esc(u.uid)}">明细</button></td>
    </tr>`).join('');
  c.innerHTML = `
    <div class="view-head"><div><h1>用户统计</h1><div class="sub">查看小程序用户及其问卷提交记录</div></div></div>
    <div class="panel" style="padding:0;overflow:auto">
      <table class="tbl"><thead><tr><th>用户</th><th>年龄</th><th>提交次数</th><th>最近风险</th><th>最近提交</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">暂无用户数据</td></tr>'}</tbody></table>
    </div>`;
  $$('[data-detail]').forEach(b => b.addEventListener('click', () => showUserDetail(b.dataset.detail)));
}

async function showUserDetail(uid) {
  const list = await api('/api/submissions?uid=' + encodeURIComponent(uid));
  const rows = list.map(s => {
    const bi = s.basicInfo || {};
    const lvlCls = (s.levelKey === 'F' || s.levelKey === 'DE' || s.levelKey === '高危') ? 'warn' : (s.levelKey === '一般' ? 'ok' : '');
    return `
    <div class="q-card-stat">
      <div class="q-title"><span class="tag ${lvlCls}">${esc(s.level)}</span> · ${esc((s.date || '').slice(0, 16).replace('T', ' '))}</div>
      <div class="muted">基本信息：${bi.age ? bi.age + ' 岁' : '年龄未填'}${bi.bmi ? ' · BMI ' + bi.bmi : ''} · 触发 ${Array.isArray(s.triggered) ? s.triggered.join(' / ') : (s.score || 0)} 项证据</div>
    </div>`;
  }).join('');
  openModal('该用户提交明细', rows || '<div class="empty">该用户暂无提交</div>');
}

/* BMI 分级（与小程序 data.js 的 bmiGrade 一致，后台单独实现避免依赖） */
function bmiLabel(bmi) {
  const v = Number(bmi);
  if (!v) return '';
  if (v < 18.5) return '偏瘦';
  if (v < 24) return '正常';
  if (v < 28) return '超重';
  return '肥胖';
}

/* ---------------- 患者档案（提交记录 + 基本信息表 + 搜索） ---------------- */
async function renderArchive(c) {
  state._archiveAll = await api('/api/submissions');
  state._arc = state._arc || { name: '', age: '', date: '' };
  paintArchive(c);
}

function archiveRow(s) {
  const bi = s.basicInfo || {};
  const g = bmiLabel(bi.bmi);
  const lvlCls = (s.levelKey === 'F' || s.levelKey === 'DE' || s.levelKey === '高危') ? 'warn' : (s.levelKey === '一般' ? 'ok' : '');
  return `
    <tr>
      <td><b>${esc(s.name || '匿名')}</b></td>
      <td>${bi.age ? esc(bi.age) + ' 岁' : '<span class="muted">未填</span>'}</td>
      <td>${bi.height ? esc(bi.height) + ' cm' : '—'}</td>
      <td>${bi.weight ? esc(bi.weight) + ' kg' : '—'}</td>
      <td>${bi.bmi ? (esc(bi.bmi) + (g ? ' · ' + esc(g) : '')) : '—'}</td>
      <td><span class="tag ${lvlCls}">${esc(s.level || '—')}</span></td>
      <td>${s.date ? esc(s.date.slice(0, 16).replace('T', ' ')) : '—'}</td>
      <td><button class="btn btn-ghost btn-sm" data-detail="${esc(s.uid)}">明细</button></td>
    </tr>`;
}

function archiveFilteredPatients() {
  const list = state._archiveAll || [];
  // 按 uid 去重：同一患者多次提交只显示最近一次，避免重复计为患者
  const latestByUid = new Map();
  list.forEach(s => {
    const cur = latestByUid.get(s.uid);
    if (!cur || (s.date || '') > (cur.date || '')) latestByUid.set(s.uid, s);
  });
  let patients = [...latestByUid.values()];
  const qName = (state._arc.name || '').trim().toLowerCase();
  const qAge = (state._arc.age || '').trim();
  const qDate = (state._arc.date || '').trim();
  if (qName) patients = patients.filter(p => (p.name || '匿名用户').toLowerCase().includes(qName));
  if (qAge) patients = patients.filter(p => String((p.basicInfo && p.basicInfo.age != null) ? p.basicInfo.age : (p.age != null ? p.age : '')).includes(qAge));
  if (qDate) patients = patients.filter(p => (p.date || '').slice(0, 16).replace('T', ' ').includes(qDate));
  return patients;
}

function paintArchive(c) {
  const patients = archiveFilteredPatients();
  const rows = patients.map(archiveRow).join('');
  c.innerHTML = `
    <div class="view-head"><div>
      <h1>患者档案</h1>
      <div class="sub">按用户去重：每位患者仅显示最近一次提交<span id="arcCount">（共 ${patients.length} 位患者 / ${state._archiveAll.length} 条提交记录）</span></div>
    </div></div>
    <div class="arc-search">
      <input class="arc-in" id="arcName" placeholder="姓名（模糊）" value="${esc(state._arc.name)}">
      <input class="arc-in" id="arcAge" placeholder="年龄（模糊，如 3）" value="${esc(state._arc.age)}">
      <input class="arc-in" id="arcDate" placeholder="评估时间（如 2026-08-24 或 2026-08）" value="${esc(state._arc.date)}">
      <button class="btn btn-primary btn-sm" id="arcSearch">搜索</button>
      <button class="btn btn-ghost btn-sm" id="arcReset">重置</button>
    </div>
    <div class="panel" style="padding:0;overflow:auto">
      <table class="tbl"><thead><tr>
        <th>姓名</th><th>年龄</th><th>身高</th><th>体重</th><th>BMI</th><th>风险等级</th><th>评估时间</th><th>操作</th>
      </tr></thead>
      <tbody id="arcBody">${rows || '<tr><td colspan="8" class="empty">暂无匹配的患者记录</td></tr>'}</tbody></table>
    </div>`;
  const apply = () => {
    state._arc.name = $('#arcName').value;
    state._arc.age = $('#arcAge').value;
    state._arc.date = $('#arcDate').value;
    const ps = archiveFilteredPatients();
    $('#arcBody').innerHTML = ps.map(archiveRow).join('') || '<tr><td colspan="8" class="empty">暂无匹配的患者记录</td></tr>';
    $('#arcCount').textContent = `（共 ${ps.length} 位患者 / ${state._archiveAll.length} 条提交记录）`;
    $$('[data-detail]').forEach(b => b.addEventListener('click', () => showUserDetail(b.dataset.detail)));
  };
  ['arcName', 'arcAge', 'arcDate'].forEach(id => $('#' + id).addEventListener('input', apply));
  $('#arcSearch').addEventListener('click', apply);
  $('#arcReset').addEventListener('click', () => { state._arc = { name: '', age: '', date: '' }; paintArchive(c); });
  $$('[data-detail]').forEach(b => b.addEventListener('click', () => showUserDetail(b.dataset.detail)));
}

/* ---------------- 问卷管理（题目 + 风险分类 + 判定参数） ---------------- */
async function renderQuestionnaire(c) {
  const qRes = await api('/api/questionnaire/draft');
  const catRes = await api('/api/risk-categories/draft');
  const cfgRes = await api('/api/risk-config/draft');
  state._qDraft = JSON.parse(JSON.stringify(qRes.data));
  state._qDirty = !!qRes.dirty;
  state._catDraft = JSON.parse(JSON.stringify(catRes.data));
  state._catDirty = !!catRes.dirty;
  state._cfgDraft = JSON.parse(JSON.stringify(cfgRes.data));
  state._cfgDirty = !!cfgRes.dirty;
  paintQuestionnaire(c);
}

function qCard(q, qi) {
  const eviOpts = EVIDENCE_OPTS.map(e => `<option value="${e}" ${String(q.evidence) === e ? 'selected' : ''}>${e}</option>`).join('');
  const opts = q.options.map((o, oi) => {
    const oEvi = ['', ...EVIDENCE_OPTS].map(e => `<option value="${e}" ${String(o.evidence) === e ? 'selected' : ''}>${e || '—'}</option>`).join('');
    return `
    <div class="opt-row" data-oi="${oi}">
      <span class="opt-idx">选项${oi + 1}</span>
      <input class="opt-text" value="${esc(o.text)}" placeholder="选项文本">
      <label class="opt-evi-lbl">证据<select class="opt-evidence">${oEvi}</select></label>
      <button class="opt-del btn btn-danger btn-sm" title="删除选项">✕</button>
    </div>`;
  }).join('');
  const showIfText = q.showIf && q.showIf.q ? `仅当「${esc(q.showIf.q)}」选择第 ${q.showIf.in.map(i => i + 1).join(' / ')} 项时显示` : '';
  return `
    <div class="q-edit-card" data-qi="${qi}">
      <div class="q-edit-head">
        <span class="q-num">第 ${qi + 1} 题</span>
        <label class="q-evi-lbl">题目证据等级
          <select class="q-evidence">${eviOpts}</select>
        </label>
        <label class="q-skip" title="勾选后，用户选“是”则后续题目免填（适合确诊状态题）"><input type="checkbox" class="q-skiprest-cb" ${q.skipRest ? 'checked' : ''}> 选“是”后免填后续</label>
        <button class="q-del btn btn-danger btn-sm" data-qi="${qi}">删除本题</button>
      </div>
      <div class="field full"><label>题干</label><input class="q-text" value="${esc(q.q)}" placeholder="请输入题目"></div>
      <div class="opts-head">选项（每项可设触发的证据类，选 F 即代表“已确诊”）</div>
      <div class="opts-wrap">${opts}</div>
      <div class="q-cond">${showIfText ? '🔗 ' + showIfText : ''}</div>
      <button class="opt-add btn btn-ghost btn-sm" data-qi="${qi}">+ 添加选项</button>
    </div>`;
}

/* 风险分类卡片（4 类固定：F / DE / 高危 / 一般，仅改文案/颜色，不可增删——评估引擎依赖其 key） */
function catCard(c, ci) {
  return `
    <div class="cat-card" data-ci="${ci}">
      <div class="cat-head">
        <span class="cat-key" style="color:${esc(c.color)}">● ${esc(c.key)} 类</span>
        <span class="cat-label-prev">${esc(c.label)}</span>
      </div>
      <div class="form-grid">
        <div class="field"><label>显示名</label><input class="cat-label" data-ci="${ci}" value="${esc(c.label)}" placeholder="如：高危风险人群"></div>
        <div class="field"><label>主题色</label><input class="cat-color" type="color" data-ci="${ci}" value="${esc(c.color)}"></div>
      </div>
      <div class="field full"><label>结果标题</label><input class="cat-headline" data-ci="${ci}" value="${esc(c.headline)}" placeholder="结果标题"></div>
      <div class="field full"><label>结果说明 / 处理建议</label><textarea class="cat-detail" data-ci="${ci}" placeholder="结果说明文案">${esc(c.detail)}</textarea></div>
    </div>`;
}

/* 判定参数卡片（仅 cMinCount） */
function cfgCard(cfg) {
  return `
    <div class="cfg-card">
      <div class="form-grid">
        <div class="field"><label>C 类最少触发项数 cMinCount（C 类证据累计 ≥ 此项即判「高危」）</label><input class="cfg-cmin" type="number" value="${esc(cfg.cMinCount)}" placeholder="2"></div>
      </div>
      <p class="muted">判定依据《三甲医院规则版》证据优先级：F(已确诊) → DE(乳腺可能有疾病，D/E 类) → A/B 任一触发 或 C 类累积 ≥ cMinCount 项 → 否则「一般」。已取消“积分 ≥ 阈值”规则，BMI 仅展示不计入。修改后先「保存草稿」，再「发布」才会同步到小程序。</p>
    </div>`;
}

function paintQuestionnaire(c) {
  const q = state._qDraft, cats = state._catDraft, cfg = state._cfgDraft;
  const dirty = !!(state._qDirty || state._catDirty || state._cfgDirty);
  const statusHtml = dirty
    ? `<div class="draft-badge dirty">● 有未发布的修改（问卷 / 风险分类 / 判定参数中至少一个存在草稿，点「发布」后小程序才更新）</div>`
    : `<div class="draft-badge clean">✓ 当前为已发布版本</div>`;
  const catRows = cats.map((t, i) => catCard(t, i)).join('');

  c.innerHTML = `
    <div class="view-head"><div>
      <h1>问卷管理</h1>
      <div class="sub">维护小程序问卷题目与分值、风险分类与判定参数；支持草稿 / 发布分离与导入导出</div>
    </div>
      <div class="editor-actions">
        <button class="btn btn-ghost btn-sm" id="expQ">⬇ 导出 JSON</button>
        <button class="btn btn-ghost btn-sm" id="impQ">⬆ 导入 JSON</button>
        <input type="file" id="impFile" accept="application/json,.json" hidden>
        <button class="btn btn-primary btn-sm" id="saveDraft">保存草稿</button>
        ${dirty ? `<button class="btn btn-warn btn-sm" id="discardQ">放弃修改</button>` : ''}
        <button class="btn btn-success btn-sm" id="publishQ">🚀 发布到小程序</button>
      </div>
    </div>
    ${statusHtml}

    <div class="panel">
      <div class="panel-head-row">
        <h3>风险分类（F / DE / 高危 / 一般 四类，仅可修改显示名 / 颜色 / 文案，不可增删）</h3>
      </div>
      <div id="catList">${catRows}</div>
    </div>

    <div class="panel">
      <div class="panel-head-row">
        <h3>判定参数（C 类最少触发项数）</h3>
      </div>
      <div id="cfgWrap">${cfgCard(cfg)}</div>
    </div>

    <div class="panel">
      <h3>问卷题目（可直接编辑题干 / 选项 / 证据等级；选项级证据用于判定风险分类）</h3>
      <div id="qList">${q.map((qq, i) => qCard(qq, i)).join('')}</div>
      <button class="btn btn-ghost" id="addQ">+ 新增题目</button>
    </div>`;

  bindQuestionnaire(c);
}

function bindQuestionnaire(c) {
  if (!can('questionnaire.write')) { ['saveDraft', 'publishQ', 'discardQ', 'addQ', 'impQ', 'expQ'].forEach(id => { const el = $('#' + id); if (el) el.hidden = true; }); c.querySelectorAll('.q-del, .opt-del').forEach(b => b.hidden = true); }
  // 题目文本
  c.querySelectorAll('.q-text').forEach(inp => inp.addEventListener('input', e => {
    state._qDraft[+e.target.closest('.q-edit-card').dataset.qi].q = e.target.value;
  }));
  // 题目证据等级
  c.querySelectorAll('.q-evidence').forEach(inp => inp.addEventListener('change', e => {
    state._qDraft[+e.target.closest('.q-edit-card').dataset.qi].evidence = e.target.value;
  }));
  // 选项文本
  c.querySelectorAll('.opt-text').forEach(inp => inp.addEventListener('input', e => {
    const card = e.target.closest('.q-edit-card'); const qi = +card.dataset.qi; const oi = +e.target.closest('.opt-row').dataset.oi;
    state._qDraft[qi].options[oi].text = e.target.value;
  }));
  // 选项级证据（选中该选项即触发对应证据类，如 F 代表“已确诊”）
  c.querySelectorAll('.opt-evidence').forEach(inp => inp.addEventListener('change', e => {
    const card = e.target.closest('.q-edit-card'); const qi = +card.dataset.qi; const oi = +e.target.closest('.opt-row').dataset.oi;
    state._qDraft[qi].options[oi].evidence = e.target.value;
  }));
  // 题目「选是后免填后续」开关
  c.querySelectorAll('.q-skiprest-cb').forEach(inp => inp.addEventListener('change', e => {
    state._qDraft[+e.target.closest('.q-edit-card').dataset.qi].skipRest = e.target.checked;
  }));

  // 风险分类字段回写
  c.querySelectorAll('.cat-label').forEach(inp => inp.addEventListener('input', e => { state._catDraft[+e.target.dataset.ci].label = e.target.value; }));
  c.querySelectorAll('.cat-headline').forEach(inp => inp.addEventListener('input', e => { state._catDraft[+e.target.dataset.ci].headline = e.target.value; }));
  c.querySelectorAll('.cat-detail').forEach(inp => inp.addEventListener('input', e => { state._catDraft[+e.target.dataset.ci].detail = e.target.value; }));
  c.querySelectorAll('.cat-color').forEach(inp => inp.addEventListener('input', e => { state._catDraft[+e.target.dataset.ci].color = e.target.value; }));
  // 判定参数回写
  const cfgNum = (sel, key) => c.querySelectorAll(sel).forEach(inp => inp.addEventListener('input', e => { const v = e.target.value.trim(); state._cfgDraft[key] = v === '' ? '' : Number(v); }));
  cfgNum('.cfg-cmin', 'cMinCount');

  // 删除选项
  c.querySelectorAll('.opt-del').forEach(b => b.addEventListener('click', () => {
    const qi = +b.closest('.q-edit-card').dataset.qi, oi = +b.closest('.opt-row').dataset.oi;
    if (state._qDraft[qi].options.length <= 1) { alert('每题至少保留一个选项'); return; }
    state._qDraft[qi].options.splice(oi, 1); paintQuestionnaire(c);
  }));
  // 添加选项
  c.querySelectorAll('.opt-add').forEach(b => b.addEventListener('click', () => {
    state._qDraft[+b.dataset.qi].options.push({ text: '新选项', score: 0, risk: false }); paintQuestionnaire(c);
  }));
  // 删除题目
  c.querySelectorAll('.q-del').forEach(b => b.addEventListener('click', () => {
    const qi = +b.dataset.qi;
    if (state._qDraft.length <= 1) { alert('至少保留一题'); return; }
    state._qDraft.splice(qi, 1); paintQuestionnaire(c);
  }));
  // 新增题目
  $('#addQ').addEventListener('click', () => {
    state._qDraft.push({
      id: 'q' + Date.now().toString(36), no: '', sc: '', evidenceClass: '', rule: '', maxScore: null,
      section: '', type: 'single', evidence: '', showIf: undefined, skipRest: false, q: '新题目',
      options: [{ text: '有', evidence: '' }, { text: '无', evidence: '' }]
    });
    paintQuestionnaire(c);
  });

  // 导出 JSON
  $('#expQ').addEventListener('click', () => {
    const payload = { version: 2, questionnaire: state._qDraft, riskCategories: state._catDraft, riskConfig: state._cfgDraft };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'questionnaire-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  // 导入 JSON
  $('#impQ').addEventListener('click', () => $('#impFile').click());
  $('#impFile').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(reader.result);
        const q = Array.isArray(j) ? j : j.questionnaire;
        if (!Array.isArray(q) || q.length === 0) throw new Error('未找到有效的 questionnaire 数组');
        state._qDraft = q;
        if (Array.isArray(j.riskCategories) && j.riskCategories.length) state._catDraft = j.riskCategories;
        if (j.riskConfig && typeof j.riskConfig === 'object') state._cfgDraft = j.riskConfig;
        paintQuestionnaire(c);
        alert('已导入到编辑区，请检查后「保存草稿」并「发布」。');
      } catch (err) { alert('导入失败：' + err.message); }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  // 保存草稿（三类一起存草稿）
  $('#saveDraft').addEventListener('click', async () => {
    if (!validateEditor()) return;
    try {
      await api('/api/questionnaire', { method: 'PUT', body: state._qDraft });
      await api('/api/risk-categories', { method: 'PUT', body: state._catDraft });
      await api('/api/risk-config', { method: 'PUT', body: state._cfgDraft });
      state._qDirty = state._catDirty = state._cfgDirty = true;
      alert('草稿已保存（问卷 / 风险分类 / 判定参数）。点击「发布」才会同步到小程序。');
      loadView('questionnaire');
    } catch (e) { alert('保存失败：' + e.message); }
  });
  // 发布（三类一起发布）
  $('#publishQ').addEventListener('click', async () => {
    if (!validateEditor()) return;
    if (!confirm('确认发布到小程序？当前编辑内容将覆盖线上问卷、风险分类与判定参数。')) return;
    try {
      await api('/api/questionnaire', { method: 'PUT', body: state._qDraft });
      await api('/api/risk-categories', { method: 'PUT', body: state._catDraft });
      await api('/api/risk-config', { method: 'PUT', body: state._cfgDraft });
      await api('/api/questionnaire/publish', { method: 'POST' });
      await api('/api/risk-categories/publish', { method: 'POST' });
      await api('/api/risk-config/publish', { method: 'POST' });
      state._qDirty = state._catDirty = state._cfgDirty = false;
      alert('已发布，小程序端刷新即可生效。');
      loadView('questionnaire');
    } catch (e) { alert('发布失败：' + e.message); }
  });
  // 放弃修改（三类一起放弃）
  const discard = $('#discardQ');
  if (discard) discard.addEventListener('click', async () => {
    if (!confirm('确定放弃未发布的草稿修改？问卷 / 风险分类 / 判定参数将恢复到已发布版本。')) return;
    try {
      await api('/api/questionnaire/discard', { method: 'POST' });
      await api('/api/risk-categories/discard', { method: 'POST' });
      await api('/api/risk-config/discard', { method: 'POST' });
      alert('已放弃草稿，恢复到已发布版本。');
      loadView('questionnaire');
    } catch (e) { alert('操作失败：' + e.message); }
  });
}

/* 编辑区校验：题目、风险分类与判定参数基本合法性 */
function validateEditor() {
  for (let i = 0; i < state._qDraft.length; i++) {
    if (!state._qDraft[i].q || !state._qDraft[i].q.trim()) { alert('第 ' + (i + 1) + ' 题题干为空'); return false; }
    if (!state._qDraft[i].options.length) { alert('第 ' + (i + 1) + ' 题至少需要一个选项'); return false; }
    for (let j = 0; j < state._qDraft[i].options.length; j++) {
      if (!state._qDraft[i].options[j].text || !String(state._qDraft[i].options[j].text).trim()) { alert('第 ' + (i + 1) + ' 题第 ' + (j + 1) + ' 个选项文本为空'); return false; }
    }
  }
  const cats = state._catDraft || [];
  for (let i = 0; i < cats.length; i++) {
    if (!cats[i].label || !cats[i].label.trim()) { alert('第 ' + (i + 1) + ' 个风险分类显示名为空'); return false; }
    if (!cats[i].headline || !cats[i].headline.trim()) { alert('第 ' + (i + 1) + ' 个风险分类结果标题为空'); return false; }
  }
  const cfg = state._cfgDraft || {};
  const cMin = cfg.cMinCount;
  if (cMin === '' || cMin == null || !Number.isFinite(Number(cMin)) || Number(cMin) < 0) { alert('判定参数 cMinCount 需为有效非负数'); return false; }
  return true;
}

/* ---------------- 确认弹窗 ---------------- */
function confirmModal(title, text, onOk) {
  openModal(title, `<p style="line-height:1.7">${esc(text)}</p>
    <div class="modal-actions"><button class="btn btn-ghost" id="cCancel">取消</button><button class="btn btn-primary" id="cOk">确定</button></div>`);
  $('#cCancel').addEventListener('click', closeModal);
  $('#cOk').addEventListener('click', onOk);
}

/* ---------------- 缓存列表（供编辑表单读取） ---------------- */
async function prefetchLists() {
  try { state._hospitals = await api('/api/hospitals'); } catch (e) {}
  try { const a = await api('/api/articles'); state._articles = [...(a.science || []), ...(a.news || [])]; } catch (e) {}
}

/* ---------------- 外网链接管理 ---------------- */
async function renderLinks(c) {
  const s = await api('/api/settings');
  c.innerHTML = `
    <div class="view-head"><div>
      <h1>外网链接管理</h1>
      <div class="sub">配置并复制要发给用户的外网访问地址。用户通过「用户访问地址」在手机浏览器打开即用；管理员通过「后台管理地址」进入后台。链接变更后请在此更新，确保发给用户的是最新地址。</div>
    </div></div>
    <div class="panel">
      <div class="link-row">
        <div class="link-label">用户访问地址 <span class="muted">（发给用户，手机浏览器打开即用）</span></div>
        <div class="link-val"><input id="lkPublic" class="link-input" value="${esc(s.publicLink)}" placeholder="https://xxx.trycloudflare.com/"></div>
        <button class="btn btn-ghost btn-sm" id="cpPublic">复制</button>
      </div>
      <div class="link-row">
        <div class="link-label">后台管理地址 <span class="muted">（管理员进入后台）</span></div>
        <div class="link-val"><input id="lkAdmin" class="link-input" value="${esc(s.adminLink)}" placeholder="https://xxx.trycloudflare.com/admin"></div>
        <button class="btn btn-ghost btn-sm" id="cpAdmin">复制</button>
      </div>
      <div class="link-row link-row-col">
        <div class="link-label">分享说明 <span class="muted">（可选，附在链接后发给用户的话术）</span></div>
        <textarea id="lkNote" class="link-input" placeholder="如：欢迎使用乳腺健康自查，点击链接即可在手机浏览器中使用，无需下载 App。">${esc(s.publicNote || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm" id="lkReset">重置为已保存地址</button>
        <button class="btn btn-primary" id="lkSave">保存</button>
      </div>
      <p class="muted" id="lkStat"></p>
    </div>`;
  $('#cpPublic').addEventListener('click', () => copyText($('#lkPublic').value));
  if (!can('links.write')) { const sv = $('#lkSave'); if (sv) sv.hidden = true; c.querySelectorAll('.link-input').forEach(i => i.readOnly = true); }
  $('#cpAdmin').addEventListener('click', () => copyText($('#lkAdmin').value));
  $('#lkReset').addEventListener('click', async () => {
    const cur = await api('/api/settings');
    $('#lkPublic').value = cur.publicLink || '';
    $('#lkAdmin').value = cur.adminLink || '';
    $('#lkNote').value = cur.publicNote || '';
  });
  $('#lkSave').addEventListener('click', async () => {
    const stat = $('#lkStat'); stat.textContent = '保存中…';
    try {
      await api('/api/settings', { method: 'PUT', body: { publicLink: $('#lkPublic').value.trim(), adminLink: $('#lkAdmin').value.trim(), publicNote: $('#lkNote').value } });
      stat.textContent = '✓ 已保存';
    } catch (e) { stat.textContent = '保存失败：' + e.message; }
  });
}

function copyText(t) {
  if (!t) { alert('地址为空，请先填写或保存'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => alert('已复制：' + t)).catch(() => fallbackCopy(t));
  } else fallbackCopy(t);
}
function fallbackCopy(t) {
  const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); alert('已复制：' + t); } catch (e) { alert('复制失败，请手动复制：\n' + t); }
  document.body.removeChild(ta);
}

/* ---------------- 后台账号管理 ---------------- */
async function renderAccounts(c) {
  const list = await api('/api/accounts');
  const roles = await api('/api/roles').catch(() => []);
  const roleMap = {}; roles.forEach(r => roleMap[r.key] = r.name);
  const roleOpts = roles.map(r => `<option value="${esc(r.key)}">${esc(r.name)}</option>`).join('');
  const rows = list.map(a => `
    <tr>
      <td><b>${esc(a.name)}</b><div class="muted">${esc(a.username)}</div></td>
      <td>${esc(roleMap[a.role] || a.role)}</td>
      <td>${a.disabled ? '<span class="tag warn">已停用</span>' : '<span class="tag ok">启用</span>'}</td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${a.id}">编辑</button>
        <button class="btn btn-danger btn-sm" data-del="${a.id}">删除</button>
      </div></td>
    </tr>`).join('');
  c.innerHTML = `
    <div class="view-head"><div><h1>后台账号管理</h1><div class="sub">管理可登录后台的账号，分配角色与权限；密码以 SHA-256 存储，不明文保存。</div></div>
      <button class="btn btn-primary" id="addAcc">+ 新增账号</button></div>
    <div class="panel" style="padding:0;overflow:auto">
      <table class="tbl"><thead><tr><th>姓名 / 用户名</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="empty">暂无账号</td></tr>'}</tbody></table>
    </div>`;
  $('#addAcc').addEventListener('click', () => accountForm(null, roleOpts));
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => accountForm(b.dataset.edit, roleOpts, list.find(x => x.id === b.dataset.edit))));
  $$('[data-del]').forEach(b => b.addEventListener('click', () => {
    confirmModal('删除账号', '确定删除该后台账号？', async () => {
      try { await api('/api/accounts/' + b.dataset.del, { method: 'DELETE' }); closeModal(); loadView('accounts'); }
      catch (e) { alert(e.message); closeModal(); }
    });
  }));
}
function accountForm(id, roleOpts, a) {
  const isEdit = !!id;
  const v = (k) => a ? esc(a[k]) : '';
  const curRole = a ? a.role : 'editor';
  openModal(isEdit ? '编辑账号' : '新增账号', `
    <div class="field"><label>用户名 *</label><input id="f_uname" value="${v('username')}" ${isEdit ? 'readonly' : ''} placeholder="登录用户名"></div>
    <div class="field"><label>姓名</label><input id="f_name" value="${v('name')}" placeholder="显示名称"></div>
    <div class="field"><label>角色</label><select id="f_role">${roleOpts.replace('value="' + curRole + '"', 'value="' + curRole + '" selected')}</select></div>
    <div class="field"><label>${isEdit ? '重置密码（留空则不修改）' : '初始密码 *（至少 6 位）'}</label><input id="f_pwd" type="password" placeholder="${isEdit ? '留空不修改' : '至少 6 位'}"></div>
    ${isEdit ? `<div class="field"><label>状态</label><select id="f_dis"><option value="false" ${a && !a.disabled ? 'selected' : ''}>启用</option><option value="true" ${a && a.disabled ? 'selected' : ''}>停用</option></select></div>` : ''}
    <div class="modal-actions"><button class="btn btn-ghost" id="cancel">取消</button><button class="btn btn-primary" id="save">保存</button></div>`);
  $('#cancel').addEventListener('click', closeModal);
  $('#save').addEventListener('click', async () => {
    const body = { username: $('#f_uname').value.trim(), name: $('#f_name').value.trim(), role: $('#f_role').value };
    if (!body.username) { alert('请填写用户名'); return; }
    if (!isEdit) { body.password = $('#f_pwd').value; if (body.password.length < 6) { alert('密码至少 6 位'); return; } }
    else { const p = $('#f_pwd').value; if (p) { if (p.length < 6) { alert('密码至少 6 位'); return; } body.password = p; } body.disabled = ($('#f_dis') && $('#f_dis').value === 'true'); }
    try {
      if (isEdit) await api('/api/accounts/' + id, { method: 'PUT', body });
      else await api('/api/accounts', { method: 'POST', body });
      closeModal(); loadView('accounts');
    } catch (e) { alert('保存失败：' + e.message); }
  });
}

/* ---------------- 角色管理 ---------------- */
async function renderRoles(c) {
  const roles = await api('/api/roles');
  const rows = roles.map(r => `
    <tr>
      <td><b>${esc(r.name)}</b><div class="muted">${esc(r.key)}</div></td>
      <td>${ALL_PERMS_UI.filter(p => (r.perms || []).includes(p)).map(p => `<span class="tag">${esc(PERM_LABELS[p])}</span>`).join(' ') || '<span class="muted">无</span>'}</td>
      <td><div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${esc(r.key)}">编辑</button>
        <button class="btn btn-danger btn-sm" data-del="${esc(r.key)}">删除</button>
      </div></td>
    </tr>`).join('');
  c.innerHTML = `
    <div class="view-head"><div><h1>角色管理</h1><div class="sub">定义角色及其权限点；账号通过角色获得权限（超级管理员拥有全部权限）。</div></div>
      <button class="btn btn-primary" id="addRole">+ 新增角色</button></div>
    <div class="panel" style="padding:0;overflow:auto">
      <table class="tbl"><thead><tr><th>角色</th><th>权限</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" class="empty">暂无角色</td></tr>'}</tbody></table>
    </div>`;
  $('#addRole').addEventListener('click', () => roleForm(null));
  $$('[data-edit]').forEach(b => b.addEventListener('click', () => roleForm(roles.find(x => x.key === b.dataset.edit))));
  $$('[data-del]').forEach(b => b.addEventListener('click', () => {
    confirmModal('删除角色', '确定删除该角色？仍有账号使用它时将无法删除。', async () => {
      try { await api('/api/roles/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); closeModal(); loadView('roles'); }
      catch (e) { alert(e.message); closeModal(); }
    });
  }));
}
function roleForm(r) {
  const isEdit = !!r;
  const v = (k) => r ? esc(r[k]) : '';
  const cur = (r && r.perms) || [];
  const checks = ALL_PERMS_UI.map(p => `<label class="perm-chk"><input type="checkbox" value="${p}" ${cur.includes(p) ? 'checked' : ''}> ${esc(PERM_LABELS[p])}</label>`).join('');
  openModal(isEdit ? '编辑角色' : '新增角色', `
    <div class="field"><label>角色标识 *（英文，如 operator）</label><input id="f_rkey" value="${v('key')}" ${isEdit ? 'readonly' : ''} placeholder="role_key"></div>
    <div class="field"><label>角色名称</label><input id="f_rname" value="${v('name')}" placeholder="如：运营"></div>
    <div class="field full"><label>权限点</label><div class="perm-grid">${checks}</div></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="cancel">取消</button><button class="btn btn-primary" id="save">保存</button></div>`);
  $('#cancel').addEventListener('click', closeModal);
  $('#save').addEventListener('click', async () => {
    const key = $('#f_rkey').value.trim(); const name = $('#f_rname').value.trim();
    if (!key) { alert('请填写角色标识'); return; }
    const perms = $$('.perm-chk input').filter(i => i.checked).map(i => i.value);
    const body = { key, name, perms };
    try {
      if (isEdit) await api('/api/roles/' + encodeURIComponent(key), { method: 'PUT', body });
      else await api('/api/roles', { method: 'POST', body });
      closeModal(); loadView('roles');
    } catch (e) { alert('保存失败：' + e.message); }
  });
}

/* ---------------- 操作日志 ---------------- */
async function renderLogs(c) {
  const list = await api('/api/logs');
  const rows = list.map(l => `
    <tr>
      <td class="nowrap">${esc((l.time || '').slice(0, 16).replace('T', ' '))}</td>
      <td>${esc(l.username)}</td>
      <td><span class="tag">${esc(l.action)}</span></td>
      <td>${esc(l.target)}</td>
      <td class="muted">${esc(l.detail)}</td>
    </tr>`).join('');
  c.innerHTML = `
    <div class="view-head"><div><h1>操作日志</h1><div class="sub">记录后台账号的关键操作（登录、内容编辑、账号/角色变更等），便于审计追溯。</div></div></div>
    <div class="panel" style="padding:0;overflow:auto">
      <table class="tbl"><thead><tr><th>时间</th><th>账号</th><th>动作</th><th>对象</th><th>详情</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty">暂无日志</td></tr>'}</tbody></table>
    </div>`;
}

/* ---------------- 启动 ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  $('#modalMask').addEventListener('click', e => { if (e.target.id === 'modalMask') closeModal(); });
  bindLogin();
  if (getToken()) {
    fetch('/api/me', { headers: { 'x-admin-token': getToken() } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(acc => { state.account = acc; enterAdmin(); prefetchLists(); })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); showLogin(); });
  } else showLogin();
});
