/* Endpoints management page */
function renderEndpoints() {
    return `<h1 class="page-title">端点管理</h1>
    <button class="btn btn-primary" id="ep-add-btn">添加端点</button>
    <table><thead><tr><th>名称</th><th>URL</th><th>方法</th><th>频率</th><th>状态</th><th>操作</th></tr></thead>
    <tbody id="ep-table"></tbody></table>
    <div id="ep-modal"></div>`;
}

async function initEndpoints() {
    document.getElementById('ep-add-btn').addEventListener('click', () => _showEpForm());
    await _loadEndpoints();
}

async function _loadEndpoints() {
    const eps = await api.getJSON('/endpoints/');
    const intervals = { 30: '30s', 60: '1m', 300: '5m', 600: '10m', 1800: '30m', 3600: '1h' };
    document.getElementById('ep-table').innerHTML = eps.map(ep => `
    <tr>
      <td>${_esc(ep.name)}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${_esc(ep.url)}</td>
      <td>${ep.method}</td><td>${intervals[ep.monitor_interval_seconds] || ep.monitor_interval_seconds + 's'}</td>
      <td><span class="status status-${ep.current_status}">${_statusLabel(ep.current_status)}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="_showEpForm(${ep.id})">编辑</button>
        <button class="btn btn-danger btn-sm" onclick="_deleteEp(${ep.id})">删除</button>
      </td>
    </tr>`).join('');
}

async function _showEpForm(id) {
    let ep = { name: '', url: '', method: 'GET', headers_json: '', expected_status_code: 200, description: '', monitor_interval_seconds: 300, api_key_id: '' };
    if (id) { const r = await api.get(`/endpoints/${id}`); ep = await r.json(); }
    document.getElementById('ep-modal').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
      <div class="modal">
        <h3>${id ? '编辑' : '添加'}端点</h3>
        <div class="form-group"><label>名称</label><input id="ep-name" value="${_esc(ep.name)}"></div>
        <div class="form-group"><label>URL</label><input id="ep-url" value="${_esc(ep.url)}"></div>
        <div class="form-group"><label>方法</label>
          <select id="ep-method">${['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'].map(m => `<option ${m === ep.method ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="form-group"><label>期望状态码</label><input id="ep-status" type="number" value="${ep.expected_status_code}"></div>
        <div class="form-group"><label>监控频率</label>
          <select id="ep-interval">${[[30, '30s'], [60, '1m'], [300, '5m'], [600, '10m'], [1800, '30m'], [3600, '1h']].map(([v, l]) => `<option value="${v}" ${v === ep.monitor_interval_seconds ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="form-group"><label>请求头 (JSON)</label><textarea id="ep-headers" rows="2">${_esc(ep.headers_json || '')}</textarea></div>
        <div class="form-group"><label>描述</label><input id="ep-desc" value="${_esc(ep.description || '')}"></div>
        <div class="btn-group"><button class="btn btn-primary" id="ep-save">保存</button></div>
      </div></div>`;
    document.getElementById('ep-save').addEventListener('click', async () => {
        const body = {
            name: document.getElementById('ep-name').value,
            url: document.getElementById('ep-url').value,
            method: document.getElementById('ep-method').value,
            expected_status_code: parseInt(document.getElementById('ep-status').value),
            monitor_interval_seconds: parseInt(document.getElementById('ep-interval').value),
            headers_json: document.getElementById('ep-headers').value || null,
            description: document.getElementById('ep-desc').value || null,
        };
        if (id) await api.put(`/endpoints/${id}`, body); else await api.post('/endpoints/', body);
        document.getElementById('ep-modal').innerHTML = '';
        await _loadEndpoints();
    });
}

async function _deleteEp(id) {
    if (!confirm('确认删除此端点？')) return;
    await api.del(`/endpoints/${id}`);
    await _loadEndpoints();
}
