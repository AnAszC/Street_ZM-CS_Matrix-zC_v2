const REFRESH_INTERVAL = 10000;

const state = {
    servers: [],
    filter: 'all',
    search: '',
    sort: 'default'
};

const serverList =
    document.getElementById('serverList');

const onlineCount =
    document.getElementById('onlineCount');

const offlineCount =
    document.getElementById('offlineCount');

const serverCount =
    document.getElementById('serverCount');

const playerCount =
    document.getElementById('playerCount');

const lastUpdate =
    document.getElementById('lastUpdate');

const resultSummary =
    document.getElementById('resultSummary');

const refreshButton =
    document.getElementById('refreshButton');

const searchInput =
    document.getElementById('searchInput');

const sortSelect =
    document.getElementById('sortSelect');

const filterButtons =
    document.querySelectorAll(
        '.filter-button'
    );


function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll(
            "'",
            '&#039;'
        );
}


/* =========================
   SERVER NOT FOUND TOAST
========================= */

function showServerNotFoundNotification(
    serverId
) {
    const existingToast =
        document.getElementById(
            'serverNotFoundToast'
        );

    if (existingToast) {
        existingToast.remove();
    }

    const toast =
        document.createElement(
            'div'
        );

    toast.id =
        'serverNotFoundToast';

    toast.className =
        'dashboard-toast dashboard-toast-error';

    toast.innerHTML = `
        <div class="dashboard-toast-icon">
            !
        </div>

        <div class="dashboard-toast-content">

            <div class="dashboard-toast-title">
                Game Server Not Found
            </div>

            <div class="dashboard-toast-message">
                Game Server #${escapeHtml(
                    serverId
                )} does not exist or was removed.
            </div>

        </div>

        <button
            type="button"
            class="dashboard-toast-close"
            aria-label="Close notification"
        >
            ×
        </button>
    `;

    document.body.appendChild(
        toast
    );

    requestAnimationFrame(() => {
        toast.classList.add(
            'show'
        );
    });

    const closeButton =
        toast.querySelector(
            '.dashboard-toast-close'
        );

    closeButton?.addEventListener(
        'click',
        () => {
            toast.classList.remove(
                'show'
            );

            setTimeout(
                () => toast.remove(),
                250
            );
        }
    );

    setTimeout(() => {
        if (
            !document.body.contains(
                toast
            )
        ) {
            return;
        }

        toast.classList.remove(
            'show'
        );

        setTimeout(
            () => toast.remove(),
            250
        );
    }, 5000);
}


function handleServerNotFoundNotification() {
    const params =
        new URLSearchParams(
            window.location.search
        );

    const serverNotFound =
        params.get(
            'serverNotFound'
        );

    if (!serverNotFound) {
        return;
    }

    showServerNotFoundNotification(
        serverNotFound
    );

    /*
     * Remove the query parameter from
     * the address bar so refreshing the
     * homepage does not show the notification again.
     */
    window.history.replaceState(
        {},
        document.title,
        window.location.pathname
    );
}


/* =========================
   SERVER HELPERS
========================= */

function getAddress(server) {
    if (
        server.host &&
        server.port
    ) {
        return `${server.host}:${server.port}`;
    }

    return (
        server.connect ||
        server.host ||
        'Unknown'
    );
}


function getCountry(server) {
    if (
        server.countryFlag &&
        server.countryCode
    ) {
        return `${server.countryFlag} ${server.countryCode}`;
    }

    return '🌐 Unknown';
}


/* =========================
   SERVER CARD
========================= */

function buildServerCard(server) {
    const statusClass =
        server.online
            ? 'online'
            : 'offline';

    const statusText =
        server.online
            ? 'ONLINE'
            : 'OFFLINE';

    const discordButton =
        server.discordInvite
            ? `
                <a
                    href="${escapeHtml(server.discordInvite)}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Discord
                </a>
              `
            : '';

    const connectButton =
        server.connect
            ? `
                <button
                    type="button"
                    class="copy-connect"
                    data-connect="${escapeHtml(server.connect)}"
                >
                    Copy Connect
                </button>
              `
            : '';

    return `
        <article class="server-card">

            <div class="server-top">

                <div class="server-title-area">

                    <div class="server-id">
                        SERVER #${escapeHtml(server.id)}
                    </div>

                    <h3 class="server-name">
                        ${escapeHtml(server.name)}
                    </h3>

                    <div class="server-game">
                        ${escapeHtml(server.game)}
                    </div>

                </div>

                <span class="status ${statusClass}">
                    ${statusText}
                </span>

            </div>

            <div class="server-info">

                <div class="info-box">

                    <span class="info-label">
                        COUNTRY
                    </span>

                    <span class="info-value">
                        ${escapeHtml(
                            getCountry(server)
                        )}
                    </span>

                </div>

                <div class="info-box">

                    <span class="info-label">
                        MAP
                    </span>

                    <span class="info-value">
                        ${escapeHtml(
                            server.map ||
                            'Unavailable'
                        )}
                    </span>

                </div>

                <div class="info-box">

                    <span class="info-label">
                        PLAYERS
                    </span>

                    <span class="info-value">
                        ${Number(server.players || 0)}
                        /
                        ${Number(server.maxPlayers || 0)}
                    </span>

                </div>

                <div class="info-box">

                    <span class="info-label">
                        ADDRESS
                    </span>

                    <span class="info-value">
                        ${escapeHtml(
                            getAddress(server)
                        )}
                    </span>

                </div>

            </div>

            <div class="server-actions">

                <a
                    href="/servers/${encodeURIComponent(server.id)}"
                >
                    View Server
                </a>

                ${connectButton}

                ${discordButton}

            </div>

        </article>
    `;
}


/* =========================
   DASHBOARD STATS
========================= */

function updateStats() {
    const online =
        state.servers.filter(
            server =>
                server.online === true
        ).length;

    const offline =
        state.servers.length -
        online;

    const players =
        state.servers.reduce(
            (
                total,
                server
            ) =>
                total +
                Number(
                    server.players || 0
                ),
            0
        );

    onlineCount.textContent =
        String(online);

    offlineCount.textContent =
        String(offline);

    serverCount.textContent =
        String(state.servers.length);

    playerCount.textContent =
        String(players);
}


/* =========================
   FILTER / SEARCH / SORT
========================= */

function getVisibleServers() {
    let servers = [
        ...state.servers
    ];

    if (state.filter === 'online') {
        servers =
            servers.filter(
                server =>
                    server.online === true
            );
    }

    if (state.filter === 'offline') {
        servers =
            servers.filter(
                server =>
                    server.online !== true
            );
    }

    if (state.search) {
        const query =
            state.search.toLowerCase();

        servers =
            servers.filter(
                server => {
                    const haystack = [
                        server.name,
                        server.game,
                        server.host,
                        server.map,
                        server.countryCode,
                        String(server.id)
                    ]
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();

                    return haystack.includes(
                        query
                    );
                }
            );
    }

    switch (state.sort) {

        case 'players':
            servers.sort(
                (a, b) =>
                    Number(b.players || 0) -
                    Number(a.players || 0)
            );
            break;

        case 'name':
            servers.sort(
                (a, b) =>
                    String(a.name || '')
                        .localeCompare(
                            String(b.name || '')
                        )
            );
            break;

        case 'country':
            servers.sort(
                (a, b) =>
                    String(
                        a.countryCode || ''
                    ).localeCompare(
                        String(
                            b.countryCode || ''
                        )
                    )
            );
            break;

        default:
            servers.sort(
                (a, b) =>
                    Number(a.id || 0) -
                    Number(b.id || 0)
            );
            break;
    }

    return servers;
}


/* =========================
   RENDER SERVERS
========================= */

function renderServers() {
    const visibleServers =
        getVisibleServers();

    updateStats();

    resultSummary.textContent =
        `${visibleServers.length} of ${state.servers.length} servers`;

    if (!visibleServers.length) {
        serverList.className = '';

        serverList.innerHTML = `
            <div class="empty">
                No servers match your search or filter.
            </div>
        `;

        return;
    }

    serverList.className =
        'server-list';

    serverList.innerHTML =
        visibleServers
            .map(
                buildServerCard
            )
            .join('');
}


/* =========================
   COPY CONNECT
========================= */

async function copyConnectValue(value) {
    try {
        await navigator.clipboard.writeText(
            value
        );

        return true;
    } catch {
        return false;
    }
}


/* =========================
   LOAD SERVERS
========================= */

async function loadServers() {
    try {
        refreshButton.disabled = true;

        const response =
            await fetch(
                '/api/servers',
                {
                    cache: 'no-store'
                }
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        if (
            !data ||
            !Array.isArray(
                data.servers
            )
        ) {
            throw new Error(
                'Invalid server data'
            );
        }

        state.servers =
            data.servers;

        renderServers();

        lastUpdate.textContent =
            `Updated ${new Date().toLocaleTimeString()}`;

    } catch (error) {

        console.error(
            '[Dashboard] Failed to load servers:',
            error
        );

        serverList.className = '';

        serverList.innerHTML = `
            <div class="error">
                Failed to load Game Servers.
            </div>
        `;

        resultSummary.textContent =
            'Unable to load server data';

        lastUpdate.textContent =
            'Update failed';

    } finally {
        refreshButton.disabled = false;
    }
}


/* =========================
   SEARCH
========================= */

searchInput.addEventListener(
    'input',
    event => {
        state.search =
            event.target.value.trim();

        renderServers();
    }
);


/* =========================
   SORT
========================= */

sortSelect.addEventListener(
    'change',
    event => {
        state.sort =
            event.target.value;

        renderServers();
    }
);


/* =========================
   FILTER
========================= */

filterButtons.forEach(
    button => {
        button.addEventListener(
            'click',
            () => {
                state.filter =
                    button.dataset.filter;

                filterButtons.forEach(
                    item =>
                        item.classList.toggle(
                            'active',
                            item === button
                        )
                );

                renderServers();
            }
        );
    }
);


/* =========================
   MANUAL REFRESH
========================= */

refreshButton.addEventListener(
    'click',
    loadServers
);


/* =========================
   SERVER LIST EVENTS
========================= */

serverList.addEventListener(
    'click',
    async event => {
        const button =
            event.target.closest(
                '.copy-connect'
            );

        if (!button) {
            return;
        }

        const value =
            button.dataset.connect;

        if (!value) {
            return;
        }

        const copied =
            await copyConnectValue(
                value
            );

        const originalText =
            button.textContent;

        button.textContent =
            copied
                ? 'Copied'
                : 'Copy Failed';

        setTimeout(
            () => {
                button.textContent =
                    originalText;
            },
            1500
        );
    }
);


/* =========================
   START
========================= */

handleServerNotFoundNotification();

loadServers();

setInterval(
    loadServers,
    REFRESH_INTERVAL
);