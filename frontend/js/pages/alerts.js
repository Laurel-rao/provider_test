/* Alerts management page */
function renderAlerts() {
    return `<h1 class="page-title">告警管理</h1>
    <h2 style="font-size:1.1em;margin-bottom:10px">告警规则</h2>
    <button class="btn btn-primary" id="rule-add-btn">添加规则</button>
    <table><thead><tr><th>端点ID</th><th>类型</th><th>阈值</th><th>启用</th><th>操作</th></tr></thead>
    <tbody id="rule-table"></tbody></table>
    <h2 style="font-size:1.1em;margin:20px 0 10px">告警记录</h2>
    <table><thead><tr><th>时间</th><th>端点ID</th><th>触发条件</th><th>状态</th><th>操作</th></tr></thead>
    <tbody id="alert-table"></tbody></table>
    <div id="alert-modal"></div>`;
}

async function initAlerts() {
    document.getElementById('rule-add-btn').addEventListener('click', _showRuleForm);
    await _loadAlerts();
}

async function _loadAlerts() {
    const [rules, alerts] = await Promise.all([api.getJSON('/alerts/rules'), api.getJSON('/alerts')]);
    document.getElementById('rule-table').innerHTML = rules.map(r => `
    <tr><td>${r.endpoint_id}</td><td>${r.rule_type}</td><td>${r.threshold_value}</td><td>${r.is_active ? '是' : '否'}</td>
    <td><button class="btn btn-danger btn-sm" onclick="_deleteRule(${r.id})">删除</button></td></tr>`).join('');
    const statusMap = { open: '未处理', acknowledged: '已确认', resolved: '已解决' };
    document.getElementById('alert-table').innerHTML = alerts.map(a => `
    <tr><td>${new Date(a.triggered_at).toLocaleString()}</td><td>${a.endpoint_id}</td>
    <td>${_esc(a.trigger_condition)}</td><td>${statusMap[a.status] || a.status}</td>
    <td>${a.status !== 'resolved' ? `<button class="btn btn-primary btn-sm" onclick="_ackAlert(${a.id},'${a.status === 'open' ? 'acknowledged' : 'resolved'}')">
      ${a.status === 'open' ? '确认' : '解决'}</button>` : ''}</td></tr>`).join('');
}

function _showRuleForm() {
    document.getElementById('alert-modal').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
      <div class="modal"><h3>添加告警规则</h3>
        <div class="form-group"><label>端点ID</label><input id="rule-ep" type="number"></div>
        <div class="form-group"><label>规则类型</label>
          <select id="rule-type"><option value="consecutive_failures">连续失败次数</option><option value="response_time">响应时间阈值(ms)</option></select></div>
        <div class="form-group"><label>阈值</label><input id="rule-threshold" type="number"></div>
        <div class="btn-group"><button class="btn btn-primary" id="rule-save">保存</button></div>
      </div></div>`;
    document.getElementById('rule-save').addEventListener('click', async () => {
        await api.post('/alerts/rules', {
            endpoint_id: parseInt(document.getElementById('rule-ep').value),
            rule_type: document.getElementById('rule-type').value,
            threshold_value: parseInt(document.getElementById('rule-threshold').value),
        });
        document.getElementById('alert-modal').innerHTML = '';
        await _loadAlerts();
    });
}

async function _deleteRule(id) { if (confirm('确认删除？')) { await api.del(`/alerts/rules/${id}`); await _loadAlerts(); } }
async function _ackAlert(id, status) { await api.put(`/alerts/${id}/status`, { status }); await _loadAlerts(); }
