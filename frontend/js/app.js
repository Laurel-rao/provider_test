/* SPA router – hash-based routing */
const routes = {
    '/login': { render: renderLogin, init: initLogin },
    '/': { render: renderAIDashboard, init: initAIDashboard, destroy: destroyAIDashboard },
    '/endpoints': { render: renderEndpoints, init: initEndpoints },
    '/keys': { render: renderKeys, init: initKeys },
    '/alerts': { render: renderAlerts, init: initAlerts },
    '/logs': { render: renderLogs, init: initLogs },
    '/ai-dashboard': { render: renderAIDashboard, init: initAIDashboard, destroy: destroyAIDashboard },
    '/ai-providers': { render: renderAIProviders, init: initAIProviders },
};

let _currentDestroy = null;

function navigate() {
    // Cleanup previous page
    if (_currentDestroy) { _currentDestroy(); _currentDestroy = null; }

    let path = window.location.hash.replace('#', '') || '/';
    if (!api.isAuthenticated() && path !== '/login') { window.location.hash = '#/login'; return; }
    if (api.isAuthenticated() && path === '/login') { window.location.hash = '#/'; return; }

    const route = routes[path];
    if (!route) { path = '/'; }
    const r = routes[path];

    const sidebar = document.getElementById('sidebar');
    const app = document.getElementById('app');

    if (path === '/login') {
        sidebar.classList.add('hidden');
        app.style.padding = '0';
    } else {
        sidebar.classList.remove('hidden');
        app.style.padding = '30px';
    }

    // Update active nav
    document.querySelectorAll('.nav-link').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-page') === path.replace('/', '') || (path === '/' && el.getAttribute('data-page') === 'ai-dashboard'));
    });

    app.innerHTML = r.render();
    if (r.init) r.init();
    if (r.destroy) _currentDestroy = r.destroy;
}

window.addEventListener('hashchange', navigate);

// Logout
document.getElementById('logout-btn').addEventListener('click', e => {
    e.preventDefault();
    api.clearToken();
    window.location.hash = '#/login';
});

// Initial navigation
navigate();
