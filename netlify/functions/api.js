const API_BASE = 'https://api.funtime.su/method';
const API_KEY = process.env.API_KEY || '';
const BATCH_SIZE = 30;
const FETCH_TIMEOUT = 8000;

const SERVERS = [];
for (let i = 100; i <= 180; i++) SERVERS.push(`anarchy${i}`);
for (let i = 200; i <= 280; i++) SERVERS.push(`anarchy${i}`);
for (let i = 300; i <= 380; i++) SERVERS.push(`anarchy${i}`);
for (let i = 500; i <= 550; i++) SERVERS.push(`anarchy${i}`);
for (let i = 900; i <= 950; i++) SERVERS.push(`anarchy${i}`);

function chunk(arr, size) {
    const r = [];
    for (let i = 0; i < arr.length; i += size) r.push(arr.slice(i, i + size));
    return r;
}

async function fetchWithTimeout(url, opts, ms) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
        const res = await fetch(url, { ...opts, signal: ctrl.signal });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(id);
    }
}

async function fetchEndpoint(endpoint, paramName, batchParam) {
    const allData = {};
    const results = await Promise.all(
        chunk(SERVERS, BATCH_SIZE).map(batch => {
            const params = new URLSearchParams();
            if (batchParam === 'server-type') {
                params.set('event-type', 'all');
                params.set(batchParam, batch.join(','));
            } else {
                params.set(batchParam, batch.join(','));
            }
            return fetchWithTimeout(
                `${API_BASE}/${endpoint}?${params}`,
                { headers: { 'authorization-token': API_KEY, 'Accept': 'application/json' } },
                FETCH_TIMEOUT
            );
        })
    );

    for (const json of results) {
        if (!json) continue;
        if (endpoint === 'events-info' && json.response) {
            for (const item of json.response) {
                allData[item.server] = item.events || [];
            }
        }
        if (endpoint === 'mines-info' && json.servers) {
            for (const [server, mines] of Object.entries(json.servers)) {
                allData[server] = allData[server] || [];
                allData[server].push(...mines);
            }
        }
    }
    return allData;
}

const RARITY = {
    default: { c: '#808080', e: '⚪', n: 'Обычная', v: 0 },
    rare: { c: '#00ff00', e: '🟢', n: 'Редкая', v: 1 },
    epic: { c: '#0088ff', e: '🔵', n: 'Эпическая', v: 2 },
    mythical: { c: '#ff0000', e: '🔴', n: 'Мифическая', v: 3 },
    legendary: { c: '#ff8800', e: '🟠', n: 'Легендарная', v: 4 },
    elite: { c: '#aa00ff', e: '🟣', n: 'Элитный', v: 5 }
};

function rar(r) { return RARITY[r] || RARITY.default; }

function lootRarity(loot) {
    if (!loot || loot === 'null') return RARITY.default;
    const l = loot.toLowerCase();
    if (l.includes('элит') || l.includes('elite')) return RARITY.elite;
    if (l.includes('мифич') || l.includes('mythic')) return RARITY.mythical;
    if (l.includes('легенд') || l.includes('legend')) return RARITY.legendary;
    if (l.includes('эпик') || l.includes('epic')) return RARITY.epic;
    if (l.includes('редк') || l.includes('rare')) return RARITY.rare;
    return { c: '#888', e: '⚪', n: loot, v: 0 };
}

const PHASES = {
    waiting: 'Ожидание', activating: 'Активация', starting: 'Запуск',
    active: 'Активна', running: 'Запущено', looting: 'Сбор лута',
    closed: 'Закрыто', ending: 'Завершается', finished: 'Завершено'
};
function phaseInfo(p) {
    if (!p) return '—';
    return PHASES[p.toLowerCase()] || p;
}

const EVENT_NAMES = {
    vulkan: 'Вулкан', airdrop: 'Airdrop', myst_beacon: 'Мистический маяк',
    mystery_beacon: 'Мистический маяк', hellm: 'HELLM', deathchest: 'Сундук смерти',
    meteor_rain: 'Метеоритный дождь', altarundead: 'Алтарь нежити',
    epic_mob: 'Эпический моб', raid: 'Рейд'
};

exports.handler = async () => {
    if (!API_KEY) {
        return { statusCode: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ events: [], mines: [], status: 'ERROR', error: 'API_KEY not configured' }) };
    }

    try {
        const [eventsData, minesData] = await Promise.all([
            fetchEndpoint('events-info', 'server-type', 'server-type'),
            fetchEndpoint('mines-info', 'server-types', 'server-types')
        ]);

        const events = [];
        for (const [server, evs] of Object.entries(eventsData)) {
            for (const ev of evs) {
                const r = lootRarity(ev.loot);
                const name = EVENT_NAMES[ev.id] || ev.id || 'Событие';
                events.push({
                    server, event_id: ev.id || '', event_name: name,
                    phase: ev.phase || '', phase_display: phaseInfo(ev.phase),
                    seconds_left: ev['time-seconds-left'] ?? 0,
                    loot: ev.loot && ev.loot !== 'null' ? ev.loot : '',
                    loot_rarity: r.v, rarity_color: r.c, rarity_name: r.n, rarity_emoji: r.e,
                    event_type: ev['event-type'] || 'system'
                });
            }
        }
        events.sort((a, b) => b.loot_rarity - a.loot_rarity || a.seconds_left - b.seconds_left);

        const mines = [];
        for (const [server, ms] of Object.entries(minesData)) {
            for (const m of ms) {
                const r = rar(m['mine-rarity']);
                const n = rar(m['next-mine-rarity']);
                mines.push({
                    server, mine_rarity: m['mine-rarity'], next_rarity: m['next-mine-rarity'],
                    reset_seconds: m['reset-seconds-left'] ?? 0,
                    rarity_name: r.n, rarity_color: r.c, rarity_cls: r.n, rarity_emoji: r.e,
                    rarity_value: r.v, next_name: n.n, next_emoji: n.e
                });
            }
        }
        mines.sort((a, b) => a.reset_seconds - b.reset_seconds);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ events, mines, status: 'OK' })
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ events: [], mines: [], status: 'ERROR', error: err.message })
        };
    }
};
