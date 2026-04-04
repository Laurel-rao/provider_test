/* Login page */
function renderLogin() {
    return `
    <div class="login-container">
      <div class="login-box">
        <h2>API Monitor</h2>
        <div class="form-group">
          <label>用户名</label>
          <input id="login-user" type="text" placeholder="admin">
        </div>
        <div class="form-group">
          <label>密码</label>
          <input id="login-pass" type="password" placeholder="密码">
        </div>
        <button class="btn btn-primary" style="width:100%" id="login-submit">登录</button>
        <div id="login-error" class="error-msg"></div>
      </div>
    </div>`;
}

function initLogin() {
    document.getElementById('login-submit').addEventListener('click', async () => {
        const username = document.getElementById('login-user').value;
        const password = document.getElementById('login-pass').value;
        const errEl = document.getElementById('login-error');
        errEl.textContent = '';
        try {
            const resp = await api.request('POST', '/auth/login', { username, password });
            if (!resp.ok) { errEl.textContent = '用户名或密码错误'; return; }
            const data = await resp.json();
            api.setToken(data.access_token);
            window.location.hash = '#/';
        } catch { errEl.textContent = '登录失败'; }
    });
    document.getElementById('login-pass').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('login-submit').click();
    });
}
