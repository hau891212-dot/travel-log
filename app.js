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

function save(fromCloud = false) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { toast('儲存失敗：手機空間不足或在無痕模式'); }
  if (!fromCloud && typeof cloudDirty === 'function') cloudDirty();
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
const MODE = { train: ['電車', 'train'], ferry: ['渡輪', 'ferry'], bus: ['巴士', 'bus'], pickup: ['機場接送', 'van'], taxi: ['計程車', 'taxi'], walk: ['步行', 'walk'] };
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
  setCodeHint();
}
function setCodeHint() {
  const el = $('#planForm').elements, kind = $('#planForm [name=kind]:checked')?.value || 'spot';
  const pickup = kind === 'transit' && el.mode.value === 'pickup';
  $('#planForm').classList.toggle('auto-pub', kind === 'flight' || pickup);
  el.code.placeholder = kind === 'flight' ? '航班號，例如 BX794' : pickup ? '接送公司 / 預約編號' : '班次 / 路線（選填）';
  el.from.placeholder = pickup ? '上車地點，例如 金海機場' : kind === 'flight' ? '出發地，例如 桃園 TPE' : '出發地';
  el.to.placeholder = pickup ? '下車地點，例如 飯店' : kind === 'flight' ? '目的地，例如 金海 PUS' : '目的地';
  el.note.placeholder = pickup ? '司機電話 / 車牌 / 集合處' : '備註 / 訂位代號';
}
$('#planForm').addEventListener('change', e => {
  if (e.target.name === 'kind') setPlanKind(e.target.value);
  if (e.target.name === 'mode') setCodeHint();
});
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
  const rec = { kind: f.kind, date: f.date, start: f.start, end: f.end || '', note: f.note || '', ...(f.pub ? { pub: true } : {}) };
  if (f.kind === 'spot') Object.assign(rec, { city: f.city, title: f.title, place: f.place || '' });
  else Object.assign(rec, { from: f.from, to: f.to, code: f.kind === 'flight' ? (f.code || '').toUpperCase() : (f.code || ''), title: '', place: '',
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
  el.pub.checked = !!p.pub;
  setCodeHint();
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

// ===== 驚喜模式：只有規劃者看得到未來的行程，旅伴當天 00:00 才解鎖 =====
// 誰是規劃者記在這支手機（db.planner），不會同步；其他裝置輸入密碼即可成為規劃者
let surprisePreview = false;
const surpriseOn = (t = trip()) => !!t.surprise?.on;
const isPlanner = (t = trip()) => !surpriseOn(t) || (!!db.planner?.[t.id] && !surprisePreview);
// 航班、機場接送一律公開（大家要知道幾點集合），其他行程可個別勾「不隱藏」
const autoPublic = p => kindOf(p) === 'flight' || (kindOf(p) === 'transit' && p.mode === 'pickup');
const isPublic = p => !!p.pub || autoPublic(p);
const isLocked = (p, t = trip()) => !isPlanner(t) && !isPublic(p) && p.date > todayStr();
const lockedCount = (t = trip()) => t.plan.filter(p => !isPublic(p) && p.date > todayStr()).length;
async function pinHash(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function unlockIn(date) {
  let m = Math.max(0, Math.round((new Date(date + 'T00:00') - new Date()) / 6e4));
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60); m -= h * 60;
  return [d && `${d} 天`, h && `${h} 小時`, `${m} 分`].filter(Boolean).join(' ');
}
const lockedCard = (d, n) => `<div class="locked-day">
  <span class="ld-ic">${ic('gift')}</span>
  <div><b>${n} 個神秘行程</b><small>${fmtDate(d)} 00:00 解鎖・還有 ${unlockIn(d)}</small></div>
  ${ic('lock')}
</div>`;
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
  const planner = isPlanner(), on = surpriseOn();
  $('#planForm').hidden = !planner;
  $('#planForm').classList.toggle('surprise-on', on);
  $('#surpriseBanner').innerHTML = !on ? '' : planner
    ? `<div class="s-banner">${ic('gift')}<span>驚喜模式中：旅伴看不到 <b>${lockedCount()}</b> 個未來行程，每天 00:00 解鎖當天的</span><button type="button" class="link" data-sp="preview">旅伴視角</button></div>`
    : surprisePreview
      ? `<div class="s-banner preview">${ic('people')}<span>旅伴視角預覽中</span><button type="button" class="link" data-sp="endpreview">結束預覽</button></div>`
      : `<div class="s-banner">${ic('gift')}<span>行程是驚喜！每天 00:00 解鎖當天的行程</span></div>`;
  const all = sortedPlan();
  $('#planList').classList.toggle('no-edit', !planner); $('#todayList').classList.toggle('no-edit', !planner);
  const vis = all.filter(p => !isLocked(p));
  const nMove = vis.filter(isMove).length, nSpot = vis.length - nMove;
  $('#planFilter').innerHTML = all.length ? [['all', '全部', vis.length, 'map'], ['spot', '景點', nSpot, 'pin'], ['move', '航班・交通', nMove, 'plane']]
    .map(([v, l, n, i]) => `<button type="button" data-view="${v}" class="${planView === v ? 'on' : ''}">${ic(i)}${l}<small>${n}</small></button>`).join('') : '';
  const list = all.filter(p => planView === 'all' || (planView === 'move') === isMove(p));
  const byDay = {};
  list.forEach(p => (byDay[p.date] ||= []).push(p));
  const days = Object.keys(byDay), start = trip().start, today = todayStr();
  const dayNo = d => start ? dayDiff(d, start) + 1 : 0;
  $('#dayChips').innerHTML = days.length > 1 ? days.map(d =>
    `<button type="button" class="chip ${d === today ? 'on' : ''}" data-day="${d}">${dayNo(d) > 0 ? `D${dayNo(d)} ` : ''}${fmtDate(d).replace(/（.）/, '')}</button>`).join('') : '';
  $('#planList').innerHTML = days.map(d => {
    const n = dayNo(d), allItems = byDay[d], items = allItems.filter(p => !isLocked(p)), hidden = allItems.length - items.length;
    const cities = hidden ? [] : [...new Set(items.map(p => p.city).filter(c => c && c !== 'move' && CITY[c]))];
    const s = items.filter(p => !isMove(p)).length, m = items.length - s;
    return `<div class="day-head" id="day-${d}">
        <span class="day-badge">${n > 0 ? `Day ${n}` : ic('calendar')}</span>
        <span>${fmtDate(d)}</span>
        ${cities.map(c => `<span class="stamp ${c}">${CITY[c].name}</span>`).join('')}
        <span class="muted count">${hidden ? ic('lock') + ' 未解鎖' : [s && `${s} 站`, m && `${m} 段交通`].filter(Boolean).join('・')}</span>
      </div>
      ${items.length ? `<div class="timeline">${items.map(p => planItem(p, planner && on && !isPublic(p) && d > today ? 'secret' : '')).join('')}</div>` : ''}
      ${hidden ? lockedCard(d, hidden) : ''}`;
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
  if (next && isLocked(next)) {
    html += pass({
      cls: 'mystery', label: 'NEXT · 神秘行程', title: '還不能說的驚喜',
      sub: `${fmtDate(next.date)} 00:00 解鎖`,
      extra: `<div class="countdown">${ic('hourglass')} 還有 ${unlockIn(next.date)}</div>`,
      stubTop: ic('gift'), stubMid: '驚喜', stubBot: ic('lock'),
    });
  } else if (next) {
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
  setMoneyEditing(false); updateAmtPreview();
}
$('#moneyReset').addEventListener('click', resetMoneyForm);

$('#moneyForm').addEventListener('submit', e => {
  e.preventDefault();
  const el = e.target.elements, f = Object.fromEntries(new FormData(e.target));
  const amount = parseFloat(f.amount);
  if (!(amount > 0)) return toast('金額要大於 0');
  const rec = { type: f.type, date: f.date, title: f.title.trim(), cat: f.cat, amount, cur: f.cur || base(),
    pay: f.pay };
  const t = trip();
  if (f.id) Object.assign(t.money.find(x => x.id === f.id), rec); // 舊紀錄的付款人 / 分攤欄位保留不動
  else t.money.push({ id: uid(), ...rec });
  db.lastCur = rec.cur;
  save();
  toast(f.id ? '已更新' : `已記下 ${esc(rec.title)} ${fmtCur(amount, rec.cur)}`);
  navigator.vibrate?.(15);
  if (f.id) resetMoneyForm();
  else { // 連續記帳：保留日期、幣別，只清項目和金額
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
    for (const k of ['type', 'date', 'title', 'cat', 'amount', 'id']) el[k].value = r[k];
    el.cur.value = r.cur || base();
    el.pay.value = r.pay || '現金';
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
            <div class="sub"><span class="tag soft">${esc(r.cat)}</span>${r.type === 'income' ? '<span class="tag">收入 / 退款</span>' : ''}${r.pay ? `<span class="tag soft">${esc(r.pay)}</span>` : ''}</div>
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
function computeSettle() {
  let expense = 0, income = 0;
  for (const r of trip().money) {
    if (r.type === 'income') income += toBase(r); else expense += toBase(r);
  }
  return { expense, income };
}

function renderSettle() {
  const t = trip(), { expense, income } = computeSettle();
  const net = expense - income;
  const days = t.start && t.end ? dayDiff(t.end, t.start) + 1 : 0;
  $('#settleStats').innerHTML = [
    [ic('coins') + '總花費', money(expense)], income ? [ic('refund') + '收入 / 退款', money(income)] : null, income ? [ic('receipt') + '淨花費', money(net)] : null,
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
  const t = trip(), { expense, income } = computeSettle();
  const net = expense - income, days = t.start && t.end ? dayDiff(t.end, t.start) + 1 : 0;
  const lines = [`【${t.name}】旅費統計`, `總花費 ${money(expense)}`];
  if (income) lines.push(`收入 / 退款 ${money(income)}`, `淨花費 ${money(net)}`);
  if (days > 0) lines.push(`平均每日 ${money(net / days)}`);
  if (t.budget) lines.push(`預算 ${money(t.budget)}，剩餘 ${money(t.budget - net)}`);
  const cats = {};
  t.money.filter(r => r.type !== 'income').forEach(r => { cats[r.cat] = (cats[r.cat] || 0) + toBase(r); });
  const list = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  if (list.length) { lines.push('', '— 分類 —'); list.forEach(([c, v]) => lines.push(`${c}：${money(v)}`)); }
  return lines.join('\n');
}
$('#shareSettle').addEventListener('click', () => {
  if (!trip().money.length) return toast('還沒有任何記帳');
  shareText(settleText(), `${trip().name} 花費統計`);
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
  const list = [...trip().bookings].filter(b => isPlanner() || !b.date || b.date <= todayStr()).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
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
$('#memberList').addEventListener('click', e => {
  if (!e.target.matches('.del')) return;
  const id = e.target.closest('[data-id]').dataset.id, t = trip();
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
    list.forEach(t => { t.id = uid(); delete t.sync; migrate(t); db.trips.push(t); });
    db.current = list[list.length - 1].id;
    save(); resetForms(); render(); toast(`已匯入 ${list.length} 個旅程`);
  } catch { toast('檔案格式不正確'); }
  e.target.value = '';
});
$('#deleteTripBtn').addEventListener('click', () => {
  if (!confirm(`確定刪除「${trip().name}」？所有旅伴的手機也會一起刪除，無法復原，建議先匯出備份。`)) return;
  const gone = trip();
  if (gone.sync) cloudStop(gone);
  db.trips = db.trips.filter(t => t.id !== db.current);
  if (!db.trips.length) db.trips.push(newTrip());
  db.current = db.trips[0].id; save(); resetForms(); render();
});

function renderSettings() {
  const t = trip(), el = $('#tripForm').elements;
  if (!$('#tripForm').contains(document.activeElement))
    for (const k of ['name', 'currency', 'start', 'end', 'budget']) el[k].value = t[k] || '';
  $('#memberList').innerHTML = t.members.map(m => `<div class="member-row" data-id="${m.id}">
      <span class="member-name">${ic('user')}${esc(m.name)}</span>
      <button class="icon del" title="刪除">${ic('x')}</button>
    </div>`).join('') || '<span class="muted">尚無成員</span>';
  renderBookings(); renderRates();
}


// ===== 更多：驚喜模式 =====
function renderSurprise() {
  const t = trip(), box = $('#surpriseBox'); if (!box) return;
  const on = surpriseOn(t), planner = !!db.planner?.[t.id];
  box.innerHTML = !on ? `
    <div class="s-head">${ic('gift')}<b>讓旅伴當天才知道行程</b></div>
    <p class="muted small">開啟後只有你看得到未來的行程；旅伴的手機會顯示「神秘行程」，每天 00:00 自動解鎖當天的。航班和機場接送會自動公開，其他想讓大家知道的行程，可以個別勾「不隱藏這一項」。</p>
    <form class="s-form" data-sp-form="on">
      <input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" placeholder="設定規劃者密碼（4–8 位數字）" required autocomplete="new-password">
      <button>開啟驚喜模式</button>
    </form>`
  : planner ? `
    <div class="s-head">${ic('gift')}<b>驚喜模式開啟中・你是規劃者</b></div>
    <p class="muted small">旅伴目前看不到 <b>${lockedCount(t)}</b> 個行程。你的其他裝置（例如電腦）要看完整行程，在那台按「我是規劃者」輸入密碼即可。</p>
    <div class="actions">
      <button type="button" class="ghost" data-sp="preview">${ic('people')} 旅伴視角預覽</button>
      <button type="button" class="ghost" data-sp="off">關閉驚喜模式</button>
    </div>`
  : `
    <div class="s-head">${ic('lock')}<b>行程是驚喜</b></div>
    <p class="muted small">規劃者把行程藏起來了，每天 00:00 會解鎖當天的行程。</p>
    <form class="s-form" data-sp-form="claim">
      <input name="pin" type="password" inputmode="numeric" maxlength="8" placeholder="我是規劃者：輸入密碼" required autocomplete="current-password">
      <button>解鎖</button>
    </form>`;
}
async function surpriseSubmit(form) {
  const t = trip(), pin = form.elements.pin.value.trim();
  if (form.dataset.spForm === 'on') {
    if (!/^\d{4,8}$/.test(pin)) return toast('密碼請用 4–8 位數字');
    const salt = uid() + uid();
    t.surprise = { on: true, salt, hash: await pinHash(pin, salt) };
    (db.planner ||= {})[t.id] = true;
    save(); render(); flyBanner('驚喜模式開啟');
    toast('記好密碼喔！換手機時要用它解鎖');
  } else {
    if (await pinHash(pin, t.surprise.salt) !== t.surprise.hash) { form.elements.pin.value = ''; return toast('密碼不對'); }
    (db.planner ||= {})[t.id] = true; surprisePreview = false;
    save(true); render(); toast('已解鎖，你是規劃者');
  }
}
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-sp-form]'); if (!f) return;
  e.preventDefault(); surpriseSubmit(f);
});
document.addEventListener('click', e => {
  const act = e.target.closest('[data-sp]')?.dataset.sp; if (!act) return;
  const t = trip();
  if (act === 'preview') { surprisePreview = true; render(); goTab('plan'); toast('現在看到的是旅伴的畫面'); }
  else if (act === 'endpreview') { surprisePreview = false; render(); }
  else if (act === 'off') {
    if (!confirm('關閉後旅伴馬上就能看到全部行程，確定嗎？')) return;
    delete t.surprise; save(); render(); toast('已關閉驚喜模式');
  }
});
// 過了午夜要解鎖新的一天
let lastDay = todayStr();
setInterval(() => { if (todayStr() !== lastDay) { lastDay = todayStr(); render(); } }, 60000);

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
  renderCloud(); renderSurprise();
  renderLive(); renderPrep(); renderPlan(); renderMoney(); renderSettle(); renderSettings(); renderConverter();
}
function resetForms() {
  resetPlanForm();
  $('#bookingForm').reset(); $('#bookingForm').elements.id.value = ''; $('#bookingSubmit').textContent = '儲存';
  render(); resetMoneyForm();
}

// ===== 雲端同步（Firebase Firestore）=====
// 每個同步中的旅程存成 trips/{分享碼}：{ trip, rev, by, at }。知道分享碼的人才能讀寫。
// 同時有人修改時用三方合併（上次同步的版本 / 我的 / 雲端的），以項目 id 為單位，不會整份覆蓋。
const FB_CONFIG = {
  apiKey: 'AIzaSyDeL1DzRbW0NwGoH2vhMEuunitqNkOuMp8',
  authDomain: 'travel-log-hkj5c.firebaseapp.com',
  projectId: 'travel-log-hkj5c',
  storageBucket: 'travel-log-hkj5c.firebasestorage.app',
  messagingSenderId: '1034924162124',
  appId: '1:1034924162124:web:111b6fa91e642e29c908e9',
};
const FB_VER = '11.0.2';
const DEVICE = (() => {
  try { let d = localStorage.getItem('tl-device'); if (!d) localStorage.setItem('tl-device', d = uid() + uid()); return d; }
  catch { return uid(); }
})();
db.sync ||= {}; // { 分享碼: { base: 上次同步的 JSON, rev } }
const cloud = { fs: null, loading: null, subs: {}, state: {}, timer: null };
const J = o => JSON.stringify(o);
const plain = o => JSON.parse(J(o)); // 去掉 undefined，Firestore 不收
const tripData = t => { const c = plain(t); delete c.sync; return c; };

function newCode() {
  const A = 'abcdefghijkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(24));
  return [...b].map(x => A[x % A.length]).join('');
}
function parseCode(s) {
  s = (s || '').trim();
  const m = s.match(/[?&]join=([a-z0-9]+)/i);
  return (m ? m[1] : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}
const shareLink = code => `${location.origin}${location.pathname}?join=${code}`;

async function fb() {
  if (cloud.fs) return cloud.fs;
  cloud.loading ||= (async () => {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const { initializeApp } = await import(base + 'firebase-app.js');
    const F = await import(base + 'firebase-firestore.js');
    const app = initializeApp(FB_CONFIG);
    cloud.fs = { F, store: F.getFirestore(app) };
    return cloud.fs;
  })().catch(e => { cloud.loading = null; throw e; });
  return cloud.loading;
}

// 三方合併：b 上次同步、l 本機、r 雲端
function merge3(b, l, r) {
  const jl = J(l), jr = J(r);
  if (jl === jr) return l;
  if (b !== undefined && jl === J(b)) return r;
  if (b !== undefined && jr === J(b)) return l;
  const isObjArr = a => Array.isArray(a) && a.every(x => x && typeof x === 'object' && 'id' in x);
  if (isObjArr(l) && isObjArr(r)) {
    const byId = a => new Map((isObjArr(a) ? a : []).map(x => [x.id, x]));
    const B = byId(b), L = byId(l), R = byId(r), out = [];
    const ids = [...new Set([...r.map(x => x.id), ...l.map(x => x.id)])];
    for (const id of ids) {
      const bi = B.get(id), li = L.get(id), ri = R.get(id);
      if (li && ri) out.push(merge3(bi, li, ri));
      else if (ri) { if (!bi || J(ri) !== J(bi)) out.push(ri); }      // 本機刪掉了，但雲端沒改過就跟著刪
      else if (li) { if (!bi || J(li) !== J(bi)) out.push(li); }
    }
    return out;
  }
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  if (isObj(l) && isObj(r)) {
    const out = {}, bo = isObj(b) ? b : {};
    for (const k of new Set([...Object.keys(r), ...Object.keys(l)])) {
      if (!(k in l)) { if (!(k in bo) || J(r[k]) !== J(bo[k])) out[k] = r[k]; continue; }
      if (!(k in r)) { if (!(k in bo) || J(l[k]) !== J(bo[k])) out[k] = l[k]; continue; }
      out[k] = merge3(bo[k], l[k], r[k]);
    }
    return out;
  }
  return l; // 同一個欄位兩邊都改：以本機為準
}

function setCloudState(code, st) { cloud.state[code] = { ...cloud.state[code], ...st }; renderCloud(); }
function applyRemote(t, data) {
  const keep = { id: t.id, sync: t.sync };
  for (const k of Object.keys(t)) delete t[k];
  Object.assign(t, migrate(plain(data)), keep);
}

function cloudListen(t) {
  const code = t.sync;
  if (!code || cloud.subs[code]) return;
  cloud.subs[code] = 'pending';
  fb().then(({ F, store }) => {
    if (cloud.subs[code] !== 'pending') return;
    cloud.subs[code] = F.onSnapshot(F.doc(store, 'trips', code), snap => {
      const t2 = db.trips.find(x => x.sync === code); if (!t2) return;
      if (!snap.exists()) return setCloudState(code, { status: 'missing' });
      const d = snap.data(), s = db.sync[code] ||= {};
      if (d.rev === s.rev) return setCloudState(code, { status: 'ok', at: d.at });
      const local = tripData(t2), base = s.base ? JSON.parse(s.base) : undefined;
      const merged = merge3(base, local, d.trip);
      s.base = J(d.trip); s.rev = d.rev;
      if (J(merged) !== J(local)) {
        applyRemote(t2, merged); save(true);
        if (t2.id === trip().id) { render(); if (d.by !== DEVICE) toast('旅伴更新了資料'); }
      } else save(true);
      if (J(merged) !== J(d.trip)) cloudDirty(); // 本機還有沒上傳的修改
      setCloudState(code, { status: 'ok', at: d.at });
    }, () => setCloudState(code, { status: 'error' }));
  }).catch(() => { delete cloud.subs[code]; setCloudState(code, { status: 'offline' }); });
}
function cloudUnlisten(code) {
  const u = cloud.subs[code];
  if (typeof u === 'function') u();
  delete cloud.subs[code];
}

function cloudDirty() {
  if (cloud.spaceLoaded && db.trips.some(t => !t.sync && !untouched(t))) autoUpload();
  if (!db.trips.some(t => t.sync)) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(cloudPushAll, 900);
}
async function cloudPushAll() {
  for (const t of db.trips) if (t.sync) {
    const s = db.sync[t.sync] ||= {};
    if (s.base && J(tripData(t)) === s.base) continue;
    await cloudPush(t).catch(() => {});
  }
}
async function cloudPush(t) {
  const code = t.sync;
  setCloudState(code, { status: 'saving' });
  try {
    const { F, store } = await fb();
    const ref = F.doc(store, 'trips', code), s = db.sync[code] ||= {};
    const result = await F.runTransaction(store, async tx => {
      const snap = await tx.get(ref);
      let data = tripData(t), rev = 1;
      if (snap.exists()) {
        const d = snap.data();
        rev = (d.rev || 0) + 1;
        if (d.rev !== s.rev) data = merge3(s.base ? JSON.parse(s.base) : undefined, data, d.trip);
      }
      const at = Date.now();
      tx.set(ref, { trip: data, rev, by: DEVICE, at });
      return { data, rev, at };
    });
    s.base = J(result.data); s.rev = result.rev;
    if (J(result.data) !== J(tripData(t))) { applyRemote(t, result.data); if (t.id === trip().id) render(); }
    save(true);
    setCloudState(code, { status: 'ok', at: result.at });
  } catch (e) {
    setCloudState(code, { status: navigator.onLine ? 'error' : 'offline' });
    throw e;
  }
}

// ===== 自動同步：所有旅程都登記在同一個共用空間，打開網站就同步 =====
const SPACE = 'kfbvgdcgwj1p9j3uljtmx1ig0gbf';
const untouched = t => !t.members.length && !t.plan.length && !t.money.length && !t.prep.length && !t.bookings.length;
cloud.joining = {};
async function spaceSet(op, code) {
  const { F, store } = await fb();
  await F.setDoc(F.doc(store, 'spaces', SPACE), { codes: F[op](code), at: Date.now() }, { merge: true });
}
async function cloudStart(t = trip()) {
  if (t.sync) return;
  t.sync = newCode();
  db.sync[t.sync] = {};
  save(true); renderCloud();
  try {
    await cloudPush(t);
    await spaceSet('arrayUnion', t.sync);
    if (db.sync[t.sync]) { db.sync[t.sync].reg = true; save(true); }
    cloudListen(t);
  } catch {
    if (db.sync[t.sync] && !db.sync[t.sync].rev) { delete db.sync[t.sync]; delete t.sync; save(true); renderCloud(); }
  }
}
function cloudStop(t = trip()) {
  if (!t.sync) return;
  const code = t.sync;
  cloudUnlisten(code);
  delete db.sync[code]; delete t.sync;
  save(true);
  spaceSet('arrayRemove', code).catch(() => {});
}
async function cloudJoin(raw, silent = false) {
  const code = parseCode(raw);
  if (code.length < 20) return silent || toast('分享碼不正確');
  const exist = db.trips.find(t => t.sync === code);
  if (exist) { if (!silent) { db.current = exist.id; save(true); resetForms(); } return; }
  if (cloud.joining[code]) return;
  cloud.joining[code] = true;
  try {
    const { F, store } = await fb();
    const snap = await F.getDoc(F.doc(store, 'trips', code));
    if (!snap.exists()) return silent || toast('找不到這個旅程');
    const d = snap.data(), data = migrate(plain(d.trip));
    const same = db.trips.find(t => t.id === data.id);
    if (same) { // 本機已有同一趟（例如以前停過同步）：接上同步，之後自動合併
      same.sync = code; db.sync[code] = { reg: silent };
    } else {
      data.sync = code; db.trips.push(data);
      db.sync[code] = { base: J(d.trip), rev: d.rev, reg: silent }; // 從共用空間來的，之後空間拿掉就跟著刪
    }
    // 新手機上沒動過的預設旅程，直接換成雲端的
    const cur = trip(), before = db.current;
    if (cur.id !== data.id && !cur.sync && untouched(cur)) { db.trips = db.trips.filter(t => t !== cur); db.current = data.id; }
    if (!silent) db.current = data.id;
    save(true); cloudListen(same || data);
    if (db.current !== before) resetForms(); else render(); // 沒換旅程就不要清掉正在填的表單
    if (!silent) toast(`已加入「${esc(data.name)}」`);
  } catch { if (!silent) toast('連不上雲端，請確認網路後再試一次'); }
  finally { delete cloud.joining[code]; }
}
function autoUpload() {
  if (!cloud.spaceLoaded) return;
  db.trips.forEach(t => { if (!t.sync && !untouched(t)) cloudStart(t); });
}
function spaceInit() {
  if (cloud.space) return;
  cloud.space = 'pending';
  fb().then(({ F, store }) => {
    cloud.space = F.onSnapshot(F.doc(store, 'spaces', SPACE), snap => {
      const codes = snap.exists() ? snap.data().codes || [] : [];
      // 別的手機刪掉的旅程，這邊也拿掉
      for (const t of [...db.trips]) {
        if (!t.sync) continue;
        const s = db.sync[t.sync] ||= {};
        if (codes.includes(t.sync)) { if (!s.reg) { s.reg = true; save(true); } }
        else if (s.reg) {
          cloudUnlisten(t.sync); delete db.sync[t.sync];
          db.trips = db.trips.filter(x => x !== t);
          if (!db.trips.length) db.trips.push(newTrip());
          if (!db.trips.some(x => x.id === db.current)) db.current = db.trips[0].id;
          save(true); resetForms();
        }
      }
      codes.forEach(c => cloudJoin(c, true));
      cloud.spaceLoaded = true;
      autoUpload(); renderCloud();
    }, () => { cloud.space = null; });
  }).catch(() => { cloud.space = null; });
}

const timeAgo = ms => {
  if (!ms) return '';
  const m = Math.round((Date.now() - ms) / 6e4);
  return m < 1 ? '剛剛' : m < 60 ? `${m} 分鐘前` : m < 1440 ? `${Math.round(m / 60)} 小時前` : fmtDate(todayStr(new Date(ms)));
};
const CLOUD_TEXT = { ok: '已同步', saving: '同步中…', offline: '離線中，有網路時會自動同步', error: '同步失敗，稍後自動重試', missing: '雲端找不到這個旅程' };
function renderCloud() {
  const t = trip(), box = $('#cloudBox'), badge = $('#syncBadge');
  if (!box) return;
  const st = t.sync ? (cloud.state[t.sync] || { status: 'saving' }) : null;
  badge.hidden = !t.sync;
  if (st) {
    badge.className = 'sync-badge ' + st.status;
    badge.innerHTML = `${ic(st.status === 'ok' || st.status === 'saving' ? 'cloud' : 'cloud-off')}${st.status === 'ok' ? '已同步' : st.status === 'saving' ? '同步中' : '未同步'}`;
  }
  box.innerHTML = t.sync ? `
    <div class="cloud-head">${ic('cloud')}<b>自動同步中</b></div>
    <div class="cloud-status ${st.status}">${CLOUD_TEXT[st.status] || ''}${st.status === 'ok' && st.at ? `・${timeAgo(st.at)}更新` : ''}</div>
    <p class="muted small">所有旅程都會自動存到雲端。旅伴只要打開這個網站，就會看到同一份行程和帳本，誰改了大家都會即時更新。</p>
    <button type="button" data-act="share">${ic('share')} 把網址傳給旅伴</button>`
  : `
    <div class="cloud-head">${ic(untouched(t) ? 'cloud' : 'cloud-off')}<b>${untouched(t) ? '新旅程' : '準備上傳…'}</b></div>
    <p class="muted small">${untouched(t) ? '開始填資料（成員、行程或記帳）後就會自動上傳雲端。' : navigator.onLine ? '正在連線雲端。' : '目前離線，有網路時會自動上傳。'}</p>`;
}
$('#cloudBox').addEventListener('click', e => {
  const act = e.target.closest('[data-act]')?.dataset.act, t = trip();
  if (act === 'share') shareText(`一起用旅遊手帳看「${t.name}」的行程和帳本！\n打開網站就會自動同步：\n${location.origin}${location.pathname}`, t.name);
});
$('#joinForm').addEventListener('submit', e => {
  e.preventDefault();
  cloudJoin(e.target.elements.code.value); e.target.reset();
});
$('#syncBadge').addEventListener('click', () => { goTab('settings'); setTimeout(() => scrollToEl($('#sec-cloud')), 350); });
addEventListener('online', () => { spaceInit(); db.trips.forEach(cloudListen); cloudDirty(); cloudPushAll(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderCloud(); });

function cloudInit() {
  spaceInit();
  db.trips.forEach(t => t.sync && cloudListen(t));
  cloudPushAll();
  const code = new URLSearchParams(location.search).get('join');
  if (code) {
    history.replaceState(null, '', location.pathname);
    if (confirm('要加入旅伴分享的旅程嗎？')) cloudJoin(code);
  }
}

// ===== 加到主畫面引導 =====
const UA = navigator.userAgent;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInApp = /Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(UA);
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#guideInstall').hidden = typeof guide === 'undefined' || guide.plat !== 'android'; });
addEventListener('appinstalled', () => { closeGuide(); toast('已加到主畫面！'); });

const SHARE_IC = `<svg class="ic" viewBox="0 0 24 24"><path d="M12 3 v12 M7.5 7.5 L12 3 L16.5 7.5"/><path d="M8 10 H5.5 V20.5 H18.5 V10 H16" fill="var(--sky)"/></svg>`;
const PLUS_IC = `<svg class="ic" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" fill="var(--card)"/><path d="M12 8 v8 M8 12 h8"/></svg>`;
const DOTS_IC = `<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="5.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="18.5" r="1.6" fill="currentColor"/></svg>`;
// 每個平台：步驟文字 + 示意手機畫面（data-s 切換場景）+ 手指位置（%）
const appIc = '<img src="icons/icon-192.png" alt="">';
const IOS_SHARE = `<svg viewBox="0 0 24 24"><path d="M12 3 v12 M7.5 7.5 L12 3 L16.5 7.5 M8 10 H5.5 V20.5 H18.5 V10 H16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const mPage = `<div class="m-page"><div class="m-hero"><img src="icons/icon-192.png" alt=""></div><i></i><i></i><i class="s"></i><i></i><i class="s"></i></div>`;
const mHome = `<div class="m-home">${Array.from({ length: 11 }, (_, i) => `<span class="m-app a${i % 6}"></span>`).join('')}<span class="m-app me">${appIc}<em>旅遊手帳</em></span></div>`;
const GUIDE = {
  ios: {
    finger: [[50, 93], [50, 81], [84, 13], null],
    steps: [
      `點 Safari 下方的<b>分享</b>按鈕 ${SHARE_IC}`,
      `選單往上滑，點<b>「加入主畫面」</b> ${PLUS_IC}`,
      `右上角按<b>「加入」</b>`,
      `完成！主畫面出現<b>「旅遊手帳」</b>，之後都從這裡打開`,
    ],
    tip: '找不到「加入主畫面」？請確認是用 <b>Safari</b> 開啟；用 Chrome 的話，分享按鈕在網址列右邊。',
    mock: `<div class="m-status"><span>9:41</span></div>
      ${mPage}
      <div class="m-ios-bar"><div class="m-url">hau891212-dot.github.io</div>
        <div class="m-tools"><span>‹</span><span>›</span><span class="m-hot k1">${IOS_SHARE}</span><span>▢</span><span>⧉</span></div></div>
      <div class="m-sheet"><div class="m-sheet-head">${appIc}<div><b>旅遊手帳</b><small>github.io</small></div></div>
        <div class="m-row">拷貝</div><div class="m-row">加入書籤</div>
        <div class="m-row m-hot k2">加入主畫面 <span class="m-plus">＋</span></div><div class="m-row">加入快速備忘錄</div></div>
      <div class="m-dialog m-full"><div class="m-topbar"><span>取消</span><b>加入主畫面</b><span class="m-hot k3">加入</span></div>
        <div class="m-add">${appIc}<div><b>旅遊手帳</b><small>hau891212-dot.github.io</small></div></div></div>
      ${mHome}`,
  },
  android: {
    finger: [[90, 10], [60, 41], [75, 60], null],
    steps: [
      `點 Chrome 右上角的選單 ${DOTS_IC}`,
      `點<b>「加到主畫面」</b>或<b>「安裝應用程式」</b>`,
      `按<b>「新增」</b>（或「安裝」）`,
      `完成！主畫面出現<b>「旅遊手帳」</b>，之後都從這裡打開`,
    ],
    tip: '如果下面出現「立即安裝」按鈕，直接按它最快。',
    mock: `<div class="m-status"><span>9:41</span></div>
      <div class="m-and-bar"><div class="m-url">github.io/travel-log</div><span class="m-hot k1">⋮</span></div>
      ${mPage}
      <div class="m-menu"><div class="m-row">新分頁</div><div class="m-row">書籤</div><div class="m-row">記錄</div>
        <div class="m-row m-hot k2">加到主畫面</div><div class="m-row">設定</div></div>
      <div class="m-dialog m-card"><b>加到主畫面</b><div class="m-add">${appIc}<span>旅遊手帳</span></div>
        <div class="m-btns"><span>取消</span><span class="m-hot k3">新增</span></div></div>
      ${mHome}`,
  },
  inapp: {
    finger: [[90, 10], [50, 90], null],
    steps: [
      `在 LINE / IG 裡面沒辦法加到主畫面。先點右上角的 ${DOTS_IC}`,
      `選<b>「${isIOS ? '以 Safari 開啟' : '用預設瀏覽器開啟'}」</b>`,
      `在${isIOS ? ' Safari' : ' Chrome'} 打開後，再照這個教學的「${isIOS ? 'iPhone' : 'Android'}」步驟加到主畫面`,
    ],
    tip: '',
    mock: `<div class="m-status"><span>9:41</span></div>
      <div class="m-line-bar"><span>✕</span><b>旅遊手帳</b><span class="m-hot k1">⋯</span></div>
      ${mPage}
      <div class="m-sheet m-line-sheet"><div class="m-row">分享</div><div class="m-row">複製連結</div>
        <div class="m-row m-hot k2">${isIOS ? '以 Safari 開啟' : '用預設瀏覽器開啟'}</div></div>
      <div class="m-dialog m-full m-safari"><div class="m-status"><span>9:41</span></div>${mPage}
        <div class="m-ios-bar"><div class="m-url">hau891212-dot.github.io</div></div><div class="m-ok">已在${isIOS ? ' Safari' : '瀏覽器'}開啟</div></div>`,
  },
};
const step = (n, html) => `<div class="g-step"><span class="g-n">${n}</span><div>${html}</div></div>`;
const guide = { plat: isInApp ? 'inapp' : isIOS ? 'ios' : 'android', s: 0, timer: null };
function guideShow(s) {
  const g = GUIDE[guide.plat], n = g.steps.length;
  guide.s = (s + n) % n;
  const mock = $('#guideMock .mock'); if (!mock) return;
  mock.dataset.s = guide.s + 1;
  const f = $('.m-finger', mock), pos = g.finger[guide.s];
  f.hidden = !pos;
  if (pos) { f.style.left = pos[0] + '%'; f.style.top = pos[1] + '%'; f.classList.remove('tap'); void f.offsetWidth; f.classList.add('tap'); }
  $$('#guideSteps .g-step').forEach((el, i) => el.classList.toggle('on', i === guide.s));
  $$('#guideDots button').forEach((el, i) => el.classList.toggle('on', i === guide.s));
}
function guidePlay() {
  clearInterval(guide.timer);
  guide.timer = setInterval(() => { if (!$('#installGuide').hidden) guideShow(guide.s + 1); else clearInterval(guide.timer); }, 3000);
}
function guideRender() {
  const g = GUIDE[guide.plat];
  $$('#guideTabs button').forEach(b => b.classList.toggle('on', b.dataset.plat === guide.plat));
  $('#guideMock').innerHTML = `<div class="mock m-${guide.plat}" data-s="1">${g.mock}<span class="m-finger" hidden></span></div>`;
  $('#guideDots').innerHTML = g.steps.map((_, i) => `<button type="button" data-i="${i}" aria-label="第 ${i + 1} 步"></button>`).join('');
  $('#guideSteps').innerHTML = g.steps.map((t, i) => step(i + 1, t).replace('class="g-step"', `class="g-step" data-i="${i}"`)).join('')
    + (g.tip ? `<p class="muted small g-tip">${g.tip}</p>` : '');
  $('#guideInstall').hidden = !installEvt || guide.plat !== 'android';
  requestAnimationFrame(() => guideShow(0));
  guidePlay();
}
$('#guideTabs').addEventListener('click', e => {
  const p = e.target.closest('[data-plat]')?.dataset.plat;
  if (p && p !== guide.plat) { guide.plat = p; guideRender(); }
});
$('#installGuide').addEventListener('click', e => {
  const i = e.target.closest('#guideDots [data-i], #guideSteps [data-i]')?.dataset.i;
  if (i !== undefined) { guideShow(+i); guidePlay(); }
  else if (e.target.closest('#guideMock')) { guideShow(guide.s + 1); guidePlay(); }
});
function openGuide() {
  guideRender();
  $('#installGuide').hidden = false;
  requestAnimationFrame(() => $('#installGuide').classList.add('show'));
}
function closeGuide() {
  clearInterval(guide.timer);
  $('#installGuide').classList.remove('show');
  setTimeout(() => { $('#installGuide').hidden = true; }, 250);
}
$('#installGuide').addEventListener('click', e => {
  const act = e.target.closest('[data-guide]')?.dataset.guide;
  if (e.target.id === 'installGuide' || act === 'close' || act === 'later') {
    closeGuide(); try { sessionStorage.setItem('tl-guide', '1'); } catch {}
  } else if (act === 'never') {
    closeGuide(); try { localStorage.setItem('tl-guide-never', '1'); } catch {}
    toast('之後可以在「更多 → 資料備份」再打開教學');
  }
});
$('#guideInstall').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt();
  const { outcome } = await installEvt.userChoice.catch(() => ({}));
  installEvt = null;
  if (outcome === 'accepted') closeGuide(); else $('#guideInstall').hidden = true;
});
$('#installGuideBtn').addEventListener('click', () => isStandalone() ? toast('已經是從主畫面打開的囉！') : openGuide());
(() => {
  let never = false, shown = false;
  try { never = localStorage.getItem('tl-guide-never'); shown = sessionStorage.getItem('tl-guide'); } catch {}
  const touch = matchMedia('(pointer: coarse)').matches;
  if (!isStandalone() && !never && !shown && touch) setTimeout(openGuide, 1200);
})();

resetForms();
cloudInit();
navigator.storage?.persist?.().catch(() => {});

// ===== 自動偵測更新 =====
// APP_VERSION 由 git pre-commit hook 自動蓋上，不用手動改
const APP_VERSION = '20261121224824';
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
