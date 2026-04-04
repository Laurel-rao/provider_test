/* Error logs page */
let _logsPage = 1;

function renderLogs() {
    return `<h1 class="page-title">错误日志</h1>
    <div class="filters">
      <div class="form-group"><label>端点ID</label><input id="log-ep" type="number" placeholder="全部"></div>
      <div class="form-group"><label>错误类型</label><input id="log-type" placeholder="全部"></div>
      <div class="form-group"><label>开始时间</label><input id="log-start" type="datetime-local"></div>
      <div class="form-group"><label>结束时间</label><input id="log-end" type="datetime-local"></div>
      <button class="btn btn-primary" id="log-search">查询</button>
    </div>
    <table><thead><tr><th>时间</th><th>模块</th><th>类型</th><th>消息</th><th>HTTP码</th></tr></thead>
    <tbody id="log-table"></tbody></table>
    <div class="pagination" id="log-pagination"></div>`;
}

async function initLogs() {
    _logsPage = 1;
    document.getElementById('log-search').addEventListener('click', () => { _logsPage = 1; _loadLogs(); });
    await _loadLogs();
}

async function _loadLogs() {
    let q = `/logs/?page=${_logsPage}&page_size=20`;
    const ep = document.getElementById('log-ep').value;
    const type = document.getElementById('log-type').value;
    const start = document.getElementById('log-start').value;
    const end = document.getElementById('log-end').value;
    if (ep) q += `&endpoint_id=${ep}`;
    if (type) q += `&error_type=${type}`;
    if (start) q += `&start_time=${new Date(start).toISOString()}`;
    if (end) q += `&end_time=${new Date(end).toISOString()}`;
    const data = await api.getJSON(q);
    document.getElementById('log-table').innerHTML = data.items.map(l => `
    <tr><td>${new Date(l.created_at).toLocaleString()}</td><td>${_esc(l.module_name)}</td>
    <td>${_esc(l.error_type)}</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${_esc(l.error_message)}</td>
    <td>${l.http_status_code ?? '-'}</td></tr>`).join('');
    const totalPages = Math.ceil(data.total / data.page_size) || 1;
    document.getElementById('log-pagination').innerHTML = `
    <span class="info">第 ${data.page}/${totalPages} 页，共 ${data.total} 条</span>
    ${data.page > 1 ? `<button class="btn btn-primary btn-sm" onclick="_logsPage--;_loadLogs()">上一页</button>` : ''}
    ${data.page < totalPages ? `<button class="btn btn-primary btn-sm" onclick="_logsPage++;_loadLogs()">下一页</button>` : ''}`;
}
