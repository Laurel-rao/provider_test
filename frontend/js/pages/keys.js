/* API Keys management page */
function renderKeys() {
    return `<h1 class="page-title">密钥管理</h1>
    <button class="btn btn-primary" id="key-add-btn">创建密钥</button>
    <table><thead><tr><th>名称</th><th>密钥值</th><th>创建时间</th><th>操作</th></tr></thead>
    <tbody id="key-table"></tbody></table>
    <div id="key-modal"></div>`;
}

async function initKeys() {
    document.getElementById('key-add-btn').addEventListener('click', _showKeyForm);
    await _loadKeys();
}

async function _loadKeys() {
    const keys = await api.getJSON('/keys/');
    document.getElementById('key-table').innerHTML = keys.map(k => `
    <tr>
      <td>${_esc(k.name)}</td><td><code>${_esc(k.masked_value)}</code></td>
      <td>${new Date(k.created_at).toLocaleString()}</td>
      <td><button class="btn btn-danger btn-sm" onclick="_deleteKey(${k.id})">删除</button></td>
    </tr>`).join('');
}

function _showKeyForm() {
    document.getElementById('key-modal').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
      <div class="modal">
        <h3>创建密钥</h3>
        <div class="form-group"><label>名称</label><input id="key-name"></div>
        <div class="form-group"><label>密钥值</label><input id="key-value" type="password"></div>
        <div class="btn-group"><button class="btn btn-primary" id="key-save">保存</button></div>
      </div></div>`;
    document.getElementById('key-save').addEventListener('click', async () => {
        await api.post('/keys/', { name: document.getElementById('key-name').value, value: document.getElementById('key-value').value });
        document.getElementById('key-modal').innerHTML = '';
        await _loadKeys();
    });
}

async function _deleteKey(id) {
    if (!confirm('确认删除此密钥？')) return;
    await api.del(`/keys/${id}`);
    await _loadKeys();
}
