// ===== 工具 =====
const KEY = 'travel-log-v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEK = '日一二三四五六';
const CITY = {
  busan: { name: '釜山', flag: '🇰🇷' },
  fukuoka: { name: '福岡', flag: '🇯🇵' },
  move: { name: '移動', flag: '⛴️' },
};
const cityTag = c => CITY[c] ? `<span class="city ${c}">${CITY[c].flag} ${CITY[c].name}</span>` : '';
const empty = (msg, icon = 'suitcase') =>
  `<div class="empty"><svg><use href="#i-${icon}"/></svg><p>${msg}</p></div>`;

// ===== 資料層 =====
function newTrip(name = '釜山 × 福岡') {
  return { id: uid(), name, currency: 'TWD', start: '', end: '', budget: 0,
    members: [], prep: [], plan: [], money: [] };
}
let db;
try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
if (!db || !db.trips?.length) {
  const t = newTrip();
  db = { current: t.id, trips: [t] };
}
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const trip = () => db.trips.find(t => t.id === db.current) || db.trips[0];
const memberName = id => trip().members.find(m => m.id === id)?.name ?? '（已刪除）';
const money = n => {
  const cur = trip().currency || '';
  return `${cur} ${Number(n || 0).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`.trim();
};
const fmtDate = s => {
  if (!s) return '';
  const d = new Date(s + 'T00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
};
const toMin = t => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };

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

// ===== 旅程切換 =====
$('#tripSelect').addEventListener('change', e => { db.current = e.target.value; save(); render(); });
$('#newTripBtn').addEventListener('click', () => {
  const name = prompt('新旅程名稱'); if (!name) return;
  const t = newTrip(name); db.trips.push(t); db.current = t.id; save(); render();
});

// ===== 前置作業 =====
$('#prepForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  trip().prep.push({ id: uid(), text: f.text, cat: f.cat, owner: f.owner, due: f.due, done: false });
  e.target.elements.text.value = ''; save(); render();
});
$('#prepList').addEventListener('click', e => {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  const t = trip();
  if (e.target.matches('input[type=checkbox]')) {
    t.prep.find(x => x.id === id).done = e.target.checked;
    if (e.target.checked) navigator.vibrate?.(15);
  } else if (e.target.matches('.del')) {
    t.prep = t.prep.filter(x => x.id !== id);
  } else return;
  save(); render();
});

function renderPrep() {
  const list = trip().prep;
  const done = list.filter(p => p.done).length;
  $('#prepBar').style.width = list.length ? (done / list.length * 100) + '%' : '0';
  $('#prepStat').textContent = list.length
    ? (done === list.length ? `全部完成 🎉 可以出發了！` : `已完成 ${done} / ${list.length}`)
    : '';
  const today = todayStr();
  const sorted = [...list].sort((a, b) => a.done - b.done || (a.due || '9').localeCompare(b.due || '9'));
  $('#prepList').innerHTML = sorted.map(p => `
    <div class="item ${p.done ? 'done' : ''}" data-id="${p.id}">
      <input type="checkbox" ${p.done ? 'checked' : ''} aria-label="完成">
      <div class="main">
        <div class="title">${esc(p.text)}</div>
        <div class="sub"><span class="tag">${esc(p.cat)}</span>
          ${p.owner ? '👤 ' + esc(memberName(p.owner)) : ''}
          ${p.due ? `<span class="${!p.done && p.due < today ? 'overdue' : ''}">　⏰ ${fmtDate(p.due)}</span>` : ''}
        </div>
      </div>
      <button class="icon del" title="刪除">✕</button>
    </div>`).join('') || empty('行李箱還空空的～<br>先列出出發前要做的事吧！', 'suitcase');
}

// ===== 行程 =====
$('#planForm').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target, f = Object.fromEntries(new FormData(form));
  const t = trip();
  if (f.id) Object.assign(t.plan.find(x => x.id === f.id), f);
  else t.plan.push({ ...f, id: uid() });
  const keep = { date: f.date, city: f.city };
  form.reset();
  form.elements.date.value = keep.date; form.elements.city.value = keep.city; form.elements.id.value = '';
  save(); render();
});

function editPlan(id) {
  const p = trip().plan.find(x => x.id === id), el = $('#planForm').elements;
  for (const k of ['city', 'date', 'start', 'end', 'title', 'place', 'note', 'id']) el[k].value = p[k] || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  el.title.focus({ preventScroll: true });
}
function planClick(e) {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  if (e.target.matches('.del')) {
    if (!confirm('刪除這個行程？')) return;
    trip().plan = trip().plan.filter(x => x.id !== id); save(); render();
  } else if (e.target.matches('.edit')) {
    if (!$('#tab-plan').classList.contains('active')) goTab('plan');
    editPlan(id);
  }
}
$('#planList').addEventListener('click', planClick);
$('#todayList').addEventListener('click', planClick);

const sortedPlan = () => [...trip().plan].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
const mapLink = place => place
  ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}" target="_blank" rel="noopener">📍${esc(place)}</a>` : '';

function planItem(p, cls = '') {
  return `<div class="item ${cls} city-${p.city || 'none'}" data-id="${p.id}">
    <div class="time">${esc(p.start)}${p.end ? `<small>${esc(p.end)}</small>` : ''}</div>
    <div class="main">
      <div class="title">${cityTag(p.city)}${esc(p.title)}</div>
      <div class="sub">${mapLink(p.place)}${p.note ? ' ' + esc(p.note) : ''}</div>
    </div>
    <div class="btns">
      <button class="icon edit" title="編輯">✎</button>
      <button class="icon del" title="刪除">✕</button>
    </div>
  </div>`;
}

function renderPlan() {
  const byDay = {};
  sortedPlan().forEach(p => (byDay[p.date] ||= []).push(p));
  const start = trip().start;
  $('#planList').innerHTML = Object.keys(byDay).map(d => {
    const n = start ? Math.round((new Date(d) - new Date(start)) / 864e5) + 1 : null;
    const cities = [...new Set(byDay[d].map(p => p.city).filter(c => CITY[c]))];
    return `<div class="day-head">
        <span class="day-badge">${n > 0 ? `Day ${n}` : '📅'}</span>
        <span>${fmtDate(d)}</span>
        ${cities.map(c => `<span class="stamp ${c}">${CITY[c].name}</span>`).join('')}
        <span class="muted count">${byDay[d].length} 站</span>
      </div>
      <div class="timeline">${byDay[d].map(p => planItem(p)).join('')}</div>`;
  }).join('') || empty('還沒有行程～<br>從上面加入第一站吧！', 'torii');
}

// ===== 即時行程 =====
function liveState(now = new Date()) {
  const today = todayStr(now), nowMin = now.getHours() * 60 + now.getMinutes();
  const todays = sortedPlan().filter(p => p.date === today);
  const endOf = (p, i) => p.end ? toMin(p.end) : (todays[i + 1] ? toMin(todays[i + 1].start) : toMin(p.start) + 60);
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

function renderLive() {
  const now = new Date(), t = trip();
  $('#clock').textContent = `🕰️ ${fmtDate(todayStr(now))} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const { todays, current, next, nowMin, endOf } = liveState(now);
  let html = '';

  if (t.start && todayStr(now) < t.start) {
    const d = Math.ceil((new Date(t.start + 'T00:00') - now) / 864e5);
    html += pass({
      label: 'DEPARTURE · 距離出發', title: `還有 ${d} 天！`,
      sub: `前置作業完成 ${t.prep.filter(p => p.done).length} / ${t.prep.length}`,
      stubTop: '✈️', stubMid: 'D-day', stubBot: `D-${d}`,
    });
  }
  if (current) {
    const c = CITY[current.city];
    const total = endOf(current, todays.indexOf(current)) - toMin(current.start);
    const pct = Math.min(100, (nowMin - toMin(current.start)) / total * 100);
    html += pass({
      cls: 'now', city: current.city,
      label: '<span class="live-dot"></span>NOW · 正在進行', title: esc(current.title),
      sub: `${esc(current.start)}${current.end ? '–' + esc(current.end) : ''}　${mapLink(current.place)}`,
      extra: `${current.note ? `<div>${esc(current.note)}</div>` : ''}<div class="progress"><div style="width:${pct}%"></div></div>`,
      stubTop: c ? c.flag : '📍', stubMid: c ? c.name : '行程', stubBot: esc(current.start),
    });
  }
  if (next) {
    const c = CITY[next.city];
    html += pass({
      city: next.city,
      label: 'NEXT · 下一站', title: esc(next.title),
      sub: `${fmtDate(next.date)} ${esc(next.start)}　${mapLink(next.place)}`,
      extra: `<div class="countdown">⏳ ${countdown(next, now)}</div>`,
      stubTop: c ? c.flag : '📍', stubMid: c ? c.name : '行程', stubBot: esc(next.start),
    });
  }
  $('#liveBox').innerHTML = html || empty('目前沒有進行中或即將到來的行程<br>去「行程」排一下吧！', 'camera');

  $('#todayList').innerHTML = todays.length
    ? `<div class="timeline">${todays.map((p, i) =>
        planItem(p, p === current ? 'now' : endOf(p, i) <= nowMin ? 'past' : '')).join('')}</div>`
    : empty('今天沒有排行程，自由活動 🌊', 'umbrella');
}
setInterval(() => { if ($('#tab-live').classList.contains('active')) renderLive(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderLive(); });

// ===== 記帳 =====
function renderSplitBox(selected) {
  const t = trip();
  const sel = selected ?? t.members.map(m => m.id);
  $('#splitBox').innerHTML = t.members.map(m => `
    <label class="chip ${sel.includes(m.id) ? 'on' : ''}">
      <input type="checkbox" value="${m.id}" ${sel.includes(m.id) ? 'checked' : ''}>${esc(m.name)}</label>`).join('')
    || '<span class="muted">請先到「設定」新增成員</span>';
}
$('#splitBox').addEventListener('change', e => e.target.closest('.chip').classList.toggle('on', e.target.checked));

function resetMoneyForm() {
  const f = $('#moneyForm'); f.reset(); f.elements.id.value = ''; f.elements.date.value = todayStr(); renderSplitBox();
}
$('#moneyReset').addEventListener('click', resetMoneyForm);

$('#moneyForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const split = $$('#splitBox input:checked').map(i => i.value);
  if (!split.length) return alert('請至少選一位分攤成員');
  const rec = { type: f.type, date: f.date, title: f.title, cat: f.cat, amount: +f.amount, payer: f.payer, split };
  const t = trip();
  if (f.id) Object.assign(t.money.find(x => x.id === f.id), rec);
  else t.money.push({ id: uid(), ...rec });
  save(); resetMoneyForm(); render();
  navigator.vibrate?.(15);
});

$('#moneyList').addEventListener('click', e => {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  const t = trip();
  if (e.target.matches('.del')) {
    if (!confirm('刪除這筆紀錄？')) return;
    t.money = t.money.filter(x => x.id !== id); save(); render();
  } else if (e.target.matches('.edit')) {
    const r = t.money.find(x => x.id === id), el = $('#moneyForm').elements;
    for (const k of ['type', 'date', 'title', 'cat', 'amount', 'payer', 'id']) el[k].value = r[k];
    renderSplitBox(r.split);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    el.title.focus({ preventScroll: true });
  }
});
$('#moneyFilter').addEventListener('change', renderMoney);

const CAT_ICON = { 餐飲: '🍜', 交通: '🚇', 住宿: '🏨', 門票: '🎟️', 購物: '🛍️', 前置費用: '📝', 其他: '✨' };

function renderMoney() {
  const t = trip(), cat = $('#moneyFilter').value;
  const cats = [...new Set(t.money.map(r => r.cat))];
  $('#moneyFilter').innerHTML = '<option value="">全部分類</option>' +
    cats.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const list = t.money.filter(r => !cat || r.cat === cat).sort((a, b) => b.date.localeCompare(a.date));
  $('#moneyList').innerHTML = list.map(r => `
    <div class="item" data-id="${r.id}">
      <div class="main">
        <div class="title">${CAT_ICON[r.cat] || '✨'} ${esc(r.title)}</div>
        <div class="sub">${fmtDate(r.date)}　${r.type === 'income' ? '收' : '付'}：${esc(memberName(r.payer))}
          ・${r.split.length === t.members.length ? '全員分' : r.split.map(memberName).map(esc).join('、')}</div>
      </div>
      <div class="amt ${r.type}">${r.type === 'income' ? '+' : ''}${money(r.amount)}</div>
      <div class="btns">
        <button class="icon edit" title="編輯">✎</button>
        <button class="icon del" title="刪除">✕</button>
      </div>
    </div>`).join('') || empty('錢包還沒動過～<br>記下第一筆吧！', 'fishcake');
}

// ===== 結算 =====
function computeSettle() {
  const t = trip();
  const P = Object.fromEntries(t.members.map(m => [m.id, { paid: 0, share: 0, recv: 0, recvShare: 0 }]));
  let expense = 0, income = 0;
  for (const r of t.money) {
    const each = r.amount / r.split.length;
    if (r.type === 'income') {
      income += r.amount;
      if (P[r.payer]) P[r.payer].recv += r.amount;
      r.split.forEach(id => P[id] && (P[id].recvShare += each));
    } else {
      expense += r.amount;
      if (P[r.payer]) P[r.payer].paid += r.amount;
      r.split.forEach(id => P[id] && (P[id].share += each));
    }
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
    if (x > 0.004) transfers.push({ from: debtors[i].id, to: creditors[j].id, amt: x });
    debtors[i].amt -= x; creditors[j].amt -= x;
    if (debtors[i].amt < 0.005) i++;
    if (creditors[j].amt < 0.005) j++;
  }
  return { P, expense, income, transfers };
}

function renderSettle() {
  const t = trip(), { P, expense, income, transfers } = computeSettle();
  const net = expense - income, n = t.members.length || 1;
  const days = t.start && t.end ? Math.round((new Date(t.end) - new Date(t.start)) / 864e5) + 1 : 0;
  $('#settleStats').innerHTML = [
    ['💸 總支出', money(expense)], ['💰 收入 / 退款', money(income)], ['🧾 淨花費', money(net)],
    ['👥 平均每人', money(net / n)],
    days ? ['📅 平均每日', money(net / days)] : null,
    t.budget ? ['🎯 預算剩餘', `<span class="${t.budget - net < 0 ? 'neg' : 'pos'}">${money(t.budget - net)}</span>`] : null,
  ].filter(Boolean).map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  $('#personTable').innerHTML = t.members.length ? `<div class="people">${t.members.map(m => {
    const p = P[m.id], b = p.balance;
    const badge = b > 0.004 ? `<span class="badge pos">應收 ${money(b)}</span>`
      : b < -0.004 ? `<span class="badge neg">應付 ${money(-b)}</span>` : `<span class="badge">已平衡 ✓</span>`;
    return `<div class="person">
      <div class="person-head"><span class="person-name">${esc(m.name)}</span>
        <span class="person-net">${money(p.share - p.recvShare)}</span></div>
      <div class="person-rows">
        <span>實際付出<b>${money(p.paid)}</b></span><span>應分攤<b>${money(p.share)}</b></span>
        ${p.recv || p.recvShare ? `<span>代收<b>${money(p.recv)}</b></span><span>應得退款<b>${money(p.recvShare)}</b></span>` : ''}
      </div>
      ${badge}
    </div>`;
  }).join('')}</div>` : empty('請先到「設定」新增成員', 'camera');

  $('#transfers').innerHTML = transfers.map(x =>
    `<div class="item transfer"><div class="main"><b>${esc(memberName(x.from))}</b><span class="arrow">➜</span><b>${esc(memberName(x.to))}</b></div>
     <div class="amt">${money(x.amt)}</div></div>`).join('') || empty('不需要轉帳，大家都打平了 🎉', 'starfish');

  const group = key => {
    const m = {};
    t.money.filter(r => r.type !== 'income').forEach(r => m[r[key]] = (m[r[key]] || 0) + r.amount);
    return Object.entries(m);
  };
  const cats = group('cat').sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map(c => c[1]));
  $('#catTable').innerHTML = cats.length ? `<table><tr><th>分類</th><th>金額</th><th style="width:34%">占比</th></tr>
    ${cats.map(([c, v]) => `<tr><td>${CAT_ICON[c] || '✨'} ${esc(c)}</td><td>${money(v)}</td>
      <td><div class="bar" style="width:${Math.max(8, v / max * 100)}%" title="${(v / expense * 100).toFixed(1)}%"></div>
      <small class="muted">${(v / expense * 100).toFixed(0)}%</small></td></tr>`).join('')}</table>` : '<p class="muted">尚無支出。</p>';

  const byDay = group('date').sort((a, b) => a[0].localeCompare(b[0]));
  $('#dayTable').innerHTML = byDay.length ? `<table><tr><th>日期</th><th>支出</th></tr>
    ${byDay.map(([d, v]) => `<tr><td>${fmtDate(d)}</td><td>${money(v)}</td></tr>`).join('')}</table>` : '<p class="muted">尚無支出。</p>';
}

// ===== 設定 =====
$('#tripForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  Object.assign(trip(), { ...f, budget: +f.budget || 0 });
  save(); render(); flyBanner('已儲存 ✓');
});
$('#memberForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = new FormData(e.target).get('name').trim();
  if (!name) return;
  trip().members.push({ id: uid(), name });
  e.target.reset(); save(); render();
});
$('#memberList').addEventListener('click', e => {
  if (!e.target.matches('.del')) return;
  const id = e.target.closest('[data-id]').dataset.id, t = trip();
  const used = t.money.some(r => r.payer === id || r.split.includes(id));
  if (used && !confirm('此成員已有記帳紀錄，刪除後結算會不正確，確定刪除？')) return;
  t.members = t.members.filter(m => m.id !== id); save(); render();
});
$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(trip(), null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${trip().name}.json` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const t = JSON.parse(await file.text());
    if (!t.members || !t.money) throw 0;
    t.id = uid(); t.prep ||= []; t.plan ||= [];
    db.trips.push(t); db.current = t.id; save(); render(); alert('已匯入為新旅程');
  } catch { alert('檔案格式不正確'); }
  e.target.value = '';
});
$('#deleteTripBtn').addEventListener('click', () => {
  if (!confirm(`確定刪除「${trip().name}」？此動作無法復原。`)) return;
  db.trips = db.trips.filter(t => t.id !== db.current);
  if (!db.trips.length) db.trips.push(newTrip());
  db.current = db.trips[0].id; save(); render();
});

function renderSettings() {
  const t = trip(), el = $('#tripForm').elements;
  for (const k of ['name', 'currency', 'start', 'end', 'budget']) el[k].value = t[k] || '';
  $('#memberList').innerHTML = t.members.map(m =>
    `<span class="chip" data-id="${m.id}">${esc(m.name)}<button class="icon del" title="刪除">✕</button></span>`).join('')
    || '<span class="muted">尚無成員</span>';
}

// ===== 共用渲染 =====
function render() {
  const t = trip();
  $('#tripSelect').innerHTML = db.trips.map(x =>
    `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  $('#tripMeta').textContent = [t.start && t.end ? `${fmtDate(t.start)} → ${fmtDate(t.end)}` : '',
    t.members.length ? `${t.members.length} 人同行` : ''].filter(Boolean).join('　·　');
  $$('.member-select').forEach(s => {
    const v = s.value;
    s.innerHTML = (s.name === 'owner' ? '<option value="">負責人</option>' : '') +
      t.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    if (v) s.value = v;
  });
  if (!$('#moneyForm').elements.id.value) {
    const boxes = $$('#splitBox input');
    renderSplitBox(boxes.length === t.members.length && boxes.length ? boxes.filter(i => i.checked).map(i => i.value) : null);
  }
  renderLive(); renderPrep(); renderPlan(); renderMoney(); renderSettle(); renderSettings();
}

$('#moneyForm').elements.date.value = todayStr();
$('#planForm').elements.date.value = trip().start || todayStr();
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
