const API_URL = '/.netlify/functions/api';
const REFRESH_INTERVAL = 10000;

let events = [], mines = [];

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
const ro = new ResizeObserver(() => {
    canvas.height = Math.max(window.innerHeight, document.documentElement.scrollHeight);
});
ro.observe(document.documentElement);

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
        ctx.fillStyle = `rgba(108, 65, 255, ${this.o})`;
        ctx.fill();
    }
}

function initParticles() {
    const count = Math.min(Math.floor(canvas.width * canvas.height / 10000), 80);
    particles = Array.from({ length: count }, () => new Particle());
}
initParticles();

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
                ctx.strokeStyle = `rgba(108, 65, 255, ${0.04 * (1 - Math.sqrt(d) / 150)})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }
    }
    requestAnimationFrame(animateParticles);
}
animateParticles();

/* Tabs */
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
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

/* Render */
function renderEvents() {
    if (!events.length) {
        eventsContainer.innerHTML = '<div class="no-data">✨ Нет активных событий</div>';
        return;
    }
    eventsContainer.innerHTML = events.map(e => {
        const tc = timeClass(e.seconds_left);
        const loot = e.loot && e.rarity_name && e.loot.toLowerCase() !== e.rarity_name.toLowerCase()
            ? ` <span class="event-loot" style="color:${e.rarity_color};border-color:${e.rarity_color}">${e.rarity_name}: ${e.loot}</span>`
            : e.loot
                ? ` <span class="event-loot" style="color:${e.rarity_color};border-color:${e.rarity_color}">${e.loot}</span>`
                : '';
        return `<div class="event-card" style="border-left-color:${e.rarity_color}">
            <div class="rarity-icon">${e.rarity_emoji}</div>
            <div class="event-server">${e.server}</div>
            <div><span class="event-name">${e.event_name}</span>${loot}</div>
            <div class="event-time ${tc}">
                <div class="seconds">${fmtTime(e.seconds_left)}</div>
                <div class="timer">${e.phase_display}</div>
            </div>
        </div>`;
    }).join('');
}

function renderMines() {
    if (!mines.length) {
        minesContainer.innerHTML = '<div class="no-data">⛏️ Нет данных о шахтах</div>';
        return;
    }
    minesContainer.innerHTML = mines.map(m => {
        const tc = timeClass(m.reset_seconds);
        return `<div class="mine-card" style="border-left:3px solid ${m.rarity_color}">
            <div class="rarity-icon">${m.rarity_emoji}</div>
            <div class="mine-server">${m.server}</div>
            <div>
                <span class="mine-rarity" style="color:${m.rarity_color};border-color:${m.rarity_color}">${m.rarity_name}</span>
                <div class="mine-next">Следующая: ${m.next_emoji} ${m.next_name}</div>
            </div>
            <div class="mine-time ${tc}">
                <div class="seconds">${fmtTime(m.reset_seconds)}</div>
                <div class="timer">до сброса</div>
            </div>
        </div>`;
    }).join('');
}

/* Countdown */
function tick() {
    for (const e of events) { if (e.seconds_left > 0) e.seconds_left--; }
    for (const m of mines) { if (m.reset_seconds > 0) m.reset_seconds--; }
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

        events = data.events || [];
        mines = data.mines || [];

        statusDot.className = 'status-dot online';
        statusText.textContent = 'Онлайн';
        statusText.style.color = '#00e676';

        renderEvents();
        renderMines();
        updateInfo.textContent = `Обновлено: ${new Date().toLocaleTimeString('ru-RU')} · событий: ${events.length} · шахт: ${mines.length}`;
    } catch (err) {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Ошибка';
        statusText.style.color = '#ff1744';
        if (!events.length) eventsContainer.innerHTML = `<div class="no-data">⚠️ ${err.message}</div>`;
        if (!mines.length) minesContainer.innerHTML = `<div class="no-data">⚠️ ${err.message}</div>`;
    }
}

fetchData();
setInterval(fetchData, REFRESH_INTERVAL);
setInterval(tick, 1000);
