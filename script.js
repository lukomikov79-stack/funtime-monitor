const API_URL = '/.netlify/functions/api';
const REFRESH_INTERVAL = 10000;

let allEvents = [], allMines = [];
let currentSubTab = 'open';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const eventsContainer = $('#eventsContainer');
const minesContainer = $('#minesContainer');
const updateInfo = $('#updateInfo');

/* ---- Particles ---- */
const canvas = $('#particles');
const ctx = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = Math.max(window.innerHeight, document.documentElement.scrollHeight);
}
resize();
window.addEventListener('resize', resize);
new ResizeObserver(() => {
    canvas.height = Math.max(window.innerHeight, document.documentElement.scrollHeight);
}).observe(document.documentElement);

class P {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.s = Math.random() * 2 + 0.3;
        this.sx = (Math.random() - 0.5) * 0.2;
        this.sy = (Math.random() - 0.5) * 0.2;
        this.o = Math.random() * 0.4 + 0.05;
    }
    update() {
        this.x += this.sx; this.y += this.sy;
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
        }
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(52,199,89,${this.o})`;
        ctx.fill();
    }
}
const pts = Array.from({ length: Math.min(Math.floor(canvas.width * canvas.height / 10000), 80) }, () => new P());

(function anim() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pts) { p.update(); p.draw(); }
    for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
            const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = dx * dx + dy * dy;
            if (d < 22500) {
                ctx.beginPath();
                ctx.moveTo(pts[i].x, pts[i].y);
                ctx.lineTo(pts[j].x, pts[j].y);
                ctx.strokeStyle = `rgba(52,199,89,${0.04 * (1 - Math.sqrt(d) / 150)})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }
    }
    requestAnimationFrame(anim);
})();

/* ---- Tab switching ---- */
function switchTab(name) {
    $$('.main-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
}

document.getElementById('btnEvents').onclick = () => switchTab('events');
document.getElementById('btnMines').onclick = () => switchTab('mines');

$$('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSubTab = btn.dataset.subtab;
        renderEvents();
    });
});

/* ---- Formatting ---- */
function fmt(s, phase) {
    if (s == null || s < 0) return '—';
    if (s === 0) {
        if (phase === 'LOOTING') return 'сейчас';
        return '—';
    }
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return `${h}ч ${String(m).padStart(2,'0')}м`;
    if (m > 0) return `${m}м ${String(sec).padStart(2,'0')}с`;
    return `${sec}с`;
}

function tc(s) {
    if (s <= 60) return 'red';
    if (s <= 300) return 'yellow';
    return 'green';
}

function short(name) {
    if (!name) return '—';
    const m = {'легендарный':'Л','легендарная':'Л','элитный':'Э','богатый':'Б','солидный':'С',
        'мифический':'М','мифическая':'М','эпический':'Е','эпическая':'Е','редкий':'Р','редкая':'Р',
        'обычная':'—','обычный':'—'};
    return m[name.toLowerCase()] || name[0] || '?';
}

/* ---- Event icons by type ---- */
function eventIcon(e) {
    const map = {
        'vulkan': { c: '#ff6b35', l: 'V' },
        'airdrop': { c: '#ffd60a', l: 'A' },
        'myst_beacon': { c: '#7b2ff7', l: 'M' },
        'beacon': { c: '#7b2ff7', l: 'B' },
        'hellm': { c: '#ff3b30', l: 'H' },
        'deathchest': { c: '#8e8e93', l: 'D' },
        'meteor_rain': { c: '#ff9500', l: '☄' },
        'altarundead': { c: '#5e5ce6', l: 'A' },
        'epic_mob': { c: '#ff375f', l: 'E' },
        'raid': { c: '#ff6482', l: 'R' }
    };
    const m = map[e.event_id];
    if (m) return { c: m.c, l: m.l };
    if (e.event_type === 'user') return { c: '#34c759', l: 'U' };
    return { c: 'rgba(255,255,255,0.1)', l: '?' };
}

/* ---- Filter events ---- */
function filterEvents(events) {
    const f = events.filter(e => e.phase !== 'CLOSED' && e.phase !== 'FINISHED');
    if (currentSubTab === 'open') return f.filter(e => e.phase === 'LOOTING');
    if (currentSubTab === 'upcoming') return f.filter(e =>
        e.phase === 'STARTING' || e.phase === 'WAITING' || e.phase === '' || e.phase === '—');
    return f.filter(e => e.phase === 'OPENED' || e.phase === 'ACTIVATING' || e.phase === 'RUNNING');
}

/* ---- Sort events by rarity then time ---- */
function sortEvents(evs) {
    return evs.sort((a, b) => b.loot_rarity - a.loot_rarity || a.seconds_left - b.seconds_left);
}

/* ---- Sort mines by rarity then time ---- */
function sortMines(ms) {
    return ms.sort((a, b) => b.rarity_value - a.rarity_value || a.reset_seconds - b.reset_seconds);
}

/* ---- Render events ---- */
function renderEvents() {
    const filtered = sortEvents(filterEvents(allEvents));
    if (!filtered.length) {
        const msgs = { open: 'Нет открытых событий', active: 'Нет активных событий', upcoming: 'Нет предстоящих событий' };
        eventsContainer.innerHTML = `<div class="no-data">${msgs[currentSubTab]}</div>`;
        return;
    }
    eventsContainer.innerHTML = filtered.map(e => {
        const t = tc(e.seconds_left);
        const has = e.loot && e.loot !== 'null';
        const badge = has && e.rarity_name && e.loot.toLowerCase() !== e.rarity_name.toLowerCase()
            ? ` <span class="event-loot" style="color:${e.rarity_color};border-color:${e.rarity_color}">${e.rarity_name}: ${e.loot}</span>`
            : has ? ` <span class="event-loot" style="color:${e.rarity_color};border-color:${e.rarity_color}">${e.loot}</span>` : '';
        const ic = eventIcon(e);
        return `<div class="event-card">
            <div class="rarity-icon" style="background:${ic.c}18;color:${ic.c}">${ic.l}</div>
            <div class="event-server">${e.server}</div>
            <div><span class="event-name">${e.event_name}</span>${badge}</div>
            <div class="event-time ${t}">
                <div class="sec">${fmt(e.seconds_left, e.phase)}</div>
                <div class="lbl">${e.phase_display}</div>
            </div>
        </div>`;
    }).join('');
}

/* ---- Render mines ---- */
function renderMines() {
    if (!allMines.length) {
        minesContainer.innerHTML = '<div class="no-data">Нет данных о шахтах</div>';
        return;
    }
    minesContainer.innerHTML = sortMines(allMines).map(m => {
        const t = tc(m.reset_seconds);
        const next = short(m.next_name);
        return `<div class="mine-card">
            <div class="rarity-icon" style="background:${m.rarity_color}18;color:${m.rarity_color}">${short(m.rarity_name)}</div>
            <div class="mine-server">${m.server}</div>
            <div>
                <span class="mine-rarity" style="color:${m.rarity_color};border-color:${m.rarity_color}">${m.rarity_name}</span>
                <div class="mine-next">→ ${next} ${m.next_name}</div>
            </div>
            <div class="mine-time ${t}">
                <div class="sec">${fmt(m.reset_seconds, '')}</div>
                <div class="lbl">до сброса</div>
            </div>
        </div>`;
    }).join('');
}

/* ---- Tick (только время, без перерисовки) ---- */
function tick() {
    for (const e of allEvents) if (e.seconds_left > 0) e.seconds_left--;
    for (const m of allMines) if (m.reset_seconds > 0) m.reset_seconds--;

    document.querySelectorAll('.event-card .sec').forEach((el, i) => {
        if (allEvents[i]) el.textContent = fmt(allEvents[i].seconds_left, allEvents[i].phase);
    });
    document.querySelectorAll('.mine-card .sec').forEach((el, i) => {
        if (allMines[i]) el.textContent = fmt(allMines[i].reset_seconds, '');
    });
}

/* ---- Fetch (с сохранением скролла) ---- */
async function fetchData() {
    try {
        const res = await fetch(API_URL, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (d.status === 'ERROR') throw new Error(d.error || 'Unknown');

        const newEvents = d.events || [];
        const newMines = d.mines || [];

        const same = JSON.stringify(newEvents) === JSON.stringify(allEvents)
                  && JSON.stringify(newMines) === JSON.stringify(allMines);

        allEvents = newEvents;
        allMines = newMines;

        const sd = $('#statusDot'), st = $('#statusText'), sc = $('#serverCount');
        sd.className = 'status-dot online';
        st.textContent = 'Online';
        st.style.color = '#34c759';

        const sv = new Set();
        allEvents.forEach(e => sv.add(e.server));
        allMines.forEach(m => sv.add(m.server));
        sc.textContent = `${sv.size} серверов · ${allEvents.length} событий · ${allMines.length} шахт`;
        updateInfo.textContent = `Обновлено ${new Date().toLocaleTimeString('ru-RU')}`;

        if (!same) {
            renderEvents();
            renderMines();
        }
    } catch (err) {
        const sd = $('#statusDot'), st = $('#statusText');
        sd.className = 'status-dot';
        st.textContent = 'Offline';
        st.style.color = '#ff3b30';
        if (!allEvents.length) eventsContainer.innerHTML = `<div class="no-data">${err.message}</div>`;
        if (!allMines.length) minesContainer.innerHTML = `<div class="no-data">${err.message}</div>`;
    }
}

fetchData();
setInterval(fetchData, REFRESH_INTERVAL);
setInterval(tick, 1000);
