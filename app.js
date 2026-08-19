/* ===== Настройка ===== */
// Вставь сюда URL веб-приложения (тот же /exec, что у бэкенда), заканчивается на /exec:
const BACKEND = 'https://script.google.com/macros/s/AKfycbw4c-ffoQhKDj61XSClS6IDmWTCGp9S90-_Ips1aiwtQaGF5DG8lW8ScnHewHCDUGcN/exec';

/* ===== Telegram ===== */
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const initData = (tg && tg.initData) || '';

/* ===== Состояние ===== */
let SUMMARY = null;          // {channels, updated_at, channels_count}
let sortKey = 'views_month';
let sortDir = -1;            // -1 по убыванию, 1 по возрастанию

/* ===== Утилиты форматирования ===== */
const nf = new Intl.NumberFormat('ru-RU');
function fmt(n){ return (n===null||n===undefined||n==='') ? '—' : nf.format(Math.round(Number(n))); }
function signed(n){ if(n===null||n===undefined||n==='') return '—';
  const v=Math.round(Number(n)); return (v>0?'+':'')+nf.format(v); }
function pct(n){ if(n===null||n===undefined||n==='') return '—';
  let v=Number(n); if(Math.abs(v)<=1) v*=100; return v.toFixed(1).replace('.',',')+'%'; }
function signedPct(n){ if(n===null||n===undefined||n==='') return '—';
  let v=Number(n); if(Math.abs(v)<=1) v*=100; return (v>0?'+':'')+v.toFixed(1).replace('.',',')+'%'; }
function cls(n){ return (n>0)?'up':(n<0)?'down':'flat'; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// ▲/▼ по изменению позиции (rank_prev -> rank, меньше = выше)
function arrowHtml(c){
  if(c.rank==null||c.rank_prev==null) return '';
  const d=c.rank_prev-c.rank;
  if(d>0) return `<span class="badge up">▲${d}</span>`;
  if(d<0) return `<span class="badge down">▼${-d}</span>`;
  return `<span class="badge flat">＝</span>`;
}

/* ===== Сеть ===== */
async function api(action, params){
  const q = new URLSearchParams(Object.assign({action, initData}, params||{}));
  const res = await fetch(`${BACKEND}?${q.toString()}`, {method:'GET'});
  const json = await res.json();
  if(!json.ok){ throw new Error(json.error||'error'); }
  return json.data;
}

/* ===== Экран: Сводка ===== */
const COLS = [
  {key:'rank',        label:'#',      cell:c=>c.rank==null?'':c.rank},
  {key:'name',        label:'Канал',  cell:c=>nameCell(c)},
  {key:'views_month', label:'Мес',    cell:c=>fmt(c.views_month)},
  {key:'delta_pct',   label:'1м%',    cell:c=>`<span class="${cls(c.delta_pct)}">${signedPct(c.delta_pct)}</span>`},
  {key:'views_1d',    label:'1д',     cell:c=>fmt(c.views_1d)},
  {key:'views_7d',    label:'7д',     cell:c=>fmt(c.views_7d)},
  {key:'followers',   label:'Подп.',  cell:c=>fmt(c.followers)},
  {key:'er',          label:'ER',     cell:c=>pct(c.er)},
];
function nameCell(c){
  const img = c.avatar ? `<img src="${esc(c.avatar)}" loading="lazy" onerror="this.style.visibility='hidden'">` : '';
  return `<div class="name">${img}<span class="nm">${esc(shortName(c))}</span>${arrowHtml(c)}</div>`;
}
function shortName(c){ const n=String(c.name||c.username||''); return n.split(' / ')[0] || n; }

function computeKpis(list){
  const withM = list.filter(c=>c.views_month!=null);
  const total = withM.reduce((s,c)=>s+Number(c.views_month||0),0);
  const leader = withM.slice().sort((a,b)=>b.views_month-a.views_month)[0];
  const byDelta = list.filter(c=>c.delta_pct!=null).slice().sort((a,b)=>b.delta_pct-a.delta_pct);
  const best = byDelta[0], worst = byDelta[byDelta.length-1];
  const rising = list.filter(c=>Number(c.delta_pct)>0).length;
  const falling = list.filter(c=>Number(c.delta_pct)<0).length;
  return {total, leader, best, worst, rising, falling};
}
function renderKpis(list){
  const k = computeKpis(list);
  const card=(label,value,sub,wide)=>`<div class="kpi${wide?' wide':''}">
    <div class="k-label">${esc(label)}</div><div class="k-value">${value}</div>
    ${sub?`<div class="k-sub">${sub}</div>`:''}</div>`;
  document.getElementById('kpis').innerHTML =
    card('Суммарно за месяц', fmt(k.total), 'просмотры всех каналов', true) +
    card('Лидер', esc(k.leader?shortName(k.leader):'—'), k.leader?fmt(k.leader.views_month)+' просмотров':'') +
    card('Рост / падение', `<span class="up">${k.rising}</span> / <span class="down">${k.falling}</span>`, 'каналов') +
    card('Лучший прирост', k.best?`<span class="up">${signedPct(k.best.delta_pct)}</span>`:'—', k.best?esc(shortName(k.best)):'') +
    card('Сильнее всех упал', k.worst?`<span class="down">${signedPct(k.worst.delta_pct)}</span>`:'—', k.worst?esc(shortName(k.worst)):'');
}
function renderGrid(){
  const list = SUMMARY.channels.slice().sort((a,b)=>{
    let av=a[sortKey], bv=b[sortKey];
    if(sortKey==='name'){ av=shortName(a).toLowerCase(); bv=shortName(b).toLowerCase();
      return av<bv?-sortDir:av>bv?sortDir:0; }
    av=Number(av); bv=Number(bv);
    if(isNaN(av)) av=-Infinity; if(isNaN(bv)) bv=-Infinity;
    return (av-bv)*sortDir;
  });
  document.getElementById('grid-head').innerHTML = '<tr>' + COLS.map(col=>{
    const s = col.key===sortKey ? ' sorted'+(sortDir===1?' asc':'') : '';
    return `<th class="${s}" data-key="${col.key}">${esc(col.label)}</th>`;
  }).join('') + '</tr>';
  document.getElementById('grid-body').innerHTML = list.map(c=>
    `<tr data-u="${esc(c.username)}">` + COLS.map(col=>`<td>${col.cell(c)}</td>`).join('') + '</tr>'
  ).join('');

  document.querySelectorAll('#grid-head th').forEach(th=>{
    th.onclick=()=>{ const k=th.dataset.key;
      if(k===sortKey) sortDir=-sortDir; else { sortKey=k; sortDir = (k==='name')?1:-1; }
      renderGrid(); };
  });
  document.querySelectorAll('#grid-body tr').forEach(tr=>{
    tr.onclick=()=>openChannel(tr.dataset.u);
  });
}

/* ===== Экран: Канал ===== */
function fillChannelSelect(selected){
  const sel=document.getElementById('channel-select');
  const list=SUMMARY.channels.slice().sort((a,b)=>shortName(a).localeCompare(shortName(b),'ru'));
  sel.innerHTML = list.map(c=>`<option value="${esc(c.username)}"${c.username===selected?' selected':''}>${esc(shortName(c))}</option>`).join('');
  sel.onchange=()=>renderChannelCard(sel.value);
}
async function openChannel(username){
  fillChannelSelect(username);   // сначала список — иначе switchScreen зациклится
  switchScreen('channel');
  await renderChannelCard(username);
}
async function renderChannelCard(username){
  const c = SUMMARY.channels.find(x=>String(x.username)===String(username));
  const box=document.getElementById('channel-card');
  if(!c){ box.innerHTML='<div class="state">Канал не найден</div>'; return; }
  const metric=(l,v)=>`<div class="metric"><div class="m-l">${esc(l)}</div><div class="m-v">${v}</div></div>`;
  box.innerHTML =
    `<div class="card-head">
       ${c.avatar?`<img src="${esc(c.avatar)}" onerror="this.style.visibility='hidden'">`:''}
       <div><div class="h-name">${esc(shortName(c))} ${arrowHtml(c)}</div>
       <div class="h-sub">@${esc(c.username)} · место ${c.rank==null?'—':c.rank}</div></div>
     </div>
     <div class="metrics">
       ${metric('Просмотры за месяц', fmt(c.views_month))}
       ${metric('Δ к прошлому', `<span class="${cls(c.delta_abs)}">${signed(c.delta_abs)}</span> <span class="${cls(c.delta_pct)}">${signedPct(c.delta_pct)}</span>`)}
       ${metric('За 1 день', fmt(c.views_1d))}
       ${metric('За 7 дней', fmt(c.views_7d))}
       ${metric('Подписчики', fmt(c.followers))}
       ${metric('Прирост подп. (мес)', `<span class="${cls(c.growth_mtd)}">${signed(c.growth_mtd)}</span>`)}
       ${metric('Видео за месяц', fmt(c.videos_month))}
       ${metric('ER', pct(c.er))}
     </div>
     <div class="chart-box"><div class="c-title">Просмотры за 30 дней</div>
       <div id="chart">Загрузка графика…</div>
       <div class="chart-labels" id="chart-labels"></div></div>`;
  try{
    const s = await api('series', {channel: username});
    drawChart(s.points||[]);
  }catch(e){ document.getElementById('chart').textContent='График недоступен'; }
}
function drawChart(points){
  const host=document.getElementById('chart'), lab=document.getElementById('chart-labels');
  if(!points || points.length<2){ host.textContent='Недостаточно данных'; lab.innerHTML=''; return; }
  const W=320,H=120,P=6;
  const vals=points.map(p=>Number(p.v));
  const min=Math.min(...vals), max=Math.max(...vals), range=(max-min)||1, n=points.length;
  const X=i=>P+(i/(n-1))*(W-2*P);
  const Y=v=>P+(1-(v-min)/range)*(H-2*P);
  let d=''; points.forEach((p,i)=>{ d+=(i?'L':'M')+X(i).toFixed(1)+' '+Y(p.v).toFixed(1)+' '; });
  const area=d+`L${X(n-1).toFixed(1)} ${H-P} L${X(0).toFixed(1)} ${H-P} Z`;
  const up = vals[n-1] >= vals[0];
  const color = up ? 'var(--up)' : 'var(--down)';
  host.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
       <path d="${area}" fill="${color}" fill-opacity="0.18"/>
       <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
     </svg>`;
  const fmtD=t=>{ const dt=new Date(Number(t)); return isNaN(dt)?'':dt.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'}); };
  lab.innerHTML=`<span>${fmtD(points[0].t)}</span><span>${fmtD(points[n-1].t)}</span>`;
}

/* ===== Экран: События ===== */
async function renderFeed(){
  const box=document.getElementById('feed-list');
  box.innerHTML='<div class="state">Загрузка…</div>';
  try{
    const f=await api('feed');
    const items=(f.items||[]);
    if(!items.length){ box.innerHTML='<div class="state">Событий пока нет.</div>'; return; }
    box.innerHTML=items.map(it=>`<div class="feed-item"><div class="f-text">${esc(it.text)}</div></div>`).join('');
  }catch(e){ box.innerHTML='<div class="state">Лента недоступна.</div>'; }
}

/* ===== Навигация ===== */
function switchScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
  document.getElementById('screen-'+name).classList.remove('hidden');
  document.querySelectorAll('.tabbar .tab').forEach(t=>t.classList.toggle('active', t.dataset.screen===name));
  if(name==='feed') renderFeed();
  if(name==='channel' && !document.getElementById('channel-select').options.length && SUMMARY){
    const first=SUMMARY.channels[0]; if(first) openChannel(first.username);
  }
}
document.querySelectorAll('.tabbar .tab').forEach(t=>{
  t.onclick=()=>switchScreen(t.dataset.screen);
});

/* ===== Старт ===== */
async function boot(){
  const state=document.getElementById('state');
  try{
    SUMMARY = await api('summary');
    document.getElementById('fresh').textContent = SUMMARY.updated_at ? ('обн. '+SUMMARY.updated_at) : '';
    renderKpis(SUMMARY.channels);
    renderGrid();
    state.textContent='';
  }catch(e){
    const id = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) || '—';
    if(String(e.message)==='unauthorized'){
      state.innerHTML = `Нет доступа. Твой Telegram ID: <code>${esc(id)}</code><br>Передай его администратору для добавления в лист ДОСТУП.`;
    }else{
      state.textContent = 'Ошибка загрузки: '+e.message;
    }
  }
}
boot();
