const API_URL = '/.netlify/functions/api';
const REFRESH_INTERVAL = 10000;

let allEvents = [], allMines = [];
let currentSubTab = 'open';

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const eventsContainer = document.getElementById('eventsContainer');
const minesContainer = document.getElementById('minesContainer');
const updateInfo = document.getElementById('updateInfo');

/* Particles */
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = Math.max(window.innerHeight, document.documentElement.scrollHeight);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
new ResizeObserver(() => {
    canvas.height = Math.max(window.innerHeight, document.documentElement.scrollHeight);
}).observe(document.documentElement);

class Particle {
    constructor() { this.reset(); }
    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.3;
        this.sx = (Math.random() - 0.5) * 0.2;
        this.sy = (Math.random() - 0.5) * 0.2;
        this.o = Math.random() * 0.4 + 0.05;
    }
    update() {
        this.x += this.sx; this.y += this.sy;
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) this.reset();
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(52, 199, 89, ${this.o})`;
        ctx.fill();
    }
}
const count = Math.min(Math.floor(canvas.width * canvas.height / 10000), 80);
particles = Array.from({ length: count }, () => new Particle());

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) { p.update(); p.draw(); }
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const d = dx * dx + dy * dy;
            if (d < 22500) {
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.strokeStyle = `rgba(52, 199, 89, ${0.04 * (1 - Math.sqrt(d) / 150)})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }
    }
    requestAnimationFrame(animateParticles);
}
animateParticles();

/* Main Tabs */
document.querySelectorAll('.main-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

/* Sub Tabs (Events) */
document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSubTab = btn.dataset.subtab;
        renderEvents();
    });
});

/* Formatting */
function fmtTime(s) {
    if (s == null || s < 0) return '—';
    if (s === 0) return 'сейчас';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}ч ${String(m).padStart(2, '0')}м`;
    if (m > 0) return `${m}м ${String(sec).padStart(2, '0')}с`;
    return `${sec}с`;
}

function timeClass(s) {
    if (s <= 60) return 'red';
    if (s <= 300) return 'yellow';
    return 'green';
}

/* Фильтр по вкладкам */
/* 🎁 Открытые — LOOTING (лут доступен прямо сейчас) */
/* ⚔️ Активные — OPENED / ACTIVATING / RUNNING (ивент идёт, можно лутать) */
/* ⏳ Скоро будут — STARTING / WAITING (скоро начнётся) */
/* CLOSED / FINISHED — не показываем */
function filterEvents(events) {
    const filtered = events.filter(e => e.phase !== 'CLOSED' && e.phase !== 'FINISHED');

    if (currentSubTab === 'open') {
        return filtered.filter(e => e.phase === 'LOOTING');
    }
    if (currentSubTab === 'upcoming') {
        return filtered.filter(e =>
            e.phase === 'STARTING' || e.phase === 'WAITING' ||
            e.phase === '' || e.phase === '—'
        );
    }
    /* active — OPENED / ACTIVATING / RUNNING */
    return filtered.filter(e =>
        e.phase === 'OPENED' || e.phase === 'ACTIVATING' || e.phase === 'RUNNING'
    );
}

/* Сокращение редкости для иконки */
function rarityShort(name) {
    if (!name) return '—';
    const map = { 'легендарный': 'Л', 'легендарная': 'Л', 'элитный': 'Э', 'богатый': 'Б',
        'солидный': 'С', 'мифический': 'М', 'мифическая': 'М', 'эпический': 'Е',
        'эпическая': 'Е', 'редкий': 'Р', 'редкая': 'Р', 'обычная': '—', 'обычный': '—' };
    return map[name.toLowerCase()] || name[0] || '?';
}

/* Sort: по редкости (высшая -> низшая), потом по таймеру */
function sortEvents(events) {
    return events.sort((a, b) => {
        if (b.loot_rarity !== a.loot_rarity) return b.loot_rarity - a.loot_rarity;
        return a.seconds_left - b.seconds_left;
    });
}

/* Render */
function renderEvents() {
    const filtered = sortEvents(filterEvents(allEvents));
    if (!filtered.length) {
        const msgs = { open: '🎁 Нет открытых событий', active: '⚔️ Нет активных событий', upcoming: '⏳ Нет предстоящих событий' };
        eventsContainer.innerHTML = `<div class="no-data">${msgs[currentSubTab]}</div>`;
        return;
    }
    eventsContainer.innerHTML = filtered.map(e => {
        const tc = timeClass(e.seconds_left);
        const hasLoot = e.loot && e.loot !== 'null';
        const lootBadge = hasLoot && e.rarity_name && e.loot.toLowerCase() !== e.rarity_name.toLowerCase()
            ? ` <span class="event-loot" style="color:${e.rarity_color};border-color:${e.rarity_color}">${e.rarity_name}: ${e.loot}</span>`
            : hasLoot
                ? ` <span class="event-loot" style="color:${e.rarity_color};border-color:${e.rarity_color}">${e.loot}</span>`
                : '';
        const iconColor = hasLoot ? e.rarity_color : 'rgba(255,255,255,0.08)';
        const iconText = hasLoot ? rarityShort(e.rarity_name) : '';
        return `<div class="event-card">
            <div class="rarity-icon" style="background:${iconColor}15;color:${iconColor}">${iconText}</div>
            <div class="event-server">${e.server}</div>
            <div><span class="event-name">${e.event_name}</span>${lootBadge}</div>
            <div class="event-time ${tc}">
                <div class="sec">${fmtTime(e.seconds_left)}</div>
                <div class="lbl">${e.phase_display}</div>
            </div>
        </div>`;
    }).join('');
}

function renderMines() {
    if (!allMines.length) {
        minesContainer.innerHTML = '<div class="no-data">⛏️ Нет данных о шахтах</div>';
        return;
    }
    allMines.sort((a, b) => a.reset_seconds - b.reset_seconds);
    minesContainer.innerHTML = allMines.map(m => {
        const tc = timeClass(m.reset_seconds);
        const nextShort = rarityShort(m.next_name);
        return `<div class="mine-card">
            <div class="rarity-icon" style="background:${m.rarity_color}15;color:${m.rarity_color}">${rarityShort(m.rarity_name)}</div>
            <div class="mine-server">${m.server}</div>
            <div>
                <span class="mine-rarity" style="color:${m.rarity_color};border-color:${m.rarity_color}">${m.rarity_name}</span>
                <div class="mine-next">→ ${nextShort} ${m.next_name}</div>
            </div>
            <div class="mine-time ${tc}">
                <div class="sec">${fmtTime(m.reset_seconds)}</div>
                <div class="lbl">до сброса</div>
            </div>
        </div>`;
    }).join('');
}

/* Countdown */
function tick() {
    for (const e of allEvents) { if (e.seconds_left > 0) e.seconds_left--; }
    for (const m of allMines) { if (m.reset_seconds > 0) m.reset_seconds--; }
    renderEvents();
    renderMines();
}

/* Fetch */
async function fetchData() {
    try {
        const res = await fetch(API_URL, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.status === 'ERROR') throw new Error(data.error || 'Unknown error');

        allEvents = data.events || [];
        allMines = data.mines || [];

        statusDot.className = 'status-dot online';
        statusText.textContent = 'Online';
        statusText.style.color = '#34c759';

        const servers = new Set();
        allEvents.forEach(e => servers.add(e.server));
        allMines.forEach(m => servers.add(m.server));
        document.getElementById('serverCount').textContent = `${servers.size} servers · ${allEvents.length} events · ${allMines.length} mines`;

        renderEvents();
        renderMines();
        updateInfo.textContent = `Updated ${new Date().toLocaleTimeString('ru-RU')}`;
    } catch (err) {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Offline';
        statusText.style.color = '#ff3b30';
        if (!allEvents.length) eventsContainer.innerHTML = `<div class="no-data">${err.message}</div>`;
        if (!allMines.length) minesContainer.innerHTML = `<div class="no-data">${err.message}</div>`;
    }
}

fetchData();
setInterval(fetchData, REFRESH_INTERVAL);
setInterval(tick, 1000);
