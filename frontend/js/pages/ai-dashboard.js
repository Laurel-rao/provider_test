/* AI Dashboard – compact 4-col card grid with mini sparkline */
let _aiDashInterval = null;
let _aiDashHours = 24;
let _aiSparkCharts = [];

const _timeRanges = [
    { label: '1h', hours: 1 },
    { label: '6h', hours: 6 },
    { label: '12h', hours: 12 },
    { label: '24h', hours: 24 },
    { label: '3d', hours: 72 },
    { label: '7d', hours: 168 },
    { label: '30d', hours: 720 },
];

function renderAIDashboard() {
    const btns = _timeRanges.map(r =>
        `<button class="ai-tr-btn${r.hours === _aiDashHours ? ' ai-tr-active' : ''}" data-h="${r.hours}">${r.label}</button>`
    ).join('');
    
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:20px">
        <h1 class="page-title" style="margin:0;font-size:1.4em">AI 仪表盘</h1>
        <div style="display:flex;align-items:center;gap:10px">
            <select id="ai-type-filter" style="width:auto;min-width:90px;padding:4px 8px;background:var(--input-bg);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:.78em">
                <option value="">全部</option><option value="openai">OpenAI</option><option value="claude_code">Claude</option><option value="azure_openai">Azure</option><option value="custom">Custom</option>
            </select>
            <div id="ai-time-range" style="display:flex;gap:2px;background:var(--bg-secondary);border-radius:5px;padding:2px">${btns}</div>
        </div>
    </div>
    
    <div id="ai-summary" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px"></div>
    <div id="ai-probe-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:30px"></div>
    
    <div style="margin-top: 20px; border-top: 1px solid var(--border); padding-top: 20px;">
        <h2 style="font-size:1.2em; margin-bottom: 16px; color: var(--text-primary);">请求日志</h2>
        ${typeof renderRecords === 'function' ? renderRecords() : ''}
    </div>
    `;
}

async function initAIDashboard() {
    document.getElementById('ai-type-filter').addEventListener('change', _loadAIDash);
    document.getElementById('ai-time-range').addEventListener('click', e => {
        const b = e.target.closest('[data-h]');
        if (!b) return;
        _aiDashHours = +b.dataset.h;
        document.querySelectorAll('.ai-tr-btn').forEach(x => x.classList.remove('ai-tr-active'));
        b.classList.add('ai-tr-active');
        _loadAIDash();
    });
    
    await Promise.all([
        _loadAIDash(),
        typeof initRecords === 'function' ? initRecords() : Promise.resolve()
    ]);
    
    _aiDashInterval = setInterval(_loadAIDash, 15000);
}

function destroyAIDashboard() {
    if (_aiDashInterval) { clearInterval(_aiDashInterval); _aiDashInterval = null; }
    _aiSparkCharts.forEach(c => c.destroy());
    _aiSparkCharts = [];
    if (typeof destroyRecords === 'function') destroyRecords();
}

async function _loadAIDash() {
    const tf = document.getElementById('ai-type-filter').value;
    const q = new URLSearchParams({ hours: _aiDashHours });
    if (tf) q.set('provider_type', tf);
    try {
        const [sum, cards] = await Promise.all([
            api.getJSON('/ai-providers/dashboard/summary'),
            api.getJSON('/ai-providers/dashboard/probe-cards?' + q),
        ]);
        _drawSummary(sum);
        _drawGrid(cards);
    } catch (e) { console.error(e); }
}

function _drawSummary(s) {
    const d = [
        ['总数', s.total, '--accent'],
        ['正常', s.healthy, '--success'],
        ['异常', s.unhealthy, '--danger'],
        ['未知', s.unknown, '--unknown'],
        ['健康率', (s.health_rate * 100).toFixed(1) + '%', s.health_rate >= .95 ? '--success' : '--danger'],
    ];
    document.getElementById('ai-summary').innerHTML = d.map(([l, v, c]) => `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px 8px;text-align:center">
            <div style="font-size:1.3em;font-weight:700;color:var(${c});line-height:1.1">${v}</div>
            <div style="font-size:.7em;color:var(--text-secondary);margin-top:2px">${l}</div>
        </div>`).join('');
}

function _drawGrid(cards) {
    // Destroy old sparkline charts
    _aiSparkCharts.forEach(c => c.destroy());
    _aiSparkCharts = [];

    const el = document.getElementById('ai-probe-grid');
    if (!cards.length) { el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-secondary)">暂无供应商数据</div>'; return; }

    el.innerHTML = cards.map((c, i) => {
        const st = c.current_status || 'unknown';
        const stLabel = { normal: '正常', abnormal: '异常' }[st] || '未知';
        const stColor = { normal: '#2ecc71', abnormal: '#e74c3c' }[st] || '#7f8c8d';
        const avail = c.availability_rate != null ? (c.availability_rate * 100).toFixed(1) + '%' : '--';
        const availC = c.availability_rate != null && c.availability_rate < .95 ? 'var(--danger)' : 'var(--success)';
        const rt = c.avg_response_time_ms != null ? c.avg_response_time_ms.toFixed(0) : '--';

        return `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;position:relative;overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <div style="font-size:.85em;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;margin-right:8px">${_esc(c.provider_name)}</div>
                <div style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:.65em;font-weight:600;background:${stColor}22;color:${stColor};flex-shrink:0">
                    <span style="width:5px;height:5px;border-radius:50%;background:${stColor};display:inline-block"></span>${stLabel}
                </div>
            </div>
            <div style="font-size:.68em;color:var(--text-secondary);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(c.provider_type)} · ${_esc(c.model)}</div>
            <div style="display:flex;gap:2px;margin-bottom:6px">${c.probes.map(p => {
            const bg = p.value === 1 ? 'var(--success)' : p.value === 0 ? 'var(--danger)' : 'rgba(255,255,255,.08)';
            const tip = p.timestamp + (p.value === 1 ? ' · 正常' : p.value === 0 ? ' · 异常' : ' · 无数据') + (p.avg_response_time_ms != null ? ' · ' + p.avg_response_time_ms.toFixed(0) + 'ms' : '');
            return `<div style="flex:1;height:14px;min-width:0;border-radius:2px;background:${bg};cursor:pointer" title="${tip}"></div>`;
        }).join('')}</div>
            <div style="height:48px;margin-bottom:8px"><canvas id="ai-spark-${i}" style="width:100%;height:100%"></canvas></div>
            <div style="display:flex;justify-content:space-between;font-size:.7em">
                <span style="color:var(--text-secondary)">可用 <span style="color:${availC};font-weight:600">${avail}</span></span>
                <span style="color:var(--text-secondary)">延迟 <span style="color:var(--text-primary);font-weight:600">${rt}<span style="font-size:.85em"> ms</span></span></span>
            </div>
        </div>`;
    }).join('');

    // Draw sparkline charts
    cards.forEach((c, i) => {
        const canvas = document.getElementById('ai-spark-' + i);
        if (!canvas) return;
        const pts = c.probes.filter(p => p.avg_response_time_ms != null);
        const labels = pts.map(p => p.timestamp.slice(11, 16));
        const data = pts.map(p => p.avg_response_time_ms);
        const borderColor = (c.current_status === 'abnormal') ? '#e74c3c' : '#00b4d8';
        const bgColor = (c.current_status === 'abnormal') ? 'rgba(231,76,60,.15)' : 'rgba(0,180,216,.15)';

        const chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data,
                    borderColor,
                    backgroundColor: bgColor,
                    fill: true,
                    tension: .4,
                    pointRadius: 0,
                    borderWidth: 1.5,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true, mode: 'index', intersect: false, callbacks: { label: ctx => ctx.parsed.y.toFixed(0) + ' ms' } } },
                scales: { x: { display: false }, y: { display: false } },
                interaction: { mode: 'index', intersect: false },
                elements: { line: { borderCapStyle: 'round' } },
            }
        });
        _aiSparkCharts.push(chart);
    });
}
