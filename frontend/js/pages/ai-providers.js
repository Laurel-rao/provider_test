/* AI Provider management page */
function renderAIProviders() {
    return `<h1 class="page-title">AI 供应商管理</h1>
    <button class="btn btn-primary" id="aip-add-btn">添加供应商</button>
    <table><thead><tr><th>名称</th><th>类型</th><th>模型</th><th>基础地址</th><th>频率</th><th>API Key</th><th>状态</th><th>最近检查</th><th>操作</th></tr></thead>
    <tbody id="aip-table"></tbody></table>
    <div id="aip-modal"></div>`;
}

async function initAIProviders() {
    document.getElementById('aip-add-btn').addEventListener('click', () => _showAIPForm());
    await _loadAIProviders();
}

async function _loadAIProviders() {
    const providers = await api.getJSON('/ai-providers/');
    const intervals = { 30: '30s', 60: '1m', 300: '5m', 600: '10m', 1800: '30m', 3600: '1h' };
    document.getElementById('aip-table').innerHTML = providers.map(p => `
    <tr>
      <td>${_esc(p.name)}</td>
      <td><span class="status" style="background:var(--accent)">${_esc(p.provider_type)}</span></td>
      <td>${_esc(p.model)}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${_esc(p.base_url)}</td>
      <td>${intervals[p.monitor_interval_seconds] || ((p.monitor_interval_seconds || 300) + 's')}</td>
      <td><code>${_esc(p.masked_key)}</code></td>
      <td>${p.current_status ? `<a href="#/records" class="status status-${p.current_status}" style="cursor:pointer;text-decoration:none">${_statusLabel(p.current_status)}</a>` : '<span class="status status-unknown">未知</span>'}</td>
      <td>${p.last_check_at ? new Date(p.last_check_at).toLocaleString() : '-'}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="_showAIPForm(${p.id})">编辑</button>
        <button class="btn btn-secondary btn-sm" onclick="_copyAIP(${p.id})">复制</button>
        <button class="btn btn-secondary btn-sm" onclick="_testAIP(${p.id})">测试</button>
        <button class="btn btn-danger btn-sm" onclick="_deleteAIP(${p.id})">删除</button>
      </td>
    </tr>`).join('');
}

async function _showAIPForm(id) {
    let p = { name: '', provider_type: 'openai', base_url: '', model: '', description: '', monitor_interval_seconds: 300, stream: true };
    if (id) { 
        const r = await api.get(`/ai-providers/${id}`); 
        p = await r.json(); 
        // Ensure stream is explicitly boolean, default to true if undefined
        p.stream = p.stream !== false;
    }
    const types = ['openai', 'claude_code', 'azure_openai', 'custom'];
    document.getElementById('aip-modal').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
      <div class="modal">
        <h3>${id ? '编辑' : '添加'}供应商</h3>
        <div class="form-group"><label>名称</label><input id="aip-name" value="${_esc(p.name)}"></div>
        <div class="form-group"><label>供应商类型</label>
          <select id="aip-type">${types.map(t => `<option value="${t}" ${t === p.provider_type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="form-group"><label>基础地址 (BaseURL)</label><input id="aip-url" value="${_esc(p.base_url)}" placeholder="https://api.openai.com"></div>
        <div class="form-group"><label>API Key</label><input id="aip-key" type="password" placeholder="${id ? '留空则保留原密钥' : '输入 API Key'}"></div>
        <div class="form-group"><label>模型</label><input id="aip-model" value="${_esc(p.model)}" placeholder="gpt-4"></div>
        <div class="form-group" style="display:flex;align-items:center;gap:10px;margin-bottom:15px;">
          <input type="checkbox" id="aip-stream" ${p.stream ? 'checked' : ''} style="width:auto;margin:0;">
          <label for="aip-stream" style="margin:0;cursor:pointer;">启用 Stream (流式请求) <span style="font-size:0.8em;color:var(--text-secondary);font-weight:normal;">适用于强制要求流式输出的服务端</span></label>
        </div>
        <div class="form-group"><label>监控频率</label>
          <select id="aip-interval">${[[30, '30s'], [60, '1m'], [300, '5m'], [600, '10m'], [1800, '30m'], [3600, '1h']].map(([v, l]) => `<option value="${v}" ${v === (p.monitor_interval_seconds || 300) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="form-group"><label>备注</label><input id="aip-desc" value="${_esc(p.description || '')}"></div>
        <div class="btn-group"><button class="btn btn-primary" id="aip-save">保存</button></div>
      </div></div>`;
      
    // Toggle stream visibility based on provider type
    const typeSelect = document.getElementById('aip-type');
    const streamContainer = document.getElementById('aip-stream').parentElement;
    
    const updateStreamVisibility = () => {
        if (typeSelect.value === 'openai') {
            streamContainer.style.display = 'flex';
        } else {
            streamContainer.style.display = 'none';
        }
    };
    
    typeSelect.addEventListener('change', updateStreamVisibility);
    updateStreamVisibility();
      
    document.getElementById('aip-save').addEventListener('click', async () => {
        const body = { 
            name: document.getElementById('aip-name').value, 
            provider_type: document.getElementById('aip-type').value, 
            base_url: document.getElementById('aip-url').value, 
            model: document.getElementById('aip-model').value, 
            monitor_interval_seconds: parseInt(document.getElementById('aip-interval').value, 10), 
            description: document.getElementById('aip-desc').value || null,
            stream: document.getElementById('aip-stream').checked
        };
        const key = document.getElementById('aip-key').value;
        if (key) body.api_key = key;
        else if (!id) { alert('请输入 API Key'); return; }
        if (id) await api.put(`/ai-providers/${id}`, body); else await api.post('/ai-providers/', body);
        document.getElementById('aip-modal').innerHTML = '';
        await _loadAIProviders();
    });
}

async function _deleteAIP(id) {
    if (!confirm('确认删除此供应商？关联的监控端点也将被删除。')) return;
    await api.del(`/ai-providers/${id}`);
    await _loadAIProviders();
}

async function _copyAIP(id) {
    if (!confirm('确认复制此供应商配置？')) return;
    const resp = await api.post(`/ai-providers/${id}/copy`);
    if (!resp.ok) {
        alert('复制失败');
        return;
    }
    await _loadAIProviders();
}

async function _testAIP(id) {
    const resp = await api.post(`/ai-providers/${id}/test`);
    const result = await resp.json();
    if (!resp.ok) {
        alert(result.detail || '测试失败');
        return;
    }
    const status = result.is_success ? '成功' : '失败';
    const extra = result.error_message ? `\n错误：${result.error_message}` : '';
    alert(`测试${status}\n状态码：${result.status_code ?? '-'}\n耗时：${result.response_time_ms ?? '-'}ms${extra}`);
    await _loadAIProviders();
}
