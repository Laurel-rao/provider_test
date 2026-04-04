/* HTTP client wrapper – auto-attaches JWT and handles 401 redirects */
const API_BASE = '/api';

function _messageFromUnknown(message) {
    if (typeof message === 'string') return message;
    if (message == null) return '';
    if (Array.isArray(message)) {
        const parts = message.map(_messageFromUnknown).filter(Boolean);
        return parts.join('；');
    }
    if (typeof message === 'object') {
        if (typeof message.detail === 'string') return message.detail;
        if (message.detail != null) {
            const detailText = _messageFromUnknown(message.detail);
            if (detailText) return detailText;
        }
        if (typeof message.message === 'string') return message.message;
        if (typeof message.msg === 'string') return message.msg;
        if (Array.isArray(message.loc) && message.msg) return `${message.loc.join('.')}：${message.msg}`;
        try {
            return JSON.stringify(message, null, 2);
        } catch (e) {
            return String(message);
        }
    }
    return String(message);
}

function _showToast(message, type = 'error') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'var(--danger)' : (type === 'success' ? 'var(--success)' : 'var(--accent)');
    toast.style.cssText = `background:${bgColor};color:#fff;padding:12px 20px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:0.9em;opacity:0;transform:translateY(-20px);transition:all 0.3s ease;max-width:350px;word-break:break-word;pointer-events:auto;`;
    toast.innerText = _messageFromUnknown(message) || '操作失败';
    
    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });
    
    // Auto remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

const api = {
    _token: localStorage.getItem('jwt_token'),

    setToken(token) {
        this._token = token;
        localStorage.setItem('jwt_token', token);
    },

    clearToken() {
        this._token = null;
        localStorage.removeItem('jwt_token');
    },

    isAuthenticated() {
        return !!this._token;
    },

    async request(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        if (this._token) headers['Authorization'] = `Bearer ${this._token}`;
        const opts = { method, headers };
        if (body) opts.body = JSON.stringify(body);
        
        try {
            const resp = await fetch(`${API_BASE}${path}`, opts);
            if (resp.status === 401) {
                this.clearToken();
                window.location.hash = '#/login';
                throw new Error('登录已过期，请重新登录');
            }
            if (!resp.ok) {
                let errMsg = `请求失败 (${resp.status})`;
                try {
                    const errData = await resp.json();
                    errMsg = _messageFromUnknown(errData) || errMsg;
                } catch(e) {}
                throw new Error(errMsg);
            }
            return resp;
        } catch (error) {
            // Handle network errors or manually thrown errors
            _showToast(error.message || '网络请求异常，请检查连接');
            throw error;
        }
    },

    async get(path) { return this.request('GET', path); },
    async post(path, body) { return this.request('POST', path, body); },
    async put(path, body) { return this.request('PUT', path, body); },
    async del(path) { return this.request('DELETE', path); },

    async getJSON(path) { const r = await this.get(path); return r.json(); },
};

function _esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _statusLabel(status) {
    const map = { normal: '正常', abnormal: '异常', unknown: '未知' };
    return map[status] || status;
}
