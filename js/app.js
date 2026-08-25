/* ============================================================
 *  乳腺健康自查小程序 - 逻辑层
 * ============================================================ */
'use strict';

/* ---------- 全局状态 ---------- */
const state = {
  activeTab: 'questionnaire',
  answers: {},          // qid -> optionIndex
  currentResult: null,  // { score, level, date, answers, basicInfo }
  scienceCat: 'science',
  profile: { name: '匿名用户', age: '' },
  basicInfo: { age: '', height: '', weight: '', bmi: '' },
  reminder: false,
  hospCity: ''           // 结果页医院城市筛选
};

/* ---------- 本地存储 ---------- */
const LS = {
  history: 'bcs_history',
  profile: 'bcs_profile',
  reminder: 'bcs_reminder'
};
function loadStore() {
  try {
    const h = JSON.parse(localStorage.getItem(LS.history) || '[]');
    state.history = Array.isArray(h) ? h : [];
  } catch (e) { state.history = []; }
  try {
    const p = JSON.parse(localStorage.getItem(LS.profile) || 'null');
    if (p) state.profile = p;
  } catch (e) {}
  state.reminder = localStorage.getItem(LS.reminder) === '1';
}
function saveHistory() { localStorage.setItem(LS.history, JSON.stringify(state.history)); }
function saveProfile() { localStorage.setItem(LS.profile, JSON.stringify(state.profile)); }
function saveReminder() { localStorage.setItem(LS.reminder, state.reminder ? '1' : '0'); }

/* ---------- 工具 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 后端 API（与后台共享同一数据源） ---------- */
function api(path, opts = {}) {
  return fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(r => { if (!r.ok) throw new Error('请求失败 ' + r.status); return r.json(); });
}
function getUid() {
  let uid = localStorage.getItem('bcs_uid');
  if (!uid) { uid = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); localStorage.setItem('bcs_uid', uid); }
  return uid;
}

/* 简易步骤插图 */
function stepIcon(type) {
  const c = '#ff5c8a';
  switch (type) {
    case 'mirror': return `<svg viewBox="0 0 80 80"><rect x="6" y="10" width="34" height="60" rx="4" fill="#eef2f7" stroke="#cfd8e3"/><rect x="44" y="22" width="30" height="36" rx="3" fill="#dff3ff" stroke="${c}"/><circle cx="59" cy="38" r="9" fill="#fff" stroke="${c}"/><path d="M20 24v34" stroke="${c}" stroke-width="2" fill="none"/></svg>`;
    case 'lie': return `<svg viewBox="0 0 80 80"><ellipse cx="40" cy="44" rx="30" ry="18" fill="#ffe3ec" stroke="${c}"/><circle cx="40" cy="44" r="8" fill="#fff" stroke="${c}"/><path d="M14 44h52" stroke="${c}" stroke-width="2" stroke-dasharray="3 3"/></svg>`;
    case 'stand': return `<svg viewBox="0 0 80 80"><circle cx="40" cy="18" r="8" fill="#ffd9e6"/><path d="M40 26v22M40 34l-14 8M40 34l14 8M40 48l-10 18M40 48l10 18" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="40" cy="40" r="6" fill="${c}"/></svg>`;
    case 'armpit': return `<svg viewBox="0 0 80 80"><path d="M20 14c14 4 20 16 22 30 2 12 8 22 18 30" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="56" cy="58" r="6" fill="${c}"/></svg>`;
    case 'nipple': return `<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="20" fill="#ffe3ec" stroke="${c}"/><circle cx="40" cy="40" r="5" fill="${c}"/><path d="M40 60v12" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`;
    default: return `<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="20" fill="${c}"/></svg>`;
  }
}

/* ============================================================
 *  渲染分发
 * ============================================================ */
const TAB_TITLES = {
  questionnaire: '乳腺健康自查',
  tutorial: '自查教程',
  result: '筛查结果',
  science: '科普资讯',
  mine: '我的'
};

function render() {
  $('#appTitle').textContent = TAB_TITLES[state.activeTab] || '乳腺健康自查';
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.activeTab));
  const c = $('#appContent');
  switch (state.activeTab) {
    case 'questionnaire': c.innerHTML = renderQuestionnaire(); bindQuestionnaire(); break;
    case 'tutorial': c.innerHTML = renderTutorial(); bindTutorial(); break;
    case 'result': c.innerHTML = renderResult(); bindResult(); break;
    case 'science': c.innerHTML = renderScience(); bindScience(); break;
    case 'mine': c.innerHTML = renderMine(); bindMine(); break;
  }
  // 进度条置于顶部标题栏内（仅问卷页显示），始终连接在「乳腺健康自查」下方
  const hp = $('#headerProgress');
  if (state.activeTab === 'questionnaire') { hp.hidden = false; updateProgress(); }
  else hp.hidden = true;
  c.scrollTop = 0;
}

/* ============================================================
 *  问卷模块
 * ============================================================ */
/* 患者基本信息表单（年龄/身高/体重，BMI 自动计算且只展示不计入判定） */
function bindBasicInfo() {
  const age = $('#biAge'), h = $('#biHeight'), w = $('#biWeight');
  const setErr = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg || ''; };
  const checkNum = (inp, errId) => {
    const v = inp ? inp.value.trim() : '';
    // 非数字（且非空）立即提示“请输入数字”
    if (v !== '' && (isNaN(Number(v)) || !isFinite(Number(v)))) setErr(errId, '请输入数字');
    else setErr(errId, '');
  };
  const updateBmi = () => {
    const b = { age: age ? age.value.trim() : '', height: h ? h.value.trim() : '', weight: w ? w.value.trim() : '' };
    state.basicInfo.age = b.age; state.basicInfo.height = b.height; state.basicInfo.weight = b.weight;
    const bmi = calcBMI(b.height, b.weight);
    state.basicInfo.bmi = (bmi === '' || bmi == null) ? '' : String(bmi);
    const g = bmi ? bmiGrade(bmi) : null;
    const el = $('#biBmi');
    if (el) { el.textContent = bmi ? (bmi + ' · ' + g.label) : '自动计算'; el.className = 'bi-bmi' + (g ? (' bmi-' + g.cls) : ''); }
  };
  if (age) age.addEventListener('input', () => { checkNum(age, 'biErrAge'); updateBmi(); });
  if (h) h.addEventListener('input', () => { checkNum(h, 'biErrHeight'); updateBmi(); });
  if (w) w.addEventListener('input', () => { checkNum(w, 'biErrWeight'); updateBmi(); });
}

/* 仅渲染可见题目（条件题随对应选项点击出现），供初始与可见性变化后复用 */
function renderQuestionListHTML() {
  const visible = getVisibleQuestions(state.answers);
  return visible.map((item, i) => {
    const opts = item.options.map((o, oi) => {
      const sel = state.answers[item.id] === oi ? 'selected' : '';
      return `<div class="opt ${sel}" data-q="${item.id}" data-o="${oi}">
                <span class="opt-dot"></span><span>${esc(o.text)}</span>
              </div>`;
    }).join('');
    return `<div class="q-card">
              <div class="q-num">${i + 1}</div>
              <div class="q-body">
                <div class="q-text">${esc(item.q)}</div>
                <div class="opt-list">${opts}</div>
              </div>
            </div>`;
  }).join('');
}

function renderQuestionnaire() {
  const visible = getVisibleQuestions(state.answers);
  const total = visible.length;
  const bi = state.basicInfo;
  const bmiG = bi.bmi ? bmiGrade(bi.bmi) : null;
  const bmiText = bi.bmi ? (bi.bmi + ' · ' + bmiG.label) : '自动计算';
  const bmiCls = 'bi-bmi' + (bmiG ? (' bmi-' + bmiG.cls) : '');
  const basicInfoHtml = `
    <div class="basic-info">
      <div class="bi-title">患者基本信息 <span class="bi-req">* 必填</span></div>
      <div class="bi-grid">
        <div class="bi-field"><label>年龄</label><input id="biAge" type="number" min="1" max="120" value="${esc(bi.age)}" placeholder="岁"><div class="bi-err" id="biErrAge"></div></div>
        <div class="bi-field"><label>身高 (cm)</label><input id="biHeight" type="number" min="50" max="250" value="${esc(bi.height)}" placeholder="如 162"><div class="bi-err" id="biErrHeight"></div></div>
        <div class="bi-field"><label>体重 (kg)</label><input id="biWeight" type="number" min="20" max="300" value="${esc(bi.weight)}" placeholder="如 55"><div class="bi-err" id="biErrWeight"></div></div>
        <div class="bi-field"><label>BMI</label><div id="biBmi" class="${bmiCls}">${bmiText}</div></div>
      </div>
      <div class="bi-msg" id="biMsg"></div>
    </div>`;

  return `
    <div class="page">
      <div class="hero">
        <div class="hero-badge">自我筛查</div>
        <h2>乳腺癌风险自评问卷</h2>
        <p>共 18 道题目（含条件题，部分会随您的作答逐步出现）。完成后将获得风险评估与就诊建议。</p>
      </div>
      ${basicInfoHtml}
      <div class="q-list" id="qList">${renderQuestionListHTML()}</div>
      <button class="btn-primary" id="submitBtn">提交并查看结果</button>
      <p class="disclaimer">本问卷仅作健康风险提示，不能替代医生诊断。如有不适请及时就医。</p>
    </div>`;
}

function updateProgress() {
  const visible = getVisibleQuestions(state.answers);
  const total = visible.length;
  const answered = visible.filter(q => state.answers[q.id] != null).length;
  const bar = document.querySelector('#headerProgressFill');
  const tip = document.querySelector('#headerProgressTip');
  if (bar) bar.style.width = (total ? answered / total * 100 : 0) + '%';
  if (tip) tip.textContent = `已回答 ${answered} / ${total} 题`;
  const btn = document.querySelector('#submitBtn');
  if (btn) {
    const done = total > 0 && answered >= total;
    btn.classList.toggle('disabled', !done);
    if (done) btn.removeAttribute('disabled'); else btn.setAttribute('disabled', '');
    btn.textContent = done ? '提交并查看结果' : '请先完成全部题目';
  }
}

/* 清理被隐藏（条件未触发）题目的答案，避免影响评分 */
function pruneHiddenAnswers() {
  const visibleIds = new Set(getVisibleQuestions(state.answers).map(q => q.id));
  Object.keys(state.answers).forEach(qid => { if (!visibleIds.has(qid)) delete state.answers[qid]; });
}

function bindQuestionnaire() {
  bindBasicInfo();
  bindQuestionList();
  const btn = $('#submitBtn');
  if (btn) btn.addEventListener('click', submitQuestionnaire);
}

/* 仅绑定题目列表内选项，便于可见性变化后局部重渲染（保留滚动位置，避免跳顶） */
function bindQuestionList() {
  const list = $('#qList');
  if (!list) return;
  list.querySelectorAll('.opt').forEach(el => {
    el.addEventListener('click', () => {
      const qid = el.dataset.q;
      const oi = Number(el.dataset.o);
      const before = getVisibleQuestions(state.answers).map(q => q.id).join(',');
      state.answers[qid] = oi;
      pruneHiddenAnswers();
      const after = getVisibleQuestions(state.answers).map(q => q.id).join(',');
      if (before !== after) {
        // 可见题目集合变化（如点击“已绝经”带出绝经年龄题）：局部重渲染，保留滚动位置
        const sc = $('#appContent').scrollTop;
        list.innerHTML = renderQuestionListHTML();
        $('#appContent').scrollTop = sc;
        bindQuestionList();
      } else {
        // 仅就地更新选中态与进度，不整体重绘——避免每次答题滚动回顶部
        const group = el.closest('.opt-list');
        if (group) group.querySelectorAll('.opt').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
      }
      updateProgress();
    });
  });
}

/* 将输入框中的基本信息同步进 state（防止仅输入未触发 input 事件的情况） */
function syncBasicInfo() {
  const age = $('#biAge'), h = $('#biHeight'), w = $('#biWeight');
  if (age) state.basicInfo.age = age.value.trim();
  if (h) state.basicInfo.height = h.value.trim();
  if (w) state.basicInfo.weight = w.value.trim();
}
/* 基本信息校验：年龄/身高/体重必填且必须为数字；不通过则返回提示文案并定位到表单 */
function validateBasicInfo() {
  const fields = [['age', '年龄', 'biErrAge'], ['height', '身高', 'biErrHeight'], ['weight', '体重', 'biErrWeight']];
  let firstMissing = null;
  for (const [k, label, errId] of fields) {
    const v = (state.basicInfo[k] || '').toString().trim();
    const errEl = document.getElementById(errId);
    if (errEl) errEl.textContent = '';
    if (v === '') { if (errEl) errEl.textContent = '请填写' + label; if (!firstMissing) firstMissing = label; }
    else if (isNaN(Number(v)) || !isFinite(Number(v))) { if (errEl) errEl.textContent = '请输入数字'; if (!firstMissing) firstMissing = label; }
  }
  if (firstMissing) {
    const msg = $('#biMsg');
    if (msg) { msg.textContent = '请完整填写患者基本信息（年龄 / 身高 / 体重）后再提交'; msg.classList.add('show'); }
    const box = document.querySelector('.basic-info');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  const msg = $('#biMsg');
  if (msg) { msg.textContent = ''; msg.classList.remove('show'); }
  return true;
}

async function submitQuestionnaire() {
  // 基本信息必填校验（年龄/身高/体重 不能为空且必须为数字）
  syncBasicInfo();
  if (!validateBasicInfo()) return;
  const a = getRiskAssessment(state.answers);   // 前端按证据规则计算（与后端一致）
  const record = {
    date: new Date().toISOString(),
    score: a.score, level: a.label, levelKey: a.key, levelColor: a.color,
    triggered: a.triggered, answers: { ...state.answers }, basicInfo: { ...state.basicInfo }
  };
  state.currentResult = record;
  state.history.unshift(record);
  if (state.history.length > 20) state.history = state.history.slice(0, 20);
  saveHistory();
  // 同步到后端（后台据此统计，后端会按证据规则权威复算）
  try {
    await api('/api/submissions', { method: 'POST', body: {
      uid: getUid(), name: state.profile.name,
      age: state.basicInfo.age,
      basicInfo: state.basicInfo,
      answers: record.answers, score: a.score, levelKey: a.key, level: a.label, triggered: a.triggered
    }});
  } catch (e) { /* 离线时保留本地记录 */ }
  state.activeTab = 'result';
  render();
}

/* ============================================================
 *  结果模块
 * ============================================================ */
function renderResult() {
  // 结果始终以「我的」模块中最新一条筛查记录为准（history[0] 为最近一次）
  const latest = state.history[0];
  if (!latest) {
    return `<div class="page empty">
      <div class="empty-ico">📋</div>
      <h3>还没有筛查结果</h3>
      <p>完成「问卷」后即可在这里查看风险评估与就诊建议。</p>
      <button class="btn-primary" id="goQuiz">去填写问卷</button>
    </div>`;
  }
  const r = latest;
  const lv = getRiskAssessment(r.answers);
  const urgent = ['F', 'DE', '高危'].includes(lv.key);
  const bi = r.basicInfo || {};
  const bmiLine = (bi.age || bi.height || bi.weight)
    ? `<div class="result-bmi">基本信息：年龄 ${esc(bi.age || '—')} · 身高 ${esc(bi.height || '—')} cm · 体重 ${esc(bi.weight || '—')} kg${bi.bmi ? (' · BMI ' + esc(bi.bmi) + '（' + bmiGrade(bi.bmi).label + '）') : ''}</div>`
    : '';

  const hospHeader = urgent
    ? `<div class="hosp-tip danger">⚠️ 建议尽快前往以下医院的 <b>乳腺外科 / 肿瘤科</b> 就诊：</div>`
    : `<div class="hosp-tip">如需复诊或进一步筛查，以下医院可提供专业服务：</div>`;

  const hospCities = [...new Set(HOSPITALS.map(h => h.city).filter(Boolean))];
  const hospCityOpts = ['<option value="">全部城市</option>']
    .concat(hospCities.map(c => `<option value="${esc(c)}" ${state.hospCity === c ? 'selected' : ''}>${esc(c)}</option>`))
    .join('');
  const hospFiltered = state.hospCity ? HOSPITALS.filter(h => h.city === state.hospCity) : HOSPITALS;
  const hospitals = hospFiltered.map((h, i) => `
    <div class="hosp-card">
      <div class="hosp-head">
        <div>
          <div class="hosp-name">${esc(h.name)}</div>
          <div class="hosp-level">${esc(h.level)}</div>
        </div>
        <div class="hosp-city">${esc(h.city)}</div>
      </div>
      <div class="hosp-info">
        <div><span class="ico">🏥</span> 科室：${esc(h.department)}</div>
        <div><span class="ico">📍</span> 地址：${esc(h.address)}</div>
        <div><span class="ico">☎️</span> 电话：${esc(h.phone)}</div>
        <div class="hosp-note">${esc(h.note)}</div>
      </div>
    </div>`).join('');

  return `
    <div class="page">
      <div class="result-card" style="--rc:${lv.color}">
        <div class="result-top">
          <div class="result-score">${lv.score}<small>项证据触发</small></div>
          <div class="result-level">${esc(lv.label)}</div>
        </div>
        <div class="result-headline">${esc(lv.headline)}</div>
        <div class="result-detail">${esc(lv.detail)}</div>
        ${bmiLine}
        <div class="result-date">评估时间：${new Date(r.date).toLocaleString('zh-CN')}</div>
      </div>
      ${hospHeader}
      <div class="hosp-filter">
        <label>城市</label>
        <select id="hospCity">${hospCityOpts}</select>
        <span class="muted">共 ${hospFiltered.length} 家</span>
      </div>
      <div class="hosp-list">${hospitals}</div>
      <button class="btn-primary ghost-btn" id="redo">重新填写问卷</button>
      <p class="disclaimer">本结果由自评问卷生成，仅供健康参考，不构成医学诊断。</p>
    </div>`;
}

function bindResult() {
  const go = $('#goQuiz');
  if (go) go.addEventListener('click', () => { state.activeTab = 'questionnaire'; render(); });
  const redo = $('#redo');
  if (redo) redo.addEventListener('click', () => {
    state.answers = {}; state.activeTab = 'questionnaire'; render();
  });
  const hc = $('#hospCity');
  if (hc) hc.addEventListener('change', () => { state.hospCity = hc.value; render(); });
}

/* ============================================================
 *  教程模块（视频 + 图文，与问卷分离）
 * ============================================================ */
function renderTutorial() {
  const steps = TUTORIAL_STEPS.map((s, i) => `
    <div class="tut-step">
      <div class="tut-media">${s.image ? `<img class="tut-img" src="${esc(s.image)}" alt=""/>` : `<div class="tut-icon-fallback">${stepIcon(s.type)}</div>`}</div>
      <div class="tut-text">
        <div class="tut-title">${esc(s.title)}</div>
        <div class="tut-desc">${esc(s.desc)}</div>
      </div>
    </div>`).join('');

  return `
    <div class="page">
      <div class="hero small">
        <h2>乳房自我检查教程</h2>
        <p>每月一次，月经干净后 7–14 天最佳。请按下方图文步骤逐步自查。</p>
      </div>

      <div class="section-title">📖 图文步骤</div>
      <div class="tut-steps">${steps}</div>

      <div class="callout">
        <b>小提示：</b>自查目的是“了解自己的正常状态”，发现<b>新出现的、持续存在的</b>异常（肿块、溢液、皮肤改变）才需警惕。自查不能替代医院筛查。<br>
        若身体出现不适（如疼痛、异常出血、明显肿块等），请<b>及时就医</b>，由专业医生进行评估与诊断。
      </div>
      <p class="disclaimer">本教程为健康教育内容，不替代专业医疗指导。</p>
    </div>`;
}

function bindTutorial() {}

/* ============================================================
 *  科普 / 新闻模块
 * ============================================================ */
function renderScience() {
  const tabScience = state.scienceCat === 'science';
  const list = (tabScience ? SCIENCE_ARTICLES : NEWS).map((a, i) => `
    <div class="news-card" data-i="${i}">
      <div class="news-main">
        <div class="news-title">${esc(a.title)}</div>
        <div class="news-summary">${esc(a.summary)}</div>
      </div>
      ${tabScience ? `<span class="news-tag">${esc(a.tag)}</span>` : `<span class="news-date">${esc(a.date)}</span>`}
    </div>`).join('');

  return `
    <div class="page">
      <div class="seg">
        <div class="seg-item ${tabScience ? 'on' : ''}" data-cat="science">科普知识</div>
        <div class="seg-item ${!tabScience ? 'on' : ''}" data-cat="news">健康资讯</div>
      </div>
      <div class="news-list">${list}</div>
    </div>`;
}

function bindScience() {
  $$('.seg-item').forEach(el => {
    el.addEventListener('click', () => { state.scienceCat = el.dataset.cat; render(); });
  });
  $$('.news-card').forEach(el => {
    el.addEventListener('click', () => {
      const i = Number(el.dataset.i);
      const a = (state.scienceCat === 'science' ? SCIENCE_ARTICLES : NEWS)[i];
      openModal(state.scienceCat === 'science' ? '科普知识' : '健康资讯', `
        <h3 style="margin:0 0 8px">${esc(a.title)}</h3>
        ${a.source ? `<div class="modal-sub">来源：${esc(a.source)} · ${esc(a.date || '')}</div>` : ''}
        <p style="line-height:1.7;color:#444">${esc(a.content)}</p>
      `);
    });
  });
}

/* ============================================================
 *  我的模块
 * ============================================================ */
function renderMine() {
  const p = state.profile;
  const historyHtml = state.history.length
      ? state.history.map(h => {
        const lv = getRiskAssessment(h.answers);
        return `<div class="hist-row">
          <div class="hist-dot" style="background:${lv.color}"></div>
          <div class="hist-info">
            <div class="hist-level">${esc(lv.label)}</div>
            <div class="hist-date">${new Date(h.date).toLocaleString('zh-CN')}</div>
          </div>
        </div>`;
      }).join('')
    : `<div class="hist-empty">暂无筛查记录，去「问卷」完成第一次自评吧。</div>`;

  return `
    <div class="page">
      <div class="profile-card">
        <div class="avatar">${esc((p.name || '匿')[0])}</div>
        <div class="profile-meta">
          <div class="profile-name" id="nameView">${esc(p.name)}</div>
          <div class="profile-sub">${p.age ? esc(p.age) + ' 岁' : '未填写年龄'}</div>
        </div>
        <button class="profile-edit" id="editProfile">编辑</button>
      </div>

      <div class="mine-section">
        <div class="mine-section-title">筛查记录</div>
        <div class="hist-list">${historyHtml}</div>
        ${state.history.length ? `<button class="btn-ghost full" id="clearHist">清除全部记录</button>` : ''}
      </div>

      <div class="mine-section">
        <div class="mine-row" id="reminderRow">
          <div>
            <div class="mine-row-title">每月自查提醒</div>
            <div class="mine-row-sub">开启后将在首页提示您按时自查（演示）</div>
          </div>
          <div class="switch ${state.reminder ? 'on' : ''}" id="reminderSwitch"><span></span></div>
        </div>
      </div>

      <div class="mine-section">
        <div class="mine-row" id="aboutRow">
          <div class="mine-row-title">关于与免责声明</div>
          <div class="mine-row-arrow">›</div>
        </div>
      </div>

      <p class="disclaimer">本小程序为健康科普与自检引导工具，所有评估均不能替代执业医师的诊断与治疗。</p>
    </div>`;
}

function bindMine() {
  const edit = $('#editProfile');
  if (edit) edit.addEventListener('click', () => {
    openModal('编辑资料', `
      <label class="form-label">昵称</label>
      <input class="form-input" id="inpName" value="${esc(state.profile.name)}" maxlength="20" />
      <label class="form-label">年龄</label>
      <input class="form-input" id="inpAge" type="number" min="1" max="120" value="${esc(state.profile.age)}" placeholder="选填" />
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn-primary full" id="saveProfile">保存</button>
      </div>
    `);
    $('#saveProfile').addEventListener('click', async () => {
      const n = $('#inpName').value.trim() || '匿名用户';
      const a = $('#inpAge').value.trim();
      state.profile = { name: n, age: a };
      saveProfile();
      try { await api('/api/users', { method: 'POST', body: { uid: getUid(), name: n, age: a } }); } catch (e) {}
      closeModal();
      render();
    });
  });

  const rem = $('#reminderSwitch');
  if (rem) rem.addEventListener('click', () => {
    state.reminder = !state.reminder;
    saveReminder();
    rem.classList.toggle('on', state.reminder);
  });

  const clear = $('#clearHist');
  if (clear) clear.addEventListener('click', () => {
    openModal('清除记录', `<p>确定要清除全部筛查记录吗？此操作不可恢复。</p>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn-ghost full" id="mCancel">取消</button>
        <button class="btn-primary full" id="mOk">确定清除</button>
      </div>`, false);
    $('#mCancel').addEventListener('click', closeModal);
    $('#mOk').addEventListener('click', () => {
      state.history = []; saveHistory(); closeModal(); render();
    });
  });

  const about = $('#aboutRow');
  if (about) about.addEventListener('click', () => {
    openModal('关于与免责声明', `
      <p style="line-height:1.7">本「乳腺健康自查」小程序用于健康科普与乳房自我检查引导，包含自评问卷、风险参考、医院信息与自查教程。</p>
      <p style="line-height:1.7"><b>免责声明：</b>所有问卷评估、风险分级与医院信息均基于公开资料整理，<b>仅供健康参考，不能替代医生的诊断、检查与治疗</b>。若您有身体不适或高危信号，请尽快前往正规医院就诊。</p>
      <p style="line-height:1.7;color:#888">数据来源：中国抗癌协会乳腺癌诊治指南与规范（2026 年版）、CSCO / YBCC 共识等公开资料。</p>
    `);
  });
}

/* ============================================================
 *  弹层
 * ============================================================ */
function openModal(title, bodyHtml, showClose = true) {
  $('#modalBox').innerHTML = `
    <div class="modal-head">
      <div class="modal-title">${esc(title)}</div>
      ${showClose ? '<button class="modal-x" id="modalX">×</button>' : ''}
    </div>
    <div class="modal-body">${bodyHtml}</div>`;
  $('#modalMask').hidden = false;
  const x = $('#modalX');
  if (x) x.addEventListener('click', closeModal);
}
function closeModal() { $('#modalMask').hidden = true; }

/* ============================================================
 *  初始化
 * ============================================================ */
async function bootstrap() {
  try {
    const cfg = await api('/api/config');
    if (cfg.questionnaire) QUESTIONNAIRE = cfg.questionnaire;
    if (cfg.riskCategories) RISK_CATEGORIES = cfg.riskCategories;
    if (cfg.riskConfig) RISK_CONFIG = cfg.riskConfig;
    if (cfg.hospitals) HOSPITALS = cfg.hospitals;
    if (cfg.articles) {
      if (cfg.articles.science) SCIENCE_ARTICLES = cfg.articles.science;
      if (cfg.articles.news) NEWS = cfg.articles.news;
    }
    if (cfg.tutorials && cfg.tutorials.steps) {
      TUTORIAL_STEPS = cfg.tutorials.steps;
    }
  } catch (e) { /* 后端不可用时退回内置兜底数据 */ }
  await loadHistory();
}
async function loadHistory() {
  try {
    const list = await api('/api/submissions?uid=' + encodeURIComponent(getUid()));
    if (Array.isArray(list) && list.length) {
      state.history = list.map(s => ({
        date: s.date, score: s.score, level: s.level, levelKey: s.levelKey,
        triggered: s.triggered, answers: s.answers, basicInfo: s.basicInfo
      }));
    }
  } catch (e) {}
}

function init() {
  loadStore();
  $$('.tab').forEach(t => {
    t.addEventListener('click', () => { state.activeTab = t.dataset.tab; render(); });
  });
  $('#modalMask').addEventListener('click', (e) => {
    if (e.target.id === 'modalMask') closeModal();
  });
  bootstrap().then(render);
}

document.addEventListener('DOMContentLoaded', init);
