/* History records page – redesigned with full detail view */
let _recordsChart = null;
let _recPage = 1;
const _recPageSize = 10;

function renderRecords() {
    return `
    <div style="display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:12px;margin-bottom:10px">
        <button class="btn btn-primary" id="rec-export" style="font-size:.82em">导出 CSV</button>
    </div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
        <div style="flex:1;min-width:300px;max-width:350px;">
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:20px">
                <canvas id="rec-chart" height="200"></canvas>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;background:var(--bg-card);padding:16px;border-radius:10px;border:1px solid var(--border);">
                <div class="form-group" style="margin:0">
                    <label>端点</label><select id="rec-ep" style="width:100%;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--input-bg);color:var(--text-primary)"><option value="">全部</option></select>
                </div>
                <div class="form-group" style="margin:0">
                    <label>状态</label><select id="rec-status" style="width:100%;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--input-bg);color:var(--text-primary)"><option value="">全部</option><option value="200">200</option><option value="non200">非200</option></select>
                </div>
                <div class="form-group" style="margin:0">
                    <label>开始时间</label><input id="rec-start" type="datetime-local" style="width:100%;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--input-bg);color:var(--text-primary)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>结束时间</label><input id="rec-end" type="datetime-local" style="width:100%;padding:6px;border-radius:4px;border:1px solid var(--border);background:var(--input-bg);color:var(--text-primary)">
                </div>
                <button class="btn btn-primary" id="rec-search" style="width:100%;margin-top:8px">查询</button>
            </div>
        </div>
        
        <div style="flex:3;min-width:600px;">
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;overflow:hidden;">
                <table style="width:100%;border-collapse:collapse;text-align:left;font-size:0.85em;">
                    <thead>
                        <tr style="background:var(--bg-secondary);border-bottom:1px solid var(--border);">
                            <th style="padding:12px;font-weight:600;color:var(--text-secondary);">状态</th>
                            <th style="padding:12px;font-weight:600;color:var(--text-secondary);">端点</th>
                            <th style="padding:12px;font-weight:600;color:var(--text-secondary);">方法</th>
                            <th style="padding:12px;font-weight:600;color:var(--text-secondary);">状态码</th>
                            <th style="padding:12px;font-weight:600;color:var(--text-secondary);">响应时间</th>
                            <th style="padding:12px;font-weight:600;color:var(--text-secondary);">检测时间</th>
                        </tr>
                    </thead>
                    <tbody id="rec-list"></tbody>
                </table>
            </div>
            <div id="rec-pager" style="display:flex;justify-content:center;gap:8px;align-items:center;margin-top:16px"></div>
        </div>
    </div>
    <div id="rec-detail-overlay" style="display:none"></div>`;
}

async function initRecords() {
    const eps = await api.getJSON('/endpoints/');
    const sel = document.getElementById('rec-ep');
    eps.forEach(ep => { const o = document.createElement('option'); o.value = ep.id; o.textContent = ep.name; sel.appendChild(o); });
    document.getElementById('rec-search').addEventListener('click', () => { _recPage = 1; _loadRecords(); });
    document.getElementById('rec-export').addEventListener('click', _exportRecords);
    document.getElementById('rec-detail-overlay').addEventListener('click', e => {
        if (e.target.id === 'rec-detail-overlay' || e.target.classList.contains('rec-close')) {
            document.getElementById('rec-detail-overlay').style.display = 'none';
        }
    });
    await _loadRecords();
}

function destroyRecords() { if (_recordsChart) { _recordsChart.destroy(); _recordsChart = null; } }

function _recQueryStr() {
    const q = new URLSearchParams();
    const ep = document.getElementById('rec-ep').value;
    const st = document.getElementById('rec-status').value;
    const s = document.getElementById('rec-start').value;
    const e = document.getElementById('rec-end').value;
    if (ep) q.set('endpoint_id', ep);
    if (st) q.set('status', st);
    if (s) q.set('start_time', new Date(s).toISOString());
    if (e) q.set('end_time', new Date(e).toISOString());
    return q;
}

async function _loadRecords() {
    const q = _recQueryStr();
    q.set('page', _recPage);
    q.set('page_size', _recPageSize);
    const records = await api.getJSON('/records/?' + q);
    _drawRecordList(records);
    _drawRecordChart(records);
    _drawPager(records.length);
}

function _drawPager(count) {
    const el = document.getElementById('rec-pager');
    let html = '';
    if (_recPage > 1) html += `<button class="btn btn-sm" onclick="_recPage--;_loadRecords()">上一页</button>`;
    html += `<span style="font-size:.85em;color:var(--text-secondary)">第 ${_recPage} 页</span>`;
    if (count >= _recPageSize) html += `<button class="btn btn-sm" onclick="_recPage++;_loadRecords()">下一页</button>`;
    el.innerHTML = html;
}

function _drawRecordList(records) {
    const el = document.getElementById('rec-list');
    if (!records.length) {
        el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary)">暂无记录</td></tr>';
        return;
    }
    el.innerHTML = records.map(r => {
        const ok = r.is_success;
        const stColor = ok ? 'var(--success)' : 'var(--danger)';
        const stText = ok ? '成功' : '失败';
        const sc = r.status_code != null ? r.status_code : '--';
        const rt = r.response_time_ms != null ? r.response_time_ms.toFixed(0) + ' ms' : '--';
        const epName = r.endpoint_name || '未知端点';
        const method = r.endpoint_method || '';

        return `
        <tr style="border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'" onclick="_showRecordDetail(${r.id})">
            <td style="padding:12px;border-left:3px solid ${stColor}">
                <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:12px;font-size:.85em;font-weight:600;background:${stColor}22;color:${stColor}">
                    <span style="width:6px;height:6px;border-radius:50%;background:${stColor};display:inline-block"></span>${stText}
                </div>
            </td>
            <td style="padding:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;" title="${_esc(epName)}">${_esc(epName)}</td>
            <td style="padding:12px;"><span style="font-size:.85em;padding:2px 6px;border-radius:4px;background:var(--bg-secondary);color:var(--text-secondary);font-weight:600">${method}</span></td>
            <td style="padding:12px;font-weight:600;color:${r.status_code && r.status_code >= 400 ? 'var(--danger)' : 'var(--text-primary)'}">${sc}</td>
            <td style="padding:12px;font-weight:600;color:var(--text-primary)">${rt}</td>
            <td style="padding:12px;color:var(--text-secondary);white-space:nowrap;">${new Date(r.checked_at).toLocaleString()}</td>
        </tr>`;
    }).join('');
}

function _drawRecordChart(records) {
    const data = records.filter(r => r.response_time_ms != null).reverse();
    if (_recordsChart) _recordsChart.destroy();
    if (!data.length) return;
    _recordsChart = new Chart(document.getElementById('rec-chart'), {
        type: 'line',
        data: {
            labels: data.map(r => new Date(r.checked_at).toLocaleTimeString()),
            datasets: [{
                label: '响应时间 (ms)',
                data: data.map(r => r.response_time_ms),
                borderColor: '#00b4d8',
                backgroundColor: 'rgba(0,180,216,.1)',
                fill: true,
                tension: .3,
                pointRadius: 2,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#e0e0e0' } } },
            scales: {
                x: { ticks: { color: '#a0a0b0', maxTicksLimit: 15 } },
                y: { ticks: { color: '#a0a0b0' }, title: { display: true, text: 'ms', color: '#a0a0b0' } }
            }
        }
    });
}

async function _showRecordDetail(id) {
    const r = await api.getJSON('/records/' + id);
    const ok = r.is_success;
    const stColor = ok ? 'var(--success)' : 'var(--danger)';
    const stText = ok ? '成功' : '失败';

    // Try to pretty-print response body
    let bodyHtml = '<span style="color:var(--text-secondary)">无响应内容</span>';
    if (r.response_body) {
        try {
            const parsed = JSON.parse(r.response_body);
            bodyHtml = '<pre style="margin:0;white-space:pre-wrap;word-break:break-all;font-size:.82em;color:var(--text-primary);max-height:400px;overflow-y:auto">' + _esc(JSON.stringify(parsed, null, 2)) + '</pre>';
        } catch {
            bodyHtml = '<pre style="margin:0;white-space:pre-wrap;word-break:break-all;font-size:.82em;color:var(--text-primary);max-height:400px;overflow-y:auto">' + _esc(r.response_body) + '</pre>';
        }
    }

    let errorHtml = '';
    if (r.error_message) {
        errorHtml = `
        <div style="margin-top:16px">
            <div style="font-size:.78em;color:var(--text-secondary);margin-bottom:6px">错误信息</div>
            <div style="background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.25);border-radius:6px;padding:12px;font-size:.85em;color:var(--danger);white-space:pre-wrap;word-break:break-all">${_esc(r.error_message)}</div>
        </div>`;
    }

    const overlay = document.getElementById('rec-detail-overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100" id="rec-detail-overlay" onclick="if(event.target===this)this.style.display='none'">
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;width:680px;max-height:85vh;overflow-y:auto;padding:24px" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <div style="font-size:1.1em;font-weight:600;color:var(--accent)">记录详情 #${r.id}</div>
                <button class="rec-close" style="background:none;border:none;color:var(--text-secondary);font-size:1.3em;cursor:pointer;padding:4px 8px" onclick="document.getElementById('rec-detail-overlay').style.display='none'">✕</button>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px">
                    <div style="font-size:.72em;color:var(--text-secondary);margin-bottom:4px">端点</div>
                    <div style="font-size:.92em;font-weight:600">${_esc(r.endpoint_name || '--')}</div>
                    <div style="font-size:.75em;color:var(--text-secondary);margin-top:2px;word-break:break-all">${_esc(r.endpoint_url || '')}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px">
                    <div style="font-size:.72em;color:var(--text-secondary);margin-bottom:4px">检测时间</div>
                    <div style="font-size:.92em">${new Date(r.checked_at).toLocaleString()}</div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:.72em;color:var(--text-secondary)">结果</div>
                    <div style="font-size:1.1em;font-weight:700;color:${stColor};margin-top:4px">${stText}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:.72em;color:var(--text-secondary)">请求方法</div>
                    <div style="font-size:1.1em;font-weight:600;margin-top:4px">${r.endpoint_method || '--'}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:.72em;color:var(--text-secondary)">状态码</div>
                    <div style="font-size:1.1em;font-weight:700;color:${r.status_code && r.status_code >= 400 ? 'var(--danger)' : 'var(--success)'};margin-top:4px">${r.status_code ?? '--'}</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:.72em;color:var(--text-secondary)">响应时间</div>
                    <div style="font-size:1.1em;font-weight:600;margin-top:4px">${r.response_time_ms != null ? r.response_time_ms.toFixed(0) + ' ms' : '--'}</div>
                </div>
            </div>

            ${errorHtml}

            <div style="margin-top:16px">
                <div style="font-size:.78em;color:var(--text-secondary);margin-bottom:6px">响应内容</div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:14px;border:1px solid var(--border)">${bodyHtml}</div>
            </div>
        </div>
    </div>`;
}

async function _exportRecords() {
    const q = _recQueryStr();
    const resp = await api.get('/records/export?' + q);
    const blob = await resp.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'check_records.csv'; a.click();
}
