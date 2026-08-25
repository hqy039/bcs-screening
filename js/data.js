/* ============================================================
 *  乳腺健康自查小程序 - 数据层
 *  问卷与评分依据《乳腺癌筛查专业量表（三甲医院规则版）》及
 *  《乳腺癌筛查量表风险计算评分规则》配套使用。
 *  采用 A/B/C/D/E/F 六级证据分类 + 风险等级优先级判定模型。
 *  所有内容均为科普/演示用途，医院与指南信息基于公开资料整理。
 * ============================================================ */

/* ---------- 问卷题库（三甲医院规则版，18 题） ----------
 * 每题带 evidence：A/B/C/D/E/F 为风险证据类；'' 表示仅作条件跳转、不触发证据。
 * 选项 evidence：选中该选项时触发的证据类（F 类用 'F' 标记“已确诊”）。
 * 触发规则：选中选项 evidence 非空前，即认为该题证据被触发；C 类需累计 ≥ cMinCount 项。
 * showIf：条件显示（仅当前置题作答为指定选项时出现）；skipRest：选“是”后其余题目无需填写。
 * 注：第 10/11/12 题（激素替代治疗）为组合判定，证据由后端/前端组合逻辑统一处理，不依赖单选项 evidence。 */
var QUESTIONNAIRE = [
  {
    id: 'q1', section: '一、疾病确诊状态', type: 'bool', evidence: 'F', skipRest: true,
    q: '您是否已被确诊为乳腺癌或卵巢癌？',
    options: [{ text: '是，已确诊', evidence: 'F' }, { text: '否，未确诊', evidence: '' }]
  },
  {
    id: 'q2', section: '二、月经史', type: 'bool', evidence: 'B',
    q: '您首次来月经的年龄是否在 12 周岁以前（早于 12 周岁）？',
    options: [{ text: '是，早于 12 周岁', evidence: 'B' }, { text: '否，12 周岁及以后', evidence: '' }]
  },
  {
    id: 'q3', section: '二、月经史', type: 'bool', evidence: '',
    q: '您是否已经绝经？',
    options: [{ text: '是，已绝经', evidence: '' }, { text: '否，未绝经', evidence: '' }]
  },
  {
    id: 'q4', section: '二、月经史', type: 'bool', evidence: 'B',
    q: '您绝经时的年龄是否在 55 周岁及以上？',
    showIf: { q: 'q3', in: [0] },
    options: [{ text: '是，≥55 周岁', evidence: 'B' }, { text: '否，<55 周岁', evidence: '' }]
  },
  {
    id: 'q5', section: '三、生育史', type: 'single', evidence: 'C',
    q: '您生育第一胎时的年龄属于以下哪种情况？',
    options: [
      { text: 'A. 未生育过', evidence: '' },
      { text: 'B. 29 周岁及以前', evidence: '' },
      { text: 'C. 30 周岁及以上', evidence: 'C' }
    ]
  },
  {
    id: 'q6', section: '三、生育史', type: 'bool', evidence: 'C',
    q: '您的怀孕次数与活产次数之差是否达到 2 次及以上（即曾有 2 次及以上流产、胎停或死产）？',
    options: [{ text: '是，≥2 次', evidence: 'C' }, { text: '否，不足 2 次', evidence: '' }]
  },
  {
    id: 'q7', section: '四、家族遗传史', type: 'bool', evidence: 'A',
    q: '您的母亲、女儿、亲姐妹、表妹或堂妹中，是否有人患乳腺癌或卵巢癌？（与患病年龄无关）',
    options: [{ text: '是，有人患病', evidence: 'A' }, { text: '否，无人患病', evidence: '' }]
  },
  {
    id: 'q8', section: '四、家族遗传史', type: 'bool', evidence: 'A',
    q: '您的姑姑、姨、祖母或外祖母中，是否有两人及以上在 50 周岁及以前患乳腺癌或卵巢癌？',
    options: [{ text: '是，两人及以上且≤50岁', evidence: 'A' }, { text: '否，或仅一人/患病>50岁', evidence: '' }]
  },
  {
    id: 'q9', section: '四、家族遗传史', type: 'bool', evidence: 'A',
    q: '您是否经基因检测确认携带 BRCA1/2 致病性突变？',
    options: [{ text: '是，确认携带', evidence: 'A' }, { text: '否，未携带/未检测', evidence: '' }]
  },
  {
    id: 'q10', section: '五、激素药物与乳腺病史', type: 'bool', evidence: '',
    q: '您是否接受过雌激素替代治疗？',
    options: [{ text: '是，接受过', evidence: '' }, { text: '否，未接受', evidence: '' }]
  },
  {
    id: 'q11', section: '五、激素药物与乳腺病史', type: 'bool', evidence: '',
    q: '治疗期间是否同时使用孕激素替代治疗？',
    showIf: { q: 'q10', in: [0] },
    options: [{ text: '是，同时使用', evidence: '' }, { text: '否，未同时使用', evidence: '' }]
  },
  {
    id: 'q12', section: '五、激素药物与乳腺病史', type: 'single', evidence: '',
    q: '激素替代治疗的使用时间为？',
    showIf: { q: 'q10', in: [0] },
    options: [
      { text: 'A. 半年内', evidence: '' },
      { text: 'B. 半年-2 年', evidence: '' },
      { text: 'C. 2 年以上', evidence: '' }
    ]
  },
  {
    id: 'q13', section: '五、激素药物与乳腺病史', type: 'bool', evidence: 'B',
    q: '您是否有乳腺手术史？',
    options: [{ text: '是，有手术史', evidence: 'B' }, { text: '否，无手术史', evidence: '' }]
  },
  {
    id: 'q14', section: '五、激素药物与乳腺病史', type: 'bool', evidence: 'A',
    q: '您是否接受过注射式隆胸手术？',
    options: [{ text: '是，接受过', evidence: 'A' }, { text: '否，未接受', evidence: '' }]
  },
  {
    id: 'q15', section: '六、乳腺临床症状与体征', type: 'bool', evidence: 'D',
    q: '您是否在非哺乳期出现乳头溢液？',
    options: [{ text: '是，有溢液', evidence: 'D' }, { text: '否，无溢液', evidence: '' }]
  },
  {
    id: 'q16', section: '六、乳腺临床症状与体征', type: 'bool', evidence: 'E',
    q: '乳头溢液是否为血性（呈红色、暗红色或含血丝）？',
    showIf: { q: 'q15', in: [0] },
    options: [{ text: '是，血性溢液', evidence: 'E' }, { text: '否，非血性', evidence: '' }]
  },
  {
    id: 'q17', section: '六、乳腺临床症状与体征', type: 'single', evidence: 'D',
    q: '您近期乳腺影像检查（彩超、钼靶或 MRI）报告中的 BI-RADS 分级为？',
    options: [
      { text: 'A. 3 类或 4a 类', evidence: 'D' },
      { text: 'B. 4b 类或 4c 类', evidence: 'E' },
      { text: 'C. 未做过检查，或 0-2 类', evidence: '' }
    ]
  },
  {
    id: 'q18', section: '六、乳腺临床症状与体征', type: 'bool', evidence: 'B',
    q: '您的乳腺钼靶检查是否提示乳腺致密（腺体密集）？',
    options: [{ text: '是，提示致密', evidence: 'B' }, { text: '否，未提示', evidence: '' }]
  }
];

/* 风险分类与处理建议（对应《评分规则》四、风险等级判定；4 级）
 * 由后台「风险设置」可编辑文案与阈值，小程序启动时由后端覆盖。 */
var RISK_CATEGORIES = [
  {
    key: 'F', label: '确诊疾病人群', color: '#b30000',
    headline: '您已确诊乳腺癌或卵巢癌',
    detail: '请到乳腺专科 / 肿瘤专科医院继续诊治，遵循主管医生的治疗与随访方案。'
  },
  {
    key: 'DE', label: '乳腺可能有疾病', color: '#e8590c',
    headline: '存在可疑或高度可疑的乳腺异常表现',
    detail: '1. 关注乳腺健康，定期更新数据；2. 日常自我乳腺体检；3. 在专科医生建议下检查乳腺彩超；' +
      '4. 在专科医生建议下检查乳腺钼靶；5. 在专科医生建议下检查乳腺 MRI；6. 近期就诊。'
  },
  {
    key: '高危', label: '乳腺癌高危风险人群', color: '#f08c00',
    headline: '多项因素提示乳腺癌风险偏高',
    detail: '1. 关注乳腺健康，定期更新数据；2. 日常自我乳腺体检；3. 1 年 / 次检查乳腺彩超；4. 1 年 / 次检查乳腺钼靶。'
  },
  {
    key: '一般', label: '乳腺癌一般风险人群', color: '#2f9e44',
    headline: '目前未见明显高危信号',
    detail: '1. 关注乳腺健康，定期更新数据；2. 日常自我乳腺体检；3. 1–2 年 / 次检查乳腺彩超；4. 1–2 年 / 次检查乳腺钼靶。'
  }
];

/* 判定参数（后台可改） */
var RISK_CONFIG = {
  cMinCount: 2        // C 类证据需同时触发 ≥ 该项数才判为「高危风险人群」
};

/* 根据作答计算风险评估（证据规则优先级：F → DE(乳腺可能有疾病) → A/B 或 C≥2 → 一般）
 * 返回 { key,label,color,headline,detail,score,triggered[],cCount } */
function getRiskAssessment(answers) {
  const questionnaire = QUESTIONNAIRE;
  const categories = RISK_CATEGORIES;
  const config = RISK_CONFIG;
  const trig = {};          // 被触发的证据类
  let cCount = 0;           // C 类被触发的题数
  for (let i = 0; i < questionnaire.length; i++) {
    const q = questionnaire[i];
    const ai = answers ? answers[q.id] : undefined;
    if (ai == null || ai === undefined) continue;
    const opt = q.options[ai];
    if (!opt) continue;
    // 激素替代治疗（q10/q11/q12）为组合判定，单选项不触发证据，交给下方组合逻辑
    if (q.id === 'q10' || q.id === 'q11' || q.id === 'q12') continue;
    // 适用性保护：仅当适用前提成立时才计分，避免不适人群误答误判
    if (q.id === 'q4' && answers['q3'] !== 0) continue;     // 仅“已绝经”时计绝经年龄
    if (q.id === 'q16' && answers['q15'] !== 0) continue;   // 仅“有溢液”时计血性溢液
    if (opt.evidence) {
      trig[opt.evidence] = true;
      if (opt.evidence === 'C') cCount++;
    }
  }
  // 激素替代治疗组合判定（与 q10/q11/q12 联动）
  const q10 = answers ? answers['q10'] : undefined;
  const q11 = answers ? answers['q11'] : undefined;
  const q12 = answers ? answers['q12'] : undefined;
  if (q10 === 0 && q12 !== undefined && q12 !== null) {
    if (q11 === 0 && (q12 === 1 || q12 === 2)) trig['B'] = true;        // 雌孕激素联合且 ≥ 半年 → B 类
    if (q11 === 1 && (q12 === 1 || q12 === 2)) { trig['C'] = true; cCount++; }  // 单纯雌激素且 ≥ 半年 → C 类
  }
  let key;
  if (trig['F']) key = 'F';
  else if (trig['D'] || trig['E']) key = 'DE';
  else {
    const ab = trig['A'] || trig['B'];
    if (ab || cCount >= (config.cMinCount || 2)) key = '高危';
    else key = '一般';
  }
  const cat = categories.find(c => c.key === key) || categories[categories.length - 1];
  const triggered = Object.keys(trig);
  return {
    key: cat.key, label: cat.label, color: cat.color,
    headline: cat.headline, detail: cat.detail,
    score: triggered.length, triggered, cCount
  };
}

/* 兼容旧调用：返回完整评估对象。 */
function getRiskLevel() { return getRiskAssessment({}); }

/* BMI 计算与分级（依据三甲医院规则版：偏瘦<18.5；正常18.5~23.9；超重24~27.9；肥胖≥28） */
function calcBMI(height, weight) {
  const h = Number(height), w = Number(weight);
  if (!(h > 0) || !(w > 0)) return '';
  const v = w / Math.pow(h / 100, 2);
  return Math.round(v * 10) / 10;
}
function bmiGrade(bmi) {
  const v = Number(bmi);
  if (!v) return { label: '—', cls: '' };
  if (v < 18.5) return { label: '偏瘦', cls: 'thin' };
  if (v < 24) return { label: '正常', cls: 'normal' };
  if (v < 28) return { label: '超重', cls: 'over' };
  return { label: '肥胖', cls: 'obese' };
}

/* 条件显示：部分题目为条件题，仅当对应前置选项被选中时才出现（与量表原设计一致）。
 * q1 选“是”→ 后续全部隐藏；q4/q11/q12/q16 仅当前置题选“是”后出现。
 * 评分侧另有适用性守卫（data.js getRiskAssessment 与 server.js assess），即使被意外作答也不误判。 */
function isQuestionVisible(q, answers) {
  if (q.skipRest) return true;                       // 本题（如 q1）始终可见
  if (answers && answers['q1'] === 0) return false;   // q1 选“是” → 后续全部隐藏
  if (q.showIf) {
    const v = answers ? answers[q.showIf.q] : undefined;
    if (!q.showIf.in.includes(v)) return false;
  }
  return true;
}
function getVisibleQuestions(answers) {
  return QUESTIONNAIRE.filter(q => isQuestionVisible(q, answers));
}
function isApplicable(q, answers) {
  return isQuestionVisible(q, answers);
}

/* ---------- 推荐医院（基于公开资料，坐标用于地图展示） ---------- */
var HOSPITALS = [
  {
    name: '中国医学科学院肿瘤医院',
    city: '北京', level: '三甲 · 国家级肿瘤中心',
    department: '乳腺外科 / 肿瘤内科',
    address: '北京市朝阳区潘家园南里 17 号',
    phone: '010-87788899',
    lat: 39.8772, lng: 116.4656,
    note: '国家癌症中心附属医院，乳腺癌诊疗权威，疑难病例首选。'
  },
  {
    name: '复旦大学附属肿瘤医院',
    city: '上海', level: '三甲 · 专科医院',
    department: '乳腺外科 / 放疗科',
    address: '上海市徐汇区东安路 270 号',
    phone: '021-64175590',
    lat: 31.1970, lng: 121.4450,
    note: '华东地区乳腺肿瘤诊疗中心，MDT 多学科会诊成熟。'
  },
  {
    name: '中山大学肿瘤防治中心',
    city: '广州', level: '三甲 · 专科医院',
    department: '乳腺科 / 肿瘤内科',
    address: '广州市越秀区东风东路 651 号',
    phone: '020-87343088',
    lat: 23.1390, lng: 113.3070,
    note: '华南地区权威肿瘤专科医院，乳腺诊疗实力突出。'
  },
  {
    name: '天津医科大学肿瘤医院',
    city: '天津', level: '三甲 · 专科医院',
    department: '乳腺外科',
    address: '天津市河西区体院北环湖西路',
    phone: '022-23340123',
    lat: 39.0950, lng: 117.2100,
    note: '我国最早成立的肿瘤专科医院之一，乳腺外科历史悠久。'
  },
  {
    name: '浙江省肿瘤医院',
    city: '杭州', level: '三甲 · 专科医院',
    department: '乳腺外科',
    address: '浙江省杭州市拱墅区半山东路 1 号',
    phone: '0571-88122222',
    lat: 30.3150, lng: 120.2250,
    note: '浙江省肿瘤诊疗龙头，乳腺疾病筛查与诊治齐全。'
  },
  {
    name: '四川省肿瘤医院',
    city: '成都', level: '三甲 · 专科医院',
    department: '乳腺外科 / 肿瘤内科',
    address: '四川省成都市武侯区人民南路四段 55 号',
    phone: '028-85420110',
    lat: 30.6600, lng: 104.1200,
    note: '西南地区重要肿瘤防治中心，乳腺专科完善。'
  }
];

/* ---------- 自查教程步骤（图文） ---------- */
var TUTORIAL_STEPS = [
  {
    type: 'mirror',
    title: '第一步 · 视诊（对着镜子）',
    desc: '双手自然下垂，观察两侧乳房外形、大小是否对称，皮肤有无凹陷、红肿、橘皮样改变，乳头有无内陷或溢液。再双手叉腰、双臂上举，重复观察。'
  },
  {
    type: 'lie',
    title: '第二步 · 仰卧触诊',
    desc: '仰卧，肩下垫小枕。用手指掌面（非指尖）平放乳房上，从外上象限开始，顺时针或放射状轻柔按压，覆盖整个乳房及乳晕，注意有无肿块、增厚。'
  },
  {
    type: 'stand',
    title: '第三步 · 站立 / 淋浴触诊',
    desc: '站立或洗澡时，手指蘸肥皂沫更易滑动。用同样手法检查，尤其注意乳房外上象限（癌变高发区）及乳头下方。'
  },
  {
    type: 'armpit',
    title: '第四步 · 检查腋窝与乳头',
    desc: '四指并拢伸入对侧腋窝，沿胸壁向上滑动触摸，检查有无肿大、质硬的淋巴结，换另一侧重复。' +
      '再轻捏乳头及乳晕，观察有无血性、咖啡色或单侧单孔溢液，异常应及时就医。'
  }
];

/* ---------- 科普知识 ---------- */
var SCIENCE_ARTICLES = [
  {
    title: '认识乳腺癌：它到底是什么？',
    tag: '基础',
    summary: '乳腺癌是发生在乳腺腺上皮组织的恶性肿瘤，是女性最常见的癌症之一。',
    content: '乳腺癌起源于乳腺导管或小叶的上皮细胞，是女性发病率最高的恶性肿瘤。' +
      '好在随着筛查普及和治疗进步，早期乳腺癌的治愈率已很高。' +
      '了解它、定期筛查，是保护自己的第一步。'
  },
  {
    title: '乳腺癌的早期信号有哪些？',
    tag: '预警',
    summary: '无痛性肿块、乳头溢液、皮肤橘皮样变、乳头内陷都可能是信号。',
    content: '常见警示信号包括：① 乳房内无痛、质硬、边界不清的肿块；② 单侧单孔血性 / 咖啡色溢液；' +
      '③ 皮肤“橘皮样”改变或酒窝征；④ 乳头近期内陷、偏斜；⑤ 腋窝淋巴结肿大。' +
      '注意：早期常“不痛不痒”，所以不能等疼了才查。'
  },
  {
    title: '哪些女性属于高危人群？',
    tag: '风险',
    summary: '有家族史、遗传突变、不典型增生或胸部放疗史者风险更高。',
    content: '根据《中国抗癌协会乳腺癌诊治指南与规范（2026 年版）》，高危人群包括：' +
      '① 有明显遗传倾向（一级亲属乳腺癌 / 卵巢癌史、BRCA 突变等）；② 既往乳腺不典型增生或小叶原位癌；' +
      '③ 30 岁前接受过胸部放疗。高危人群建议从 40 岁前开始，每年 1 次超声并联合钼靶 / MRI 筛查。'
  },
  {
    title: '乳腺自查的最佳时间与方法',
    tag: '自查',
    summary: '绝经前女性建议月经干净后 7–14 天自查，每月一次。',
    content: '乳腺自我检查虽不能替代筛查，但能提高防癌意识。' +
      '最佳时间：绝经前女性在月经来潮后 7–14 天（激素影响最小）；绝经后女性可固定每月某天。' +
      '方法包括视诊 + 触诊（仰卧 / 站立）+ 腋窝检查，详见“教程”模块。'
  },
  {
    title: '超声、钼靶、MRI 怎么选？',
    tag: '检查',
    summary: '年轻 / 致密乳腺首选超声；40 岁以上推荐钼靶；高危可加 MRI。',
    content: '指南建议：一般风险女性 40 岁起每 1–2 年做 1 次乳腺 X 线（钼靶），致密型乳腺联合超声；' +
      '年轻女性（乳腺致密）以超声为首选、钼靶为辅；高危人群可联合乳腺增强 MRI。' +
      '各项检查互补，医生会根据年龄和乳腺类型选择。'
  },
  {
    title: '乳腺癌常用的治疗手段',
    tag: '治疗',
    summary: '手术、化疗、放疗、内分泌治疗、靶向治疗多手段综合。',
    content: '乳腺癌治疗强调“个体化、综合治疗”：手术（保乳或改良根治）、化疗、放疗、' +
      '内分泌治疗（针对激素受体阳性）、靶向治疗（如 HER2 阳性用曲妥珠单抗）等。' +
      '早期患者经规范治疗可获得良好长期生存。'
  }
];

/* ---------- 健康资讯 / 新闻（基于 2026 年公开资料整理） ---------- */
var NEWS = [
  {
    title: '《中国抗癌协会乳腺癌诊治指南与规范（2026 年版）》发布',
    source: '中国癌症杂志',
    date: '2026-01',
    summary: '一般风险女性筛查起始年龄定为 40 岁，高危人群可提前至 40 岁前。',
    content: '2026 年版指南在 2024 版基础上更新，纳入诊断分类新理念、精准治疗新工具。' +
      '要点：中国女性发病高峰 45–54 岁，建议一般风险人群 40 岁起筛查；高危人群提前并每年 1 次超声、联合钼靶 / MRI。'
  },
  {
    title: '《中国年轻乳腺癌诊疗专家共识（2026 版）》正式发布',
    source: '医脉通 / 中华医学杂志',
    date: '2026-07',
    summary: '将 ≤35 岁定义为“极年轻乳腺癌”，强调筛查关口前移与全生命周期管理。',
    content: '新版共识由 100 余位多学科专家制定，提出 24 条推荐意见。' +
      '强调 40 岁以下女性以超声为首选机会性筛查、建议从 35 岁起关注乳腺健康；' +
      '并完善遗传风险评估、卵巢功能保护与生育力保存。'
  },
  {
    title: '2026 CSCO 指南会聚焦年轻乳腺癌诊疗中国方案',
    source: 'CCMTV 肿瘤频道',
    date: '2026-04',
    summary: '刘强教授解读：年轻女性应以乳腺超声为筛查核心，减少不必要辐射。',
    content: '会议指出，与欧美以钼靶为核心不同，我国年轻女性乳腺致密，明确推荐以超声联合临床体检作为年轻女性筛查首选，' +
      '发现可疑钙化 / 肿块再联合钼靶；同时强调化疗期间应积极保护卵巢功能。'
  },
  {
    title: '重视乳腺癌超声筛查：守护乳腺健康的“火眼金睛”',
    source: '科普中国',
    date: '2026-03',
    summary: '超声安全无辐射、对致密乳腺敏感，已成为我国女性筛查首选手段之一。',
    content: '科普中国文章解读：超声无创无痛、可反复进行、对致密型乳腺敏感，适合各年龄段包括孕期哺乳期女性；' +
      '结合弹性成像、超声造影可进一步精准评估病灶。'
  }
];
