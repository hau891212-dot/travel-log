// ===== 工具 =====
const KEY = 'travel-log-v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEK = '日一二三四五六';
const ic = name => `<svg class="ic"><use href="#ic-${name}"/></svg>`;
const CITY = {
  busan: { name: '釜山', flag: ic('kr') },
  fukuoka: { name: '福岡', flag: ic('jp') },
  move: { name: '移動', flag: ic('ferry') },
};
const cityTag = c => CITY[c] ? `<span class="city ${c}">${CITY[c].flag} ${CITY[c].name}</span>` : '';
const empty = (msg, icon = 'suitcase') =>
  `<div class="empty"><svg><use href="#i-${icon}"/></svg><p>${msg}</p></div>`;
const fmtDate = s => {
  if (!s) return '';
  const d = new Date(s + 'T00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
};
const toMin = t => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00') - new Date(b + 'T00:00')) / 864e5);

// ===== 資料層 =====
const DEFAULT_RATES = { KRW: 0.023, JPY: 0.21 }; // 1 單位外幣 = ? TWD（約略值，可在「更多」更新）

function newTrip(name = '釜山 × 福岡') {
  return migrate({ id: uid(), name, currency: 'TWD', start: '', end: '', budget: 0 });
}
function migrate(t) {
  t.members ||= []; t.prep ||= []; t.plan ||= []; t.money ||= []; t.bookings ||= [];
  t.currency = (t.currency || 'TWD').toUpperCase();
  if (!t.rates) t.rates = t.currency === 'TWD' ? { ...DEFAULT_RATES } : {};
  return t;
}

let db;
try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
if (!db || !db.trips?.length) {
  const t = newTrip();
  db = { current: t.id, trips: [t] };
}
db.trips.forEach(migrate);

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { toast('儲存失敗：手機空間不足或在無痕模式'); }
}
const trip = () => db.trips.find(t => t.id === db.current) || db.trips[0];
const memberName = id => trip().members.find(m => m.id === id)?.name ?? '（已刪除）';

// ===== 幣別 =====
const base = () => trip().currency || 'TWD';
const CURS = () => [...new Set([base(), ...Object.keys(trip().rates || {})])];
const rateOf = cur => (!cur || cur === base()) ? 1 : (trip().rates?.[cur] ?? 1);
const toBase = r => r.amount * rateOf(r.cur);
const NO_DEC = ['TWD', 'KRW', 'JPY'];
const fmtCur = (n, cur) =>
  `${cur} ${Number(n || 0).toLocaleString('zh-TW', { maximumFractionDigits: NO_DEC.includes(cur) ? 0 : 2 })}`;
const money = n => fmtCur(n, base());

// 依當天行程城市猜幣別：只有福岡→JPY、只有釜山→KRW，否則用上次的
function guessCur(date) {
  const cs = new Set(trip().plan.filter(p => p.date === date).map(p => p.city));
  const has = c => CURS().includes(c);
  if (cs.has('fukuoka') && !cs.has('busan') && has('JPY')) return 'JPY';
  if (cs.has('busan') && !cs.has('fukuoka') && has('KRW')) return 'KRW';
  return db.lastCur && has(db.lastCur) ? db.lastCur : base();
}

// ===== 提示 / 復原 / 分享 =====
let toastTimer;
function toast(msg, action, onAction, ms = 4500) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span>${msg}</span>` + (action ? `<button type="button">${action}</button>` : '');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  const hide = () => el.classList.remove('show');
  if (action) el.querySelector('button').onclick = () => { onAction(); hide(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(hide, ms);
}

function removeWithUndo(key, id, label) {
  const t = trip(), idx = t[key].findIndex(x => x.id === id);
  if (idx < 0) return;
  const [item] = t[key].splice(idx, 1);
  save(); render(); navigator.vibrate?.(10);
  toast(`已刪除「${esc(label)}」`, '復原', () => { t[key].splice(idx, 0, item); save(); render(); });
}

async function copyText(text, msg = '已複製') {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast(msg);
}
async function shareText(text, title) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copyText(text, '已複製，可以貼到 LINE 給旅伴');
}
async function saveFile(name, text) {
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ===== 分頁 + 轉場 =====
const PLANE = `<svg viewBox="0 0 74 40"><g stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
  <path d="M4 20 q4 -8 46 -6 q16 1 18 6 q-2 5 -18 6 q-42 2 -46 -6 Z" fill="var(--card)"/>
  <path d="M28 17 l-8 -14 h9 l15 14 M28 23 l-8 14 h9 l15 -14 M6 18 l-4 -10 h6 l8 10" fill="var(--coral)"/>
  <path d="M52 17 h5 M44 17 h5" fill="none"/></g></svg>`;

function flyBanner(text) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $$('.flyer').forEach(f => f.remove());
  const f = document.createElement('div');
  f.className = 'flyer';
  f.innerHTML = `<span class="banner">${esc(text)}</span><span class="rope"></span>${PLANE}`;
  f.addEventListener('animationend', () => f.remove());
  document.body.appendChild(f);
}

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.classList.contains('active')) return;
  $$('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab').forEach(s => s.classList.remove('active', 'entering'));
  const sec = $('#tab-' + b.dataset.tab);
  render();
  sec.classList.add('active');
  void sec.offsetWidth;
  sec.classList.add('entering');
  setTimeout(() => sec.classList.remove('entering'), 1000);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  flyBanner(b.lastChild.textContent.trim());
  navigator.vibrate?.(8);
});
const goTab = name => $(`#tabs [data-tab=${name}]`).click();
const scrollToEl = el => el?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ===== 旅程切換 =====
$('#tripSelect').addEventListener('change', e => { db.current = e.target.value; save(); resetForms(); render(); });
$('#newTripBtn').addEventListener('click', () => {
  const name = prompt('新旅程名稱'); if (!name?.trim()) return;
  const t = newTrip(name.trim()); db.trips.push(t); db.current = t.id; save(); resetForms(); render();
  goTab('settings');
  toast('新旅程建立好了，先設定日期和成員吧！');
});

// ===== 前置作業 =====
const PREP_TEMPLATE = [
  ['護照（效期 6 個月以上）', '證件'], ['確認韓國入境規定（K-ETA / 入境卡）', '證件'], ['填寫 Visit Japan Web', '證件'],
  ['旅遊平安險 / 不便險', '證件'], ['機票', '交通'], ['釜山 ⇄ 福岡 渡輪 / 機票', '交通'], ['住宿訂房', '住宿'],
  ['韓國網路（eSIM / 網卡）', '網路'], ['日本網路（eSIM / 網卡）', '網路'], ['下載 Naver Map / Kakao Map', '網路'],
  ['下載 Papago 翻譯', '網路'], ['換韓元', '其他'], ['換日幣', '其他'], ['信用卡開通海外刷卡', '其他'],
  ['T-money 交通卡（釜山）', '交通'], ['IC 交通卡（福岡）', '交通'], ['韓國轉接頭（220V 圓腳）', '行李'],
  ['行動電源（隨身帶上機）', '行李'], ['常備藥品', '行李'],
];

$('#prepForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  trip().prep.push({ id: uid(), text: f.text.trim(), cat: f.cat, owner: f.owner, due: f.due, done: false });
  e.target.elements.text.value = ''; save(); render();
});
$('#prepTemplate').addEventListener('click', () => {
  const have = new Set(trip().prep.map(p => p.text));
  const add = PREP_TEMPLATE.filter(([x]) => !have.has(x))
    .map(([text, cat]) => ({ id: uid(), text, cat, owner: '', due: '', done: false }));
  if (!add.length) return toast('常用清單都已經加過了');
  trip().prep.push(...add); save(); render();
  const ids = new Set(add.map(a => a.id));
  toast(`已加入 ${add.length} 項`, '復原', () => { trip().prep = trip().prep.filter(p => !ids.has(p.id)); save(); render(); });
});
$('#prepList').addEventListener('click', e => {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  const p = trip().prep.find(x => x.id === id);
  if (e.target.matches('input[type=checkbox]')) {
    p.done = e.target.checked;
    if (p.done) navigator.vibrate?.(15);
    save(); render();
  } else if (e.target.matches('.del')) {
    removeWithUndo('prep', id, p.text);
  }
});

function renderPrep() {
  const list = trip().prep;
  const done = list.filter(p => p.done).length;
  $('#prepBar').style.width = list.length ? (done / list.length * 100) + '%' : '0';
  $('#prepStat').innerHTML = list.length
    ? (done === list.length ? `${ic('check')} 全部完成，可以出發了！` : `已完成 ${done} / ${list.length}`)
    : '';
  const today = todayStr();
  const sorted = [...list].sort((a, b) => a.done - b.done || (a.due || '9').localeCompare(b.due || '9'));
  $('#prepList').innerHTML = sorted.map(p => `
    <div class="item ${p.done ? 'done' : ''}" data-id="${p.id}">
      <input type="checkbox" ${p.done ? 'checked' : ''} aria-label="完成">
      <div class="main">
        <div class="title">${esc(p.text)}</div>
        <div class="sub"><span class="tag">${esc(p.cat)}</span>
          ${p.owner ? ic('user') + esc(memberName(p.owner)) : ''}
          ${p.due ? `<span class="${!p.done && p.due < today ? 'overdue' : ''}">　${ic('alarm')}${fmtDate(p.due)}</span>` : ''}
        </div>
      </div>
      <button class="icon del" title="刪除">${ic('x')}</button>
    </div>`).join('') || empty('行李箱還空空的～<br>先列出出發前要做的事，或按上面一鍵加入！', 'suitcase');
}

// ===== 行程 =====
// kind：spot 景點行程 / flight 航班 / transit 交通（mode：train ferry bus taxi walk）
const MODE = { train: ['電車', 'train'], ferry: ['渡輪', 'ferry'], bus: ['巴士', 'bus'], taxi: ['計程車', 'taxi'], walk: ['步行', 'walk'] };
const kindOf = p => p.kind || 'spot';
const isMove = p => kindOf(p) !== 'spot';
const routeText = p => [p.from, p.to].filter(Boolean).join(' → ');
const planTitle = p => p.title || routeText(p) || (kindOf(p) === 'flight' ? '航班' : (MODE[p.mode] || MODE.train)[0]);
const kindIcon = p => kindOf(p) === 'flight' ? 'plane' : kindOf(p) === 'transit' ? (MODE[p.mode] || MODE.train)[1] : 'pin';

function setPlanKind(kind) {
  const form = $('#planForm');
  form.className = form.className.replace(/kind-\w+/, 'kind-' + kind);
  $$('[data-k]', form).forEach(el => {
    const on = el.dataset.k.split(' ').includes(kind);
    el.hidden = !on; el.disabled = !on;
  });
  const ph = { spot: ['開始', '結束'], flight: ['起飛', '抵達'], transit: ['出發', '抵達'] }[kind];
  form.elements.start.title = ph[0]; form.elements.end.title = ph[1];
  form.elements.code.placeholder = kind === 'flight' ? '航班號，例如 BX794' : '班次 / 路線（選填）';
}
$('#planForm').addEventListener('change', e => { if (e.target.name === 'kind') setPlanKind(e.target.value); });
function setPlanEditing(on) {
  $('#planFormTitle').textContent = on ? '編輯行程' : '新增行程';
  $('#planSubmit').textContent = on ? '更新行程' : '新增行程';
  $('#planCancel').hidden = !on;
  $('#planForm').classList.toggle('editing', on);
}
function resetPlanForm(keep = {}) {
  const form = $('#planForm'), el = form.elements;
  form.reset();
  el.id.value = '';
  el.date.value = keep.date || trip().start || todayStr();
  const kind = keep.kind || 'spot';
  form.querySelector(`[name=kind][value=${kind}]`).checked = true;
  setPlanKind(kind);
  if (keep.city !== undefined) el.city.value = keep.city;
  setPlanEditing(false);
}
$('#planForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const t = trip();
  for (const k of ['title', 'place', 'from', 'to', 'code', 'note']) if (typeof f[k] === 'string') f[k] = f[k].trim();
  if (f.kind !== 'spot' && !f.from && !f.to) return toast('請填出發地或目的地');
  if (f.end && f.end < f.start && !confirm('結束時間比開始早（跨午夜）？確定要儲存嗎？')) return;
  // 依類型清掉不用的欄位
  const rec = { kind: f.kind, date: f.date, start: f.start, end: f.end || '', note: f.note || '' };
  if (f.kind === 'spot') Object.assign(rec, { city: f.city, title: f.title, place: f.place || '' });
  else Object.assign(rec, { from: f.from, to: f.to, code: (f.code || '').toUpperCase(), title: '', place: '',
    city: f.kind === 'flight' ? 'move' : f.city, ...(f.kind === 'transit' ? { mode: f.mode } : {}) });
  if (f.id) { const p = t.plan.find(x => x.id === f.id); for (const k of Object.keys(p)) if (k !== 'id') delete p[k]; Object.assign(p, rec); }
  else t.plan.push({ ...rec, id: uid() });
  save();
  toast(f.id ? '行程已更新' : `已加入 ${fmtDate(f.date)} ${esc(planTitle(rec))}`);
  resetPlanForm({ date: f.date, city: f.city, kind: f.kind });
  render();
});
$('#planCancel').addEventListener('click', () => resetPlanForm());

function editPlan(id) {
  const p = trip().plan.find(x => x.id === id), form = $('#planForm'), el = form.elements;
  const kind = kindOf(p);
  form.querySelector(`[name=kind][value=${kind}]`).checked = true;
  setPlanKind(kind);
  for (const k of ['city', 'date', 'start', 'end', 'title', 'place', 'note', 'from', 'to', 'code', 'id']) el[k].value = p[k] || '';
  el.mode.value = p.mode || 'train';
  setPlanEditing(true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function planClick(e) {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  if (e.target.matches('.del')) {
    const p = trip().plan.find(x => x.id === id);
    removeWithUndo('plan', id, p && planTitle(p));
  } else if (e.target.matches('.edit')) {
    if (!$('#tab-plan').classList.contains('active')) goTab('plan');
    editPlan(id);
  }
}
$('#planList').addEventListener('click', planClick);
$('#todayList').addEventListener('click', planClick);
$('#dayChips').addEventListener('click', e => {
  const d = e.target.closest('[data-day]')?.dataset.day;
  if (d) scrollToEl(document.getElementById('day-' + d));
});
let planView = (() => { try { return localStorage.getItem('tl-plan-view') || 'all'; } catch { return 'all'; } })();
$('#planFilter').addEventListener('click', e => {
  const v = e.target.closest('[data-view]')?.dataset.view; if (!v) return;
  planView = v; try { localStorage.setItem('tl-plan-view', v); } catch {}
  renderPlan();
});

const sortedPlan = () => [...trip().plan].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
const mapLink = place => place
  ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}" target="_blank" rel="noopener">${ic('pin')}${esc(place)}</a>` : '';
// Google 地圖在韓國無法導航，釜山的行程多給一個 Naver 地圖
const naverLink = p => p.city === 'busan' && p.place
  ? ` <a class="mini" href="https://map.naver.com/p/search/${encodeURIComponent(p.place)}" target="_blank" rel="noopener">Naver</a>` : '';

const planBtns = `<div class="btns">
      <button class="icon edit" title="編輯">${ic('pencil')}</button>
      <button class="icon del" title="刪除">${ic('x')}</button>
    </div>`;
function planItem(p, cls = '') {
  const kind = kindOf(p);
  if (kind === 'flight') {
    return `<div class="item flight ${cls}" data-id="${p.id}">
      <div class="fl-top"><span class="fl-tag">${ic('plane')} FLIGHT</span>${p.code ? `<b class="fl-code">${esc(p.code)}</b>` : ''}</div>
      <div class="fl-route">
        <div class="fl-pt"><span class="fl-city">${esc(p.from || '—')}</span><span class="fl-time">${esc(p.start)}</span></div>
        <div class="fl-path">${ic('plane')}</div>
        <div class="fl-pt r"><span class="fl-city">${esc(p.to || '—')}</span><span class="fl-time">${esc(p.end || '')}</span></div>
      </div>
      ${p.note ? `<div class="sub">${esc(p.note)}</div>` : ''}
      ${planBtns}
    </div>`;
  }
  if (kind === 'transit') {
    const [mName, mIc] = MODE[p.mode] || MODE.train;
    return `<div class="item transit ${cls}" data-id="${p.id}">
      <div class="time">${esc(p.start)}${p.end ? `<small>${esc(p.end)}</small>` : ''}</div>
      <span class="tr-ic">${ic(mIc)}</span>
      <div class="main">
        <div class="title">${esc(routeText(p) || mName)}</div>
        <div class="sub"><span class="tag soft">${mName}${p.code ? ' · ' + esc(p.code) : ''}</span>${p.note ? esc(p.note) : ''}</div>
      </div>
      ${planBtns}
    </div>`;
  }
  return `<div class="item spot ${cls} city-${p.city || 'none'}" data-id="${p.id}">
    <div class="time">${esc(p.start)}${p.end ? `<small>${esc(p.end)}</small>` : ''}</div>
    <div class="main">
      <div class="title">${cityTag(p.city)}${esc(p.title)}</div>
      <div class="sub">${mapLink(p.place)}${naverLink(p)}${p.note ? ' ' + esc(p.note) : ''}</div>
    </div>
    ${planBtns}
  </div>`;
}

function renderPlan() {
  const all = sortedPlan();
  const nMove = all.filter(isMove).length, nSpot = all.length - nMove;
  $('#planFilter').innerHTML = all.length ? [['all', '全部', all.length, 'map'], ['spot', '景點', nSpot, 'pin'], ['move', '航班・交通', nMove, 'plane']]
    .map(([v, l, n, i]) => `<button type="button" data-view="${v}" class="${planView === v ? 'on' : ''}">${ic(i)}${l}<small>${n}</small></button>`).join('') : '';
  const list = all.filter(p => planView === 'all' || (planView === 'move') === isMove(p));
  const byDay = {};
  list.forEach(p => (byDay[p.date] ||= []).push(p));
  const days = Object.keys(byDay), start = trip().start, today = todayStr();
  const dayNo = d => start ? dayDiff(d, start) + 1 : 0;
  $('#dayChips').innerHTML = days.length > 1 ? days.map(d =>
    `<button type="button" class="chip ${d === today ? 'on' : ''}" data-day="${d}">${dayNo(d) > 0 ? `D${dayNo(d)} ` : ''}${fmtDate(d).replace(/（.）/, '')}</button>`).join('') : '';
  $('#planList').innerHTML = days.map(d => {
    const n = dayNo(d), items = byDay[d];
    const cities = [...new Set(items.map(p => p.city).filter(c => c && c !== 'move' && CITY[c]))];
    const s = items.filter(p => !isMove(p)).length, m = items.length - s;
    return `<div class="day-head" id="day-${d}">
        <span class="day-badge">${n > 0 ? `Day ${n}` : ic('calendar')}</span>
        <span>${fmtDate(d)}</span>
        ${cities.map(c => `<span class="stamp ${c}">${CITY[c].name}</span>`).join('')}
        <span class="muted count">${[s && `${s} 站`, m && `${m} 段交通`].filter(Boolean).join('・')}</span>
      </div>
      <div class="timeline">${items.map(p => planItem(p)).join('')}</div>`;
  }).join('') || (all.length ? empty('這個分類還沒有東西', 'compass') : empty('還沒有行程～<br>從上面加入第一站吧！', 'torii'));
}

// ===== 即時行程 =====
function liveState(now = new Date()) {
  const today = todayStr(now), nowMin = now.getHours() * 60 + now.getMinutes();
  const todays = sortedPlan().filter(p => p.date === today);
  const endOf = (p, i) => {
    if (p.end && p.end > p.start) return toMin(p.end);
    if (p.end) return 24 * 60; // 跨午夜：今天內都算進行中
    return todays[i + 1] ? toMin(todays[i + 1].start) : toMin(p.start) + 60;
  };
  let current = null, next = null;
  todays.forEach((p, i) => {
    if (toMin(p.start) <= nowMin && nowMin < endOf(p, i)) current = p;
    if (!next && toMin(p.start) > nowMin) next = p;
  });
  if (!next) next = sortedPlan().find(p => p.date > today) || null;
  return { todays, current, next, nowMin, endOf };
}

function countdown(p, now) {
  let m = Math.round((new Date(`${p.date}T${p.start}`) - now) / 6e4);
  if (m < 0) return '';
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60); m -= h * 60;
  return [d && `${d} 天`, h && `${h} 小時`, `${m} 分`].filter(Boolean).join(' ') + '後出發';
}

function pass({ label, title, sub = '', extra = '', city = '', stubTop, stubMid, stubBot = '', cls = '' }) {
  return `<div class="pass ${cls} ${city}">
    <div class="pass-main">
      <div class="label">${label}</div>
      <div class="big">${title}</div>
      ${sub ? `<div class="muted">${sub}</div>` : ''}
      ${extra}
    </div>
    <div class="pass-stub">
      <div class="stub-k">${stubTop}</div>
      <div class="stub-v">${stubMid}</div>
      ${stubBot ? `<div class="stub-t">${stubBot}</div>` : ''}
    </div>
  </div>`;
}

function stubOf(p) {
  if (kindOf(p) === 'flight') return { stubTop: ic('plane'), stubMid: '航班' };
  if (kindOf(p) === 'transit') { const [n, i] = MODE[p.mode] || MODE.train; return { stubTop: ic(i), stubMid: n }; }
  const c = CITY[p.city];
  return { stubTop: c ? c.flag : ic('pin'), stubMid: c ? c.name : '行程' };
}
function renderLive() {
  const now = new Date(), t = trip(), today = todayStr(now);
  $('#clock').innerHTML = `${ic('clock')} ${fmtDate(today)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const { todays, current, next, nowMin, endOf } = liveState(now);
  let html = '';

  if (t.start && today < t.start) {
    const d = dayDiff(t.start, today);
    const left = t.prep.filter(p => !p.done).length;
    html += pass({
      label: 'DEPARTURE · 距離出發', title: `還有 ${d} 天！`,
      sub: t.prep.length ? (left ? `前置作業還剩 ${left} 項` : '前置作業全部完成') : '還沒有前置作業清單',
      stubTop: ic('plane'), stubMid: 'D-day', stubBot: `D-${d}`,
    });
  } else if (t.start && t.end && today >= t.start && today <= t.end) {
    html += `<div class="trip-day">${ic('map')} 旅程第 <b>${dayDiff(today, t.start) + 1}</b> 天・共 ${dayDiff(t.end, t.start) + 1} 天</div>`;
  }
  if (current) {
    const total = Math.max(1, endOf(current, todays.indexOf(current)) - toMin(current.start));
    const pct = Math.min(100, (nowMin - toMin(current.start)) / total * 100);
    html += pass({
      cls: 'now ' + kindOf(current), city: current.city,
      label: `<span class="live-dot"></span>NOW · ${isMove(current) ? '移動中' : '正在進行'}`, title: esc(planTitle(current)),
      sub: `${esc(current.start)}${current.end ? '–' + esc(current.end) : ''}　${current.code ? esc(current.code) + ' ' : ''}${mapLink(current.place)}${naverLink(current)}`,
      extra: `${current.note ? `<div>${esc(current.note)}</div>` : ''}<div class="progress"><div style="width:${pct}%"></div></div>`,
      ...stubOf(current), stubBot: esc(current.start),
    });
  }
  if (next) {
    html += pass({
      city: next.city, cls: kindOf(next),
      label: `NEXT · ${kindOf(next) === 'flight' ? '下一班飛機' : isMove(next) ? '下一段交通' : '下一站'}`, title: esc(planTitle(next)),
      sub: `${fmtDate(next.date)} ${esc(next.start)}　${next.code ? esc(next.code) + ' ' : ''}${mapLink(next.place)}${naverLink(next)}`,
      extra: `<div class="countdown">${ic('hourglass')} ${countdown(next, now)}</div>`,
      ...stubOf(next), stubBot: esc(next.start),
    });
  }
  $('#liveBox').innerHTML = html || empty('目前沒有進行中或即將到來的行程<br>去「行程」排一下吧！', 'camera');

  const bk = t.bookings.filter(b => b.date === today);
  $('#bookingToday').innerHTML = bk.length ? `<h3>今日訂位</h3>${bk.map(bookingItem).join('')}` : '';

  $('#todayList').innerHTML = todays.length
    ? `<div class="timeline">${todays.map((p, i) =>
        planItem(p, p === current ? 'now' : endOf(p, i) <= nowMin ? 'past' : '')).join('')}</div>`
    : empty('今天沒有排行程，自由活動～', 'umbrella');
}
setInterval(() => { if ($('#tab-live').classList.contains('active') && !document.hidden) renderLive(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderLive(); });
$('#bookingToday').addEventListener('click', bookingClick);

// 匯率換算器
function renderConverter() {
  const a = parseFloat($('#convAmt').value), from = $('#convCur').value;
  if (!a || !from) { $('#convOut').innerHTML = `<span class="muted">輸入金額，馬上換算成其他幣別</span>`; return; }
  const inBase = a * rateOf(from);
  $('#convOut').innerHTML = CURS().filter(c => c !== from).map(c =>
    `<div class="conv-line"><span>${c}</span><b>${fmtCur(inBase / rateOf(c), c).replace(c + ' ', '')}</b></div>`).join('');
}
$('#convAmt').addEventListener('input', renderConverter);
$('#convCur').addEventListener('change', renderConverter);

// ===== 記帳 =====
function renderSplitBox(selected) {
  const t = trip();
  const sel = selected ?? t.members.map(m => m.id);
  $('#splitBox').innerHTML = t.members.map(m => `
    <label class="chip ${sel.includes(m.id) ? 'on' : ''}">
      <input type="checkbox" value="${m.id}" ${sel.includes(m.id) ? 'checked' : ''}>${esc(m.name)}</label>`).join('')
    || '<span class="muted">請先到「更多 → 成員」新增成員</span>';
}
$('#splitBox').addEventListener('change', e => e.target.closest('.chip').classList.toggle('on', e.target.checked));
$('#splitAll').addEventListener('click', () => {
  const boxes = $$('#splitBox input'), all = boxes.every(b => b.checked);
  boxes.forEach(b => { b.checked = !all; b.closest('.chip').classList.toggle('on', !all); });
});

function updateAmtPreview() {
  const el = $('#moneyForm').elements, a = parseFloat(el.amount.value), cur = el.cur.value;
  $('#amtPreview').textContent = a && cur && cur !== base() ? `≈ ${money(a * rateOf(cur))}` : '';
}
$('#moneyForm').elements.amount.addEventListener('input', updateAmtPreview);
$('#moneyForm').elements.cur.addEventListener('change', updateAmtPreview);
$('#moneyForm').elements.date.addEventListener('change', e => {
  if (!$('#moneyForm').elements.id.value) { $('#moneyForm').elements.cur.value = guessCur(e.target.value); updateAmtPreview(); }
});

function setMoneyEditing(on) {
  $('#moneyFormTitle').textContent = on ? '編輯紀錄' : '記一筆';
  $('#moneySubmit').textContent = on ? '更新' : '儲存';
  $('#moneyReset').textContent = on ? '取消編輯' : '清除';
  $('#moneyForm').classList.toggle('editing', on);
}
// 完整重設（清除 / 取消編輯 / 換旅程）
function resetMoneyForm() {
  const form = $('#moneyForm'), el = form.elements;
  form.reset();
  el.id.value = '';
  el.date.value = todayStr();
  el.cur.value = guessCur(todayStr());
  if (db.lastPayer && trip().members.some(m => m.id === db.lastPayer)) el.payer.value = db.lastPayer;
  renderSplitBox();
  setMoneyEditing(false); updateAmtPreview();
}
$('#moneyReset').addEventListener('click', resetMoneyForm);

$('#moneyForm').addEventListener('submit', e => {
  e.preventDefault();
  const el = e.target.elements, f = Object.fromEntries(new FormData(e.target));
  const split = $$('#splitBox input:checked').map(i => i.value);
  if (!trip().members.length) return toast('請先到「更多 → 成員」新增成員');
  if (!split.length) return toast('請至少選一位分攤成員');
  const amount = parseFloat(f.amount);
  if (!(amount > 0)) return toast('金額要大於 0');
  const rec = { type: f.type, date: f.date, title: f.title.trim(), cat: f.cat, amount, cur: f.cur || base(),
    pay: f.pay, payer: f.payer, split };
  const t = trip();
  if (f.id) Object.assign(t.money.find(x => x.id === f.id), rec);
  else t.money.push({ id: uid(), ...rec });
  db.lastCur = rec.cur; db.lastPayer = rec.payer;
  save();
  toast(f.id ? '已更新' : `已記下 ${esc(rec.title)} ${fmtCur(amount, rec.cur)}`);
  navigator.vibrate?.(15);
  if (f.id) resetMoneyForm();
  else { // 連續記帳：保留日期、幣別、付款人、分攤，只清項目和金額
    el.title.value = ''; el.amount.value = ''; el.type.value = 'expense'; updateAmtPreview();
  }
  render();
});

$('#moneyList').addEventListener('click', e => {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  const t = trip(), r = t.money.find(x => x.id === id);
  if (e.target.matches('.del')) {
    removeWithUndo('money', id, r.title);
  } else if (e.target.matches('.edit')) {
    const el = $('#moneyForm').elements;
    for (const k of ['type', 'date', 'title', 'cat', 'amount', 'payer', 'id']) el[k].value = r[k];
    el.cur.value = r.cur || base();
    el.pay.value = r.pay || '現金';
    renderSplitBox(r.split);
    setMoneyEditing(true); updateAmtPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});
$('#moneyFilter').addEventListener('change', renderMoney);

const CAT_ICON = { 餐飲: 'bowl', 交通: 'train', 住宿: 'bed', 門票: 'ticket', 購物: 'bag', 前置費用: 'note', 其他: 'sparkle' };
const catIc = c => ic(CAT_ICON[c] || 'sparkle');

function renderMoney() {
  const t = trip(), cat = $('#moneyFilter').value;
  const cats = [...new Set(t.money.map(r => r.cat))];
  $('#moneyFilter').innerHTML = '<option value="">全部分類</option>' +
    cats.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const list = t.money.filter(r => !cat || r.cat === cat);
  const sum = list.reduce((s, r) => s + (r.type === 'income' ? -1 : 1) * toBase(r), 0);
  $('#moneyTotal').textContent = list.length ? `${list.length} 筆・淨 ${money(sum)}` : '';

  const byDay = {};
  list.forEach(r => (byDay[r.date] ||= []).push(r));
  $('#moneyList').innerHTML = Object.keys(byDay).sort().reverse().map(d => {
    const day = byDay[d];
    const sub = day.reduce((s, r) => s + (r.type === 'income' ? 0 : toBase(r)), 0);
    return `<div class="money-day"><span>${fmtDate(d)}</span><span class="muted">支出 ${money(sub)}</span></div>` +
      day.map(r => {
        const cur = r.cur || base();
        return `<div class="item" data-id="${r.id}">
          <div class="main">
            <div class="title">${catIc(r.cat)} ${esc(r.title)}</div>
            <div class="sub">${r.type === 'income' ? '收' : '付'}：${esc(memberName(r.payer))}
              ・${r.split.length === t.members.length ? '全員分' : r.split.map(memberName).map(esc).join('、')}
              ${r.pay ? `<span class="tag soft">${esc(r.pay)}</span>` : ''}</div>
          </div>
          <div class="amt ${r.type}">${r.type === 'income' ? '+' : ''}${fmtCur(r.amount, cur)}
            ${cur !== base() ? `<small>≈ ${money(toBase(r))}</small>` : ''}</div>
          <div class="btns">
            <button class="icon edit" title="編輯">${ic('pencil')}</button>
            <button class="icon del" title="刪除">${ic('x')}</button>
          </div>
        </div>`;
      }).join('');
  }).join('') || empty('錢包還沒動過～<br>記下第一筆吧！', 'fishcake');
}

// ===== 結算 =====
// 這位成員的費用由誰負擔（只認一層、對方存在且自己付）
function sponsorOf(id) {
  const t = trip(), m = t.members.find(x => x.id === id);
  const s = m?.payBy && t.members.find(x => x.id === m.payBy);
  return s && s.id !== id && !s.payBy ? s.id : null;
}
function computeSettle() {
  const t = trip();
  const P = Object.fromEntries(t.members.map(m => [m.id, { paid: 0, share: 0, recv: 0, recvShare: 0 }]));
  let expense = 0, income = 0;
  for (const r of t.money) {
    const amt = toBase(r), each = amt / r.split.length;
    if (r.type === 'income') {
      income += amt;
      if (P[r.payer]) P[r.payer].recv += amt;
      r.split.forEach(id => P[id] && (P[id].recvShare += each));
    } else {
      expense += amt;
      if (P[r.payer]) P[r.payer].paid += amt;
      r.split.forEach(id => P[id] && (P[id].share += each));
    }
  }
  // 自己的花費（顯示用）
  for (const p of Object.values(P)) { p.own = p.share - p.recvShare; p.covers = []; p.bear = p.own; }
  // 由別人負擔：整筆帳（付出、分攤、收入）併到負擔者身上
  for (const m of t.members) {
    const s = sponsorOf(m.id);
    if (!s) continue;
    const a = P[m.id], b = P[s];
    b.paid += a.paid; b.share += a.share; b.recv += a.recv; b.recvShare += a.recvShare;
    b.bear += a.own; b.covers.push(m.id);
    a.coveredBy = s; a.paid = a.share = a.recv = a.recvShare = 0;
  }
  // balance > 0：別人欠他；< 0：他要付錢
  for (const p of Object.values(P)) p.balance = (p.paid - p.share) - (p.recv - p.recvShare);

  const debtors = [], creditors = [];
  for (const [id, p] of Object.entries(P)) {
    const b = Math.round(p.balance * 100) / 100;
    if (b < 0) debtors.push({ id, amt: -b }); else if (b > 0) creditors.push({ id, amt: b });
  }
  debtors.sort((a, b) => b.amt - a.amt); creditors.sort((a, b) => b.amt - a.amt);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const x = Math.min(debtors[i].amt, creditors[j].amt);
    if (x >= 1) transfers.push({ from: debtors[i].id, to: creditors[j].id, amt: x }); // 不到 1 元的零頭略過
    debtors[i].amt -= x; creditors[j].amt -= x;
    if (debtors[i].amt < 0.005) i++;
    if (creditors[j].amt < 0.005) j++;
  }
  return { P, expense, income, transfers };
}

function renderSettle() {
  const t = trip(), { P, expense, income, transfers } = computeSettle();
  const net = expense - income, n = t.members.length || 1;
  const days = t.start && t.end ? dayDiff(t.end, t.start) + 1 : 0;
  $('#settleStats').innerHTML = [
    [ic('coins') + '總支出', money(expense)], [ic('refund') + '收入 / 退款', money(income)], [ic('receipt') + '淨花費', money(net)],
    [ic('people') + '平均每人', money(net / n)],
    days > 0 ? [ic('calendar') + '平均每日', money(net / days)] : null,
    t.budget ? [ic('target') + '預算剩餘', `<span class="${t.budget - net < 0 ? 'neg' : 'pos'}">${money(t.budget - net)}</span>`] : null,
  ].filter(Boolean).map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  if (t.budget) {
    const pct = net / t.budget * 100;
    $('#budgetBox').innerHTML = `<div class="budget">
      <div class="budget-top"><span>預算使用</span><b class="${pct > 100 ? 'neg' : ''}">${pct.toFixed(0)}%</b></div>
      <div class="progress ${pct > 100 ? 'over' : ''}"><div style="width:${Math.min(100, pct)}%"></div></div>
      <small class="muted">${money(net)} / ${money(t.budget)}</small></div>`;
  } else $('#budgetBox').innerHTML = '';

  $('#personTable').innerHTML = t.members.length ? `<div class="people">${t.members.map(m => {
    const p = P[m.id], b = p.balance;
    if (p.coveredBy) return `<div class="person covered">
      <div class="person-head"><span class="person-name">${esc(m.name)}</span>
        <span class="person-net">${money(p.own)}</span></div>
      <span class="badge soft">${ic('heart')} 由 ${esc(memberName(p.coveredBy))} 負擔</span>
    </div>`;
    const badge = b >= 1 ? `<span class="badge pos">應收 ${money(b)}</span>`
      : b <= -1 ? `<span class="badge neg">應付 ${money(-b)}</span>` : `<span class="badge">${ic('check')} 已平衡</span>`;
    return `<div class="person">
      <div class="person-head"><span class="person-name">${esc(m.name)}${p.covers.length ? `<small class="muted"> 負擔 ${p.covers.length + 1} 人份</small>` : ''}</span>
        <span class="person-net">${money(p.bear)}</span></div>
      <div class="person-rows">
        <span>實際付出<b>${money(p.paid)}</b></span><span>應分攤<b>${money(p.share)}</b></span>
        ${p.recv || p.recvShare ? `<span>代收<b>${money(p.recv)}</b></span><span>應得退款<b>${money(p.recvShare)}</b></span>` : ''}
        ${p.covers.length ? `<span>自己<b>${money(p.own)}</b></span>${p.covers.map(id => `<span>含 ${esc(memberName(id))}<b>${money(P[id].own)}</b></span>`).join('')}` : ''}
      </div>
      ${badge}
    </div>`;
  }).join('')}</div>` : empty('請先到「更多 → 成員」新增成員', 'camera');

  $('#transfers').innerHTML = transfers.map(x =>
    `<div class="item transfer"><div class="main"><b>${esc(memberName(x.from))}</b><span class="arrow">${ic('arrow')}</span><b>${esc(memberName(x.to))}</b></div>
     <div class="amt">${money(x.amt)}</div></div>`).join('') || empty('不需要轉帳，大家都打平了！', 'starfish');

  const expenses = t.money.filter(r => r.type !== 'income');
  const group = keyFn => {
    const m = {};
    expenses.forEach(r => { const k = keyFn(r); m[k] = (m[k] || 0) + toBase(r); });
    return Object.entries(m);
  };
  const cats = group(r => r.cat).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map(c => c[1]));
  $('#catTable').innerHTML = cats.length ? `<table><tr><th>分類</th><th>金額</th><th style="width:34%">占比</th></tr>
    ${cats.map(([c, v]) => `<tr><td>${catIc(c)} ${esc(c)}</td><td>${money(v)}</td>
      <td><div class="bar" style="width:${Math.max(8, v / max * 100)}%"></div>
      <small class="muted">${(v / expense * 100).toFixed(0)}%</small></td></tr>`).join('')}</table>` : '<p class="muted">尚無支出。</p>';

  const byCur = {};
  expenses.forEach(r => { const c = r.cur || base(); byCur[c] = (byCur[c] || 0) + r.amount; });
  const curs = Object.entries(byCur);
  $('#curTable').innerHTML = curs.length ? `<table><tr><th>幣別</th><th>原幣金額</th><th>約 ${base()}</th></tr>
    ${curs.map(([c, v]) => `<tr><td>${c === 'KRW' ? ic('kr') : c === 'JPY' ? ic('jp') : ic('coins')} ${c}</td>
      <td>${fmtCur(v, c).replace(c + ' ', '')}</td><td>${money(v * rateOf(c))}</td></tr>`).join('')}</table>` : '<p class="muted">尚無支出。</p>';

  const byDay = group(r => r.date).sort((a, b) => a[0].localeCompare(b[0]));
  $('#dayTable').innerHTML = byDay.length ? `<table><tr><th>日期</th><th>支出</th></tr>
    ${byDay.map(([d, v]) => `<tr><td>${fmtDate(d)}</td><td>${money(v)}</td></tr>`).join('')}</table>` : '<p class="muted">尚無支出。</p>';

  const foreign = CURS().filter(c => c !== base());
  $('#settleNote').textContent = foreign.length
    ? `外幣依「更多 → 匯率」換算：${foreign.map(c => `1 ${c} = ${rateOf(c)} ${base()}`).join('、')}` : '';
}

function settleText() {
  const t = trip(), { P, expense, income, transfers } = computeSettle();
  const net = expense - income;
  const lines = [`【${t.name}】旅費結算`, `淨花費 ${money(net)}（平均每人 ${money(net / (t.members.length || 1))}）`, '', '— 每人花費 —'];
  t.members.forEach(m => {
    const p = P[m.id];
    lines.push(p.coveredBy ? `${m.name}：${money(p.own)}（由 ${memberName(p.coveredBy)} 負擔）`
      : `${m.name}：${money(p.bear)}${p.covers.length ? `（含 ${p.covers.map(memberName).join('、')} 的份）` : ''}，付了 ${money(p.paid)}`);
  });
  lines.push('', '— 轉帳 —');
  if (transfers.length) transfers.forEach(x => lines.push(`${memberName(x.from)} → ${memberName(x.to)}：${money(x.amt)}`));
  else lines.push('大家都打平了！');
  return lines.join('\n');
}
$('#shareSettle').addEventListener('click', () => {
  if (!trip().money.length) return toast('還沒有任何記帳');
  shareText(settleText(), `${trip().name} 結算`);
});

// ===== 更多：訂位資訊 =====
const BK = { flight: ['機票', 'plane'], ferry: ['渡輪', 'ferry'], hotel: ['住宿', 'bed'], ticket: ['票券', 'ticket'], other: ['其他', 'note'] };
function bookingItem(b) {
  const [label, icon] = BK[b.type] || BK.other;
  return `<div class="item booking" data-id="${b.id}">
    <div class="bk-ic">${ic(icon)}</div>
    <div class="main">
      <div class="title">${esc(b.title)}</div>
      <div class="sub"><span class="tag">${label}</span>${b.date ? fmtDate(b.date) : ''}${b.note ? '　' + esc(b.note) : ''}</div>
      ${b.code ? `<button type="button" class="code" data-code="${esc(b.code)}">${ic('copy')} ${esc(b.code)}</button>` : ''}
    </div>
    <div class="btns">
      <button class="icon edit" title="編輯">${ic('pencil')}</button>
      <button class="icon del" title="刪除">${ic('x')}</button>
    </div>
  </div>`;
}
function bookingClick(e) {
  const code = e.target.closest('.code')?.dataset.code;
  if (code) return copyText(code, `已複製訂位代號 ${esc(code)}`);
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  const b = trip().bookings.find(x => x.id === id);
  if (e.target.matches('.del')) removeWithUndo('bookings', id, b.title);
  else if (e.target.matches('.edit')) {
    if (!$('#tab-settings').classList.contains('active')) goTab('settings');
    const el = $('#bookingForm').elements;
    for (const k of ['type', 'date', 'title', 'code', 'note', 'id']) el[k].value = b[k] || '';
    $('#bookingSubmit').textContent = '更新';
    setTimeout(() => scrollToEl($('#sec-booking')), 50);
  }
}
$('#bookingList').addEventListener('click', bookingClick);
$('#bookingForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target)), t = trip();
  const rec = { type: f.type, date: f.date, title: f.title.trim(), code: f.code.trim(), note: f.note.trim() };
  if (f.id) Object.assign(t.bookings.find(x => x.id === f.id), rec);
  else t.bookings.push({ id: uid(), ...rec });
  e.target.reset(); e.target.elements.id.value = ''; $('#bookingSubmit').textContent = '儲存';
  save(); render(); toast(f.id ? '訂位已更新' : '訂位已儲存');
});
function renderBookings() {
  const list = [...trip().bookings].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  $('#bookingList').innerHTML = list.map(bookingItem).join('') ||
    '<p class="muted small">機票、渡輪、住宿的訂位代號存在這裡，當天會出現在「即時」頁，點一下就能複製。</p>';
}

// ===== 更多：匯率 =====
function renderRates() {
  const t = trip();
  $('#rateList').innerHTML = Object.entries(t.rates).map(([c, r]) => `
    <div class="rate-row" data-cur="${c}">
      <span class="rate-k">${c === 'KRW' ? ic('kr') : c === 'JPY' ? ic('jp') : ic('coins')} 1 ${c} =</span>
      <input type="number" step="any" min="0" inputmode="decimal" value="${r}" aria-label="${c} 匯率">
      <span>${base()}</span>
      <button type="button" class="icon del" title="刪除">${ic('x')}</button>
    </div>`).join('') || '<p class="muted small">還沒有外幣。</p>';
  $('#rateInfo').textContent = t.ratesAt ? `匯率更新於 ${t.ratesAt}` : '目前是預設的約略匯率，出發前記得按「線上更新匯率」。';
}
$('#rateList').addEventListener('change', e => {
  const cur = e.target.closest('[data-cur]')?.dataset.cur, v = parseFloat(e.target.value);
  if (!cur || !(v > 0)) return;
  trip().rates[cur] = v; save(); render(); toast(`已更新 ${cur} 匯率`);
});
$('#rateList').addEventListener('click', e => {
  if (!e.target.matches('.del')) return;
  const cur = e.target.closest('[data-cur]').dataset.cur, t = trip();
  if (t.money.some(r => r.cur === cur)) return toast(`有記帳用到 ${cur}，不能刪除`);
  const old = t.rates[cur]; delete t.rates[cur]; save(); render();
  toast(`已刪除 ${cur}`, '復原', () => { trip().rates[cur] = old; save(); render(); });
});
$('#rateForm').addEventListener('submit', e => {
  e.preventDefault();
  const el = e.target.elements, cur = el.cur.value.trim().toUpperCase(), r = parseFloat(el.rate.value);
  if (!/^[A-Z]{3}$/.test(cur)) return toast('幣別請用 3 個英文字母，例如 USD');
  if (cur === base()) return toast(`${cur} 是主要幣別`);
  if (!(r > 0)) return toast('匯率要大於 0');
  trip().rates[cur] = r; e.target.reset(); save(); render();
});
$('#rateFetch').addEventListener('click', async e => {
  const btn = e.currentTarget, t = trip();
  btn.disabled = true;
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base())}`);
    const data = await res.json();
    if (data.result !== 'success') throw 0;
    let n = 0;
    for (const c of Object.keys(t.rates)) {
      if (data.rates[c]) { t.rates[c] = +(1 / data.rates[c]).toPrecision(4); n++; }
    }
    t.ratesAt = new Date().toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' });
    save(); render(); toast(`已更新 ${n} 個幣別的匯率`);
  } catch { toast('更新失敗，請確認網路，或手動輸入匯率'); }
  btn.disabled = false;
});

// ===== 更多：旅程設定 / 成員 / 資料 =====
$('#tab-settings .jump').addEventListener('click', e => {
  const id = e.target.closest('[data-jump]')?.dataset.jump;
  if (id) scrollToEl(document.getElementById(id));
});
$('#tripForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target)), t = trip();
  if (f.start && f.end && f.end < f.start) return toast('回程日不能早於出發日');
  const cur = (f.currency || 'TWD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) return toast('幣別請用 3 個英文字母，例如 TWD');
  if (cur !== t.currency && Object.keys(t.rates).length &&
      !confirm(`改主要幣別後，匯率要改成「1 外幣 = ? ${cur}」，記得到匯率區更新。確定要改嗎？`)) return;
  delete t.rates[cur];
  Object.assign(t, { name: f.name.trim(), currency: cur, start: f.start, end: f.end, budget: +f.budget || 0 });
  save(); render(); flyBanner('已儲存');
});
$('#memberForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = new FormData(e.target).get('name').trim();
  if (!name) return;
  if (trip().members.some(m => m.name === name)) return toast(`已經有「${esc(name)}」了`);
  trip().members.push({ id: uid(), name });
  e.target.reset(); save(); render();
});
$('#memberList').addEventListener('change', e => {
  if (!e.target.matches('.pay-by')) return;
  const id = e.target.closest('[data-id]').dataset.id, m = trip().members.find(x => x.id === id);
  if (e.target.value) m.payBy = e.target.value; else delete m.payBy;
  save(); render();
  toast(m.payBy ? `${esc(m.name)} 的費用改由 ${esc(memberName(m.payBy))} 負擔` : `${esc(m.name)} 改回自己付`);
});
$('#memberList').addEventListener('click', e => {
  if (!e.target.matches('.del')) return;
  const id = e.target.closest('[data-id]').dataset.id, t = trip();
  if (t.members.some(m => m.payBy === id))
    return toast('有人的費用由這位成員負擔，請先改掉');
  if (t.money.some(r => r.payer === id || r.split.includes(id)))
    return toast('這位成員有記帳紀錄，請先修改或刪除相關紀錄');
  removeWithUndo('members', id, memberName(id));
});
const fileName = s => s.replace(/[\\/:*?"<>|]/g, '_');
$('#exportBtn').addEventListener('click', () =>
  saveFile(`${fileName(trip().name)}-${todayStr()}.json`, JSON.stringify(trip(), null, 2)));
$('#exportAllBtn').addEventListener('click', () =>
  saveFile(`旅遊手帳備份-${todayStr()}.json`, JSON.stringify({ app: 'travel-log', trips: db.trips }, null, 2)));
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data.trips) ? data.trips : [data];
    if (!list.length || !list.every(t => t && Array.isArray(t.members) && Array.isArray(t.money))) throw 0;
    list.forEach(t => { t.id = uid(); migrate(t); db.trips.push(t); });
    db.current = list[list.length - 1].id;
    save(); resetForms(); render(); toast(`已匯入 ${list.length} 個旅程`);
  } catch { toast('檔案格式不正確'); }
  e.target.value = '';
});
$('#deleteTripBtn').addEventListener('click', () => {
  if (!confirm(`確定刪除「${trip().name}」？此動作無法復原，建議先匯出備份。`)) return;
  db.trips = db.trips.filter(t => t.id !== db.current);
  if (!db.trips.length) db.trips.push(newTrip());
  db.current = db.trips[0].id; save(); resetForms(); render();
});

function renderSettings() {
  const t = trip(), el = $('#tripForm').elements;
  if (!$('#tripForm').contains(document.activeElement))
    for (const k of ['name', 'currency', 'start', 'end', 'budget']) el[k].value = t[k] || '';
  $('#memberList').innerHTML = t.members.map(m => {
    const others = t.members.filter(x => x.id !== m.id && !x.payBy);
    const sponsored = t.members.some(x => x.payBy === m.id);
    return `<div class="member-row" data-id="${m.id}">
      <span class="member-name">${ic('user')}${esc(m.name)}</span>
      <select class="pay-by" title="費用由誰負擔" ${sponsored ? 'disabled' : ''}>
        <option value="">自己付</option>
        ${others.map(x => `<option value="${x.id}" ${m.payBy === x.id ? 'selected' : ''}>由 ${esc(x.name)} 負擔</option>`).join('')}
      </select>
      <button class="icon del" title="刪除">${ic('x')}</button>
    </div>`;
  }).join('') || '<span class="muted">尚無成員</span>';
  renderBookings(); renderRates();
}

// ===== 共用渲染 =====
function fillSelect(sel, options, fallback) {
  const v = sel.value;
  sel.innerHTML = options;
  if (v && [...sel.options].some(o => o.value === v)) sel.value = v;
  else if (fallback !== undefined) sel.value = fallback;
}
function render() {
  const t = trip();
  $('#tripSelect').innerHTML = db.trips.map(x =>
    `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  $('#tripMeta').textContent = [t.start && t.end ? `${fmtDate(t.start)} ～ ${fmtDate(t.end)}` : '',
    t.members.length ? `${t.members.length} 人同行` : ''].filter(Boolean).join('　·　');
  $$('.member-select').forEach(s => fillSelect(s,
    (s.name === 'owner' ? '<option value="">負責人</option>' : '') +
    t.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')));
  const curOpts = CURS().map(c => `<option value="${c}">${c}</option>`).join('');
  $$('.cur-select').forEach(s => fillSelect(s, curOpts, guessCur($('#moneyForm').elements.date.value || todayStr())));
  fillSelect($('#convCur'), curOpts, CURS().includes('KRW') ? 'KRW' : base());
  if (!$('#moneyForm').elements.id.value) {
    const boxes = $$('#splitBox input');
    renderSplitBox(boxes.length === t.members.length && boxes.length ? boxes.filter(i => i.checked).map(i => i.value) : null);
  }
  renderLive(); renderPrep(); renderPlan(); renderMoney(); renderSettle(); renderSettings(); renderConverter();
}
function resetForms() {
  resetPlanForm();
  $('#bookingForm').reset(); $('#bookingForm').elements.id.value = ''; $('#bookingSubmit').textContent = '儲存';
  render(); resetMoneyForm();
}

resetForms();
navigator.storage?.persist?.().catch(() => {});

// ===== 自動偵測更新 =====
// APP_VERSION 由 git pre-commit hook 自動蓋上，不用手動改
const APP_VERSION = '20261120174402';
let swReg = null, updating = false;

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(r => { swReg = r; })
    .catch(() => {});
}

function isBusy() {
  const a = document.activeElement;
  return a && a.matches('input:not([type=checkbox]), select, textarea');
}
const ss = {
  get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
};

async function applyUpdate(version) {
  if (updating) return;
  updating = true;
  showUpdateToast(version, '更新中…', false);
  try {
    if (swReg) {
      await swReg.update();
      swReg.waiting?.postMessage('skipWaiting');
    }
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  } catch {}
  // 帶上版本參數，避開 GitHub CDN 上還沒過期的舊 index.html
  location.replace(`${location.pathname}?v=${encodeURIComponent(version)}`);
}

function showUpdateToast(version, text = '有新版本囉！', withBtn = true) {
  let t = $('#updateToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'updateToast';
    t.className = 'update-toast';
    document.body.appendChild(t);
  }
  t.innerHTML = `${ic('sparkle')}<span>${text}</span>` +
    (withBtn ? `<button type="button" id="updateNow">立即更新</button><button type="button" class="icon" id="updateLater" title="稍後">${ic('x')}</button>` : '');
  $('#updateNow')?.addEventListener('click', () => applyUpdate(version));
  $('#updateLater')?.addEventListener('click', () => t.remove());
}

async function checkUpdate(auto = false) {
  if (APP_VERSION === 'dev' || !navigator.onLine || updating) return;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version || version === APP_VERSION) return;
    // 自動更新同一版本只試一次，避免 CDN 還沒更新時無限重新整理
    if (auto && !isBusy() && ss.get('tl-update') !== version) {
      ss.set('tl-update', version);
      applyUpdate(version);
    } else if (!$('#updateToast')) showUpdateToast(version);
  } catch {}
}

checkUpdate(true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(true); });
window.addEventListener('online', () => checkUpdate(true));
setInterval(() => { if (!document.hidden) checkUpdate(false); }, 60000);
