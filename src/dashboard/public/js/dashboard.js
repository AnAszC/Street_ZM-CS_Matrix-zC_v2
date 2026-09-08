const REFRESH_INTERVAL = 10000;

const PAGE_SIZE_OPTIONS = [
    10,
    20,
    30,
    50,
    100
];

const DEFAULT_SERVERS_PER_PAGE = 20;

const RATE_LIMIT_RETRY_FALLBACK_MS = 10000;


/* =========================
   DASHBOARD STATE
========================= */

const state = {
    servers: [],
    filter: 'all',
    search: '',
    sort: 'default',
    currentPage: 1,
    serversPerPage:
        DEFAULT_SERVERS_PER_PAGE
};


/*
 * Prevent overlapping requests.
 *
 * This is important because the automatic
 * refresh runs every 10 seconds and the user
 * can also press Refresh manually.
 */
let isLoading = false;


/*
 * Stores the scheduled retry timeout when
 * the API responds with HTTP 429.
 */
let retryTimeoutId = null;


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


let paginationContainer = null;


/* =========================
   PAGE SIZE SELECTOR
========================= */

function createPageSizeSelector() {
    const existing =
        document.getElementById(
            'serversPerPageSelect'
        );

    if (existing) {
        return existing;
    }

    const select =
        document.createElement(
            'select'
        );

    select.id =
        'serversPerPageSelect';

    select.className =
        'page-size-select';

    select.setAttribute(
        'aria-label',
        'Servers per page'
    );

    for (
        const optionValue
        of PAGE_SIZE_OPTIONS
    ) {
        const option =
            document.createElement(
                'option'
            );

        option.value =
            String(optionValue);

        option.textContent =
            `${optionValue} / page`;

        if (
            optionValue ===
            DEFAULT_SERVERS_PER_PAGE
        ) {
            option.selected = true;
        }

        select.appendChild(
            option
        );
    }

    if (sortSelect) {
        sortSelect.insertAdjacentElement(
            'afterend',
            select
        );
    } else if (refreshButton) {
        refreshButton.insertAdjacentElement(
            'beforebegin',
            select
        );
    }

    select.addEventListener(
        'change',
        event => {
            const value =
                Number(
                    event.target.value
                );

            if (
                !PAGE_SIZE_OPTIONS.includes(
                    value
                )
            ) {
                return;
            }

            state.serversPerPage =
                value;

            resetPagination();

            renderServers();
        }
    );

    return select;
}


/* =========================
   HTML HELPERS
========================= */

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll(
            '&',
            '&amp;'
        )
        .replaceAll(
            '<',
            '&lt;'
        )
        .replaceAll(
            '>',
            '&gt;'
        )
        .replaceAll(
            '"',
            '&quot;'
        )
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
   PAGINATION HELPERS
========================= */

function getTotalPages(
    totalItems
) {
    return Math.max(
        1,
        Math.ceil(
            totalItems /
            state.serversPerPage
        )
    );
}


function ensurePaginationPage(
    totalItems
) {
    const totalPages =
        getTotalPages(
            totalItems
        );

    if (
        state.currentPage >
        totalPages
    ) {
        state.currentPage =
            totalPages;
    }

    if (
        state.currentPage <
        1
    ) {
        state.currentPage = 1;
    }

    return totalPages;
}


function getPaginatedServers(
    visibleServers
) {
    const totalPages =
        ensurePaginationPage(
            visibleServers.length
        );

    const startIndex =
        (
            state.currentPage -
            1
        ) *
        state.serversPerPage;

    const endIndex =
        startIndex +
        state.serversPerPage;

    return {
        servers:
            visibleServers.slice(
                startIndex,
                endIndex
            ),
        totalPages,
        startIndex,
        endIndex
    };
}


function createPaginationContainer() {
    if (paginationContainer) {
        return paginationContainer;
    }

    paginationContainer =
        document.createElement(
            'div'
        );

    paginationContainer.className =
        'server-pagination';

    paginationContainer.setAttribute(
        'aria-label',
        'Server pagination'
    );

    serverList.insertAdjacentElement(
        'afterend',
        paginationContainer
    );

    return paginationContainer;
}


function renderPagination(
    visibleCount
) {
    const container =
        createPaginationContainer();

    const totalPages =
        getTotalPages(
            visibleCount
        );

    ensurePaginationPage(
        visibleCount
    );

    if (
        visibleCount <=
        state.serversPerPage
    ) {
        container.innerHTML = '';

        container.classList.remove(
            'visible'
        );

        return;
    }

    const previousDisabled =
        state.currentPage <= 1;

    const nextDisabled =
        state.currentPage >=
        totalPages;

    let startPage =
        Math.max(
            1,
            state.currentPage - 2
        );

    let endPage =
        Math.min(
            totalPages,
            startPage + 4
        );

    if (
        endPage -
        startPage <
        4
    ) {
        startPage =
            Math.max(
                1,
                endPage - 4
            );
    }

    const pages = [];

    for (
        let page = startPage;
        page <= endPage;
        page++
    ) {
        pages.push(
            `
                <button
                    type="button"
                    class="pagination-page ${
                        page ===
                        state.currentPage
                            ? 'active'
                            : ''
                    }"
                    data-page="${page}"
                    ${
                        page ===
                        state.currentPage
                            ? 'aria-current="page"'
                            : ''
                    }
                >
                    ${page}
                </button>
            `
        );
    }

    const startIndex =
        (
            state.currentPage -
            1
        ) *
        state.serversPerPage;

    const currentStart =
        startIndex + 1;

    const currentEnd =
        Math.min(
            startIndex +
            state.serversPerPage,
            visibleCount
        );

    container.innerHTML = `
        <div class="pagination-info">

            Showing

            <strong>
                ${currentStart}-${currentEnd}
            </strong>

            of

            <strong>
                ${visibleCount}
            </strong>

            servers

        </div>

        <div class="pagination-controls">

            <button
                type="button"
                class="pagination-button"
                data-page-action="previous"
                ${
                    previousDisabled
                        ? 'disabled'
                        : ''
                }
            >
                ← Previous
            </button>

            <div class="pagination-pages">
                ${pages.join('')}
            </div>

            <button
                type="button"
                class="pagination-button"
                data-page-action="next"
                ${
                    nextDisabled
                        ? 'disabled'
                        : ''
                }
            >
                Next →
            </button>

        </div>
    `;

    container.classList.add(
        'visible'
    );
}


function resetPagination() {
    state.currentPage = 1;
}


/* =========================
   RENDER SERVERS
========================= */

function renderServers() {
    const visibleServers =
        getVisibleServers();

    updateStats();

    if (!visibleServers.length) {

        resultSummary.textContent =
            `0 of ${state.servers.length} servers`;

        serverList.className = '';

        serverList.innerHTML = `
            <div class="empty">
                No servers match your search or filter.
            </div>
        `;

        renderPagination(0);

        return;
    }

    const paginated =
        getPaginatedServers(
            visibleServers
        );

    const displayedServers =
        paginated.servers;

    const currentStart =
        paginated.startIndex + 1;

    const currentEnd =
        Math.min(
            paginated.startIndex +
                displayedServers.length,
            visibleServers.length
        );

    resultSummary.textContent =
        `${currentStart}-${currentEnd} of ${visibleServers.length} servers`;

    serverList.className =
        'server-list';

    serverList.innerHTML =
        displayedServers
            .map(
                buildServerCard
            )
            .join('');

    renderPagination(
        visibleServers.length
    );
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
   RATE LIMIT HELPERS
========================= */

function clearRateLimitRetry() {
    if (!retryTimeoutId) {
        return;
    }

    clearTimeout(
        retryTimeoutId
    );

    retryTimeoutId = null;
}


function scheduleRateLimitRetry(
    retryAfterSeconds
) {
    clearRateLimitRetry();

    let delayMs =
        RATE_LIMIT_RETRY_FALLBACK_MS;

    const parsedRetryAfter =
        Number(
            retryAfterSeconds
        );

    if (
        Number.isFinite(
            parsedRetryAfter
        ) &&
        parsedRetryAfter > 0
    ) {
        delayMs =
            Math.ceil(
                parsedRetryAfter * 1000
            );
    }

    const delaySeconds =
        Math.max(
            1,
            Math.ceil(
                delayMs / 1000
            )
        );

    lastUpdate.textContent =
        `Rate limit active. Retrying in ${delaySeconds}s`;

    retryTimeoutId =
        setTimeout(
            () => {
                retryTimeoutId = null;
                loadServers();
            },
            delayMs
        );
}


/* =========================
   LOAD SERVERS
========================= */

async function loadServers() {
    /*
     * Prevent overlapping requests.
     */
    if (isLoading) {
        return;
    }

    isLoading = true;

    try {
        refreshButton.disabled = true;

        const response =
            await fetch(
                '/api/servers',
                {
                    cache: 'no-store'
                }
            );

        /*
         * Handle HTTP 429 separately.
         *
         * Existing server data remains visible.
         */
        if (
            response.status === 429
        ) {
            let retryAfter =
                response.headers.get(
                    'Retry-After'
                );

            try {
                const data =
                    await response.json();

                if (
                    data &&
                    data.retryAfter != null
                ) {
                    retryAfter =
                        data.retryAfter;
                }
            } catch {
                /*
                 * The Retry-After header is enough.
                 */
            }

            scheduleRateLimitRetry(
                retryAfter
            );

            return;
        }

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

        clearRateLimitRetry();

        state.servers =
            data.servers;

        const visibleServers =
            getVisibleServers();

        ensurePaginationPage(
            visibleServers.length
        );

        renderServers();

        lastUpdate.textContent =
            `Updated ${new Date().toLocaleTimeString()}`;

    } catch (error) {

        console.error(
            '[Dashboard] Failed to load servers:',
            error
        );

        /*
         * Keep the previous valid data when
         * a temporary request error occurs.
         */
        if (
            state.servers.length > 0
        ) {
            renderServers();

            lastUpdate.textContent =
                'Update failed — keeping previous data';

        } else {
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

            if (paginationContainer) {
                paginationContainer.innerHTML =
                    '';

                paginationContainer.classList.remove(
                    'visible'
                );
            }
        }

    } finally {

        isLoading = false;

        refreshButton.disabled =
            false;
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

        resetPagination();

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

        resetPagination();

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

                resetPagination();

                renderServers();
            }
        );
    }
);


/* =========================
   PAGINATION EVENTS
========================= */

document.addEventListener(
    'click',
    event => {

        const pageButton =
            event.target.closest(
                '.pagination-page'
            );

        if (pageButton) {

            const page =
                Number(
                    pageButton.dataset.page
                );

            if (
                Number.isInteger(page) &&
                page >= 1
            ) {
                state.currentPage =
                    page;

                renderServers();
            }

            return;
        }

        const actionButton =
            event.target.closest(
                '[data-page-action]'
            );

        if (!actionButton) {
            return;
        }

        const action =
            actionButton.dataset.pageAction;

        const visibleServers =
            getVisibleServers();

        const totalPages =
            getTotalPages(
                visibleServers.length
            );

        if (
            action ===
            'previous'
        ) {
            state.currentPage =
                Math.max(
                    1,
                    state.currentPage - 1
                );
        }

        if (
            action ===
            'next'
        ) {
            state.currentPage =
                Math.min(
                    totalPages,
                    state.currentPage + 1
                );
        }

        renderServers();
    }
);


/* =========================
   MANUAL REFRESH
========================= */

refreshButton.addEventListener(
    'click',
    () => {
        loadServers();
    }
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

createPageSizeSelector();

handleServerNotFoundNotification();

loadServers();

setInterval(
    () => {
        loadServers();
    },
    REFRESH_INTERVAL
);