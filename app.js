// ===== 資料層 =====
const KEY = 'travel-log-v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEK = '日一二三四五六';

function newTrip(name = '我的旅程') {
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

// ===== 分頁 =====
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + b.dataset.tab));
  render();
});

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
  e.target.text.value = ''; save(); render();
});
$('#prepList').addEventListener('click', e => {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  const t = trip();
  if (e.target.matches('input[type=checkbox]')) {
    const p = t.prep.find(x => x.id === id); p.done = e.target.checked;
  } else if (e.target.matches('.del')) {
    t.prep = t.prep.filter(x => x.id !== id);
  } else return;
  save(); render();
});

function renderPrep() {
  const list = trip().prep;
  const done = list.filter(p => p.done).length;
  $('#prepBar').style.width = list.length ? (done / list.length * 100) + '%' : '0';
  $('#prepStat').textContent = `已完成 ${done} / ${list.length}`;
  const today = todayStr();
  const sorted = [...list].sort((a, b) => a.done - b.done || (a.due || '9').localeCompare(b.due || '9'));
  $('#prepList').innerHTML = sorted.map(p => `
    <div class="item ${p.done ? 'done' : ''}" data-id="${p.id}">
      <input type="checkbox" ${p.done ? 'checked' : ''}>
      <div class="main">
        <div class="title">${esc(p.text)}</div>
        <div class="sub"><span class="tag">${esc(p.cat)}</span>
          ${p.owner ? '負責：' + esc(memberName(p.owner)) : ''}
          ${p.due ? `<span class="${!p.done && p.due < today ? 'overdue' : ''}">　期限 ${fmtDate(p.due)}</span>` : ''}
        </div>
      </div>
      <button class="icon del" title="刪除">✕</button>
    </div>`).join('') || '<p class="muted">還沒有待辦事項。</p>';
}

// ===== 行程 =====
$('#planForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const t = trip();
  if (f.id) Object.assign(t.plan.find(x => x.id === f.id), f);
  else t.plan.push({ ...f, id: uid() });
  const keepDate = f.date;
  e.target.reset(); e.target.date.value = keepDate; e.target.id.value = '';
  save(); render();
});
$('#planList').addEventListener('click', e => {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  const t = trip();
  if (e.target.matches('.del')) {
    if (!confirm('刪除這個行程？')) return;
    t.plan = t.plan.filter(x => x.id !== id); save(); render();
  } else if (e.target.matches('.edit')) {
    const p = t.plan.find(x => x.id === id), f = $('#planForm');
    for (const k of ['date', 'start', 'end', 'title', 'place', 'note', 'id']) f[k].value = p[k] || '';
    f.title.focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

const sortedPlan = () => [...trip().plan].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
const mapLink = place => place
  ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}" target="_blank" rel="noopener">📍${esc(place)}</a>` : '';

function planItem(p, cls = '') {
  return `<div class="item ${cls}" data-id="${p.id}">
    <div class="time">${esc(p.start)}${p.end ? '–' + esc(p.end) : ''}</div>
    <div class="main">
      <div class="title">${esc(p.title)}</div>
      <div class="sub">${mapLink(p.place)} ${p.note ? '　' + esc(p.note) : ''}</div>
    </div>
    <button class="icon edit" title="編輯">✎</button>
    <button class="icon del" title="刪除">✕</button>
  </div>`;
}

function renderPlan() {
  const byDay = {};
  sortedPlan().forEach(p => (byDay[p.date] ||= []).push(p));
  const days = Object.keys(byDay);
  const start = trip().start;
  $('#planList').innerHTML = days.map(d => {
    const n = start ? Math.round((new Date(d) - new Date(start)) / 864e5) + 1 : null;
    return `<div class="day-head"><span>${n > 0 ? `Day ${n}　` : ''}${fmtDate(d)}</span>
      <span class="muted">${byDay[d].length} 個行程</span></div>` + byDay[d].map(p => planItem(p)).join('');
  }).join('') || '<p class="muted">還沒有行程，從上方新增。</p>';
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
  const target = new Date(`${p.date}T${p.start}`);
  let m = Math.round((target - now) / 6e4);
  if (m < 0) return '';
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60); m -= h * 60;
  return [d && `${d} 天`, h && `${h} 小時`, `${m} 分`].filter(Boolean).join(' ') + '後';
}

function renderLive() {
  const now = new Date(), t = trip();
  $('#clock').textContent = `現在 ${fmtDate(todayStr(now))} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const { todays, current, next, nowMin, endOf } = liveState(now);
  let html = '';
  if (t.start && todayStr(now) < t.start) {
    const d = Math.ceil((new Date(t.start + 'T00:00') - now) / 864e5);
    html += `<div class="live-card"><div class="label">距離出發</div><div class="big">還有 ${d} 天</div>
      <div class="muted">前置作業完成 ${t.prep.filter(p => p.done).length} / ${t.prep.length}</div></div>`;
  }
  if (current) {
    const total = endOf(current, todays.indexOf(current)) - toMin(current.start);
    const pct = Math.min(100, (nowMin - toMin(current.start)) / total * 100);
    html += `<div class="live-card now"><div class="label">🟢 正在進行</div>
      <div class="big">${esc(current.title)}</div>
      <div class="muted">${esc(current.start)}${current.end ? '–' + esc(current.end) : ''}　${mapLink(current.place)}</div>
      ${current.note ? `<div>${esc(current.note)}</div>` : ''}
      <div class="progress" style="margin-top:10px"><div style="width:${pct}%"></div></div></div>`;
  }
  if (next) {
    html += `<div class="live-card"><div class="label">⏭ 下一個行程</div>
      <div class="big">${esc(next.title)}</div>
      <div class="muted">${fmtDate(next.date)} ${esc(next.start)}　${mapLink(next.place)}</div>
      <div class="countdown">${countdown(next, now)}</div></div>`;
  }
  if (!current && !next && !html) html = '<div class="live-card"><div class="muted">目前沒有進行中或即將到來的行程。</div></div>';
  $('#liveBox').innerHTML = html;

  $('#todayList').innerHTML = todays.map((p, i) => {
    const cls = p === current ? 'now' : endOf(p, i) <= nowMin ? 'past' : '';
    return planItem(p, cls);
  }).join('') || '<p class="muted">今天沒有排行程。</p>';
}
$('#todayList').addEventListener('click', e => {
  if (e.target.matches('.edit')) { $('[data-tab=plan]').click(); setTimeout(() => $('#planList [data-id="' + e.target.closest('[data-id]').dataset.id + '"] .edit')?.click()); }
  if (e.target.matches('.del')) { const id = e.target.closest('[data-id]').dataset.id; if (confirm('刪除這個行程？')) { trip().plan = trip().plan.filter(x => x.id !== id); save(); render(); } }
});
setInterval(() => { if ($('#tab-live').classList.contains('active')) renderLive(); }, 30000);

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
  const f = $('#moneyForm'); f.reset(); f.id.value = ''; f.date.value = todayStr(); renderSplitBox();
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
});

$('#moneyList').addEventListener('click', e => {
  const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
  const t = trip();
  if (e.target.matches('.del')) {
    if (!confirm('刪除這筆紀錄？')) return;
    t.money = t.money.filter(x => x.id !== id); save(); render();
  } else if (e.target.matches('.edit')) {
    const r = t.money.find(x => x.id === id), f = $('#moneyForm');
    for (const k of ['type', 'date', 'title', 'cat', 'amount', 'payer', 'id']) f[k].value = r[k];
    renderSplitBox(r.split); f.title.focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});
$('#moneyFilter').addEventListener('change', renderMoney);

function renderMoney() {
  const t = trip(), cat = $('#moneyFilter').value;
  const cats = [...new Set(t.money.map(r => r.cat))];
  $('#moneyFilter').innerHTML = '<option value="">全部分類</option>' + cats.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const list = t.money.filter(r => !cat || r.cat === cat).sort((a, b) => b.date.localeCompare(a.date));
  $('#moneyList').innerHTML = list.map(r => `
    <div class="item" data-id="${r.id}">
      <div class="main">
        <div class="title"><span class="tag">${esc(r.cat)}</span>${esc(r.title)}</div>
        <div class="sub">${fmtDate(r.date)}　${r.type === 'income' ? '收款' : '付款'}：${esc(memberName(r.payer))}
          　分攤：${r.split.length === t.members.length ? '全員' : r.split.map(memberName).map(esc).join('、')}</div>
      </div>
      <div class="amt ${r.type}">${r.type === 'income' ? '+' : ''}${money(r.amount)}</div>
      <button class="icon edit" title="編輯">✎</button>
      <button class="icon del" title="刪除">✕</button>
    </div>`).join('') || '<p class="muted">還沒有收支紀錄。</p>';
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

  // 最少轉帳次數（貪婪配對）
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
    ['總支出', money(expense)], ['收入 / 退款', money(income)], ['淨花費', money(net)],
    ['平均每人', money(net / n)],
    days ? ['平均每日', money(net / days)] : null,
    t.budget ? ['預算剩餘', `<span class="${t.budget - net < 0 ? 'neg' : 'pos'}">${money(t.budget - net)}</span>`] : null,
  ].filter(Boolean).map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  $('#personTable').innerHTML = t.members.length ? `<div class="table-wrap"><table>
    <tr><th>成員</th><th>實際付出</th><th>應分攤</th><th>代收</th><th>應得退款</th><th>個人淨花費</th><th>結算</th></tr>
    ${t.members.map(m => { const p = P[m.id]; return `<tr>
      <td>${esc(m.name)}</td><td>${money(p.paid)}</td><td>${money(p.share)}</td>
      <td>${money(p.recv)}</td><td>${money(p.recvShare)}</td><td><b>${money(p.share - p.recvShare)}</b></td>
      <td class="${p.balance > 0.004 ? 'pos' : p.balance < -0.004 ? 'neg' : ''}">
        ${p.balance > 0.004 ? '應收 ' + money(p.balance) : p.balance < -0.004 ? '應付 ' + money(-p.balance) : '已平衡'}</td></tr>`; }).join('')}
  </table></div>` : '<p class="muted">請先新增成員。</p>';

  $('#transfers').innerHTML = transfers.map(x =>
    `<div class="item"><div class="main"><b>${esc(memberName(x.from))}</b> → <b>${esc(memberName(x.to))}</b></div>
     <div class="amt">${money(x.amt)}</div></div>`).join('') || '<p class="muted">不需要轉帳 🎉</p>';

  const group = key => {
    const m = {};
    t.money.filter(r => r.type !== 'income').forEach(r => m[r[key]] = (m[r[key]] || 0) + r.amount);
    return Object.entries(m);
  };
  const cats = group('cat').sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map(c => c[1]));
  $('#catTable').innerHTML = cats.length ? `<table><tr><th>分類</th><th>金額</th><th>占比</th><th style="width:30%"></th></tr>
    ${cats.map(([c, v]) => `<tr><td>${esc(c)}</td><td>${money(v)}</td><td>${(v / expense * 100).toFixed(1)}%</td>
      <td><div class="bar" style="width:${v / max * 100}%"></div></td></tr>`).join('')}</table>` : '<p class="muted">尚無支出。</p>';

  const days2 = group('date').sort((a, b) => a[0].localeCompare(b[0]));
  $('#dayTable').innerHTML = days2.length ? `<table><tr><th>日期</th><th>支出</th></tr>
    ${days2.map(([d, v]) => `<tr><td>${fmtDate(d)}</td><td>${money(v)}</td></tr>`).join('')}</table>` : '<p class="muted">尚無支出。</p>';
}

// ===== 設定 =====
$('#tripForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  Object.assign(trip(), { ...f, budget: +f.budget || 0 });
  save(); render(); alert('已儲存');
});
$('#memberForm').addEventListener('submit', e => {
  e.preventDefault();
  trip().members.push({ id: uid(), name: e.target.name.value.trim() });
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
  a.click(); URL.revokeObjectURL(a.href);
});
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const t = JSON.parse(await file.text());
    if (!t.members || !t.money) throw 0;
    t.id = uid(); db.trips.push(t); db.current = t.id; save(); render(); alert('已匯入為新旅程');
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
  const t = trip(), f = $('#tripForm');
  for (const k of ['name', 'currency', 'start', 'end', 'budget']) f[k].value = t[k] || '';
  $('#memberList').innerHTML = t.members.map(m =>
    `<span class="chip" data-id="${m.id}">${esc(m.name)}<button class="icon del" title="刪除">✕</button></span>`).join('')
    || '<span class="muted">尚無成員</span>';
}

// ===== 共用渲染 =====
function render() {
  const t = trip();
  $('#tripSelect').innerHTML = db.trips.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  $('#tripMeta').textContent = [t.start && t.end ? `${fmtDate(t.start)} → ${fmtDate(t.end)}` : '', t.members.length ? `${t.members.length} 人` : ''].filter(Boolean).join('　·　');
  $$('.member-select').forEach(s => {
    const v = s.value;
    s.innerHTML = (s.name === 'owner' ? '<option value="">負責人</option>' : '') +
      t.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    if (v) s.value = v;
  });
  if (!$('#moneyForm').id.value) renderSplitBox($$('#splitBox input').length === t.members.length ? $$('#splitBox input:checked').map(i => i.value) : null);
  renderLive(); renderPrep(); renderPlan(); renderMoney(); renderSettle(); renderSettings();
}

$('#moneyForm').date.value = todayStr();
$('#planForm').date.value = trip().start || todayStr();
render();
