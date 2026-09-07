const REFRESH_INTERVAL = 10000;

const serverId =
    window.location.pathname
        .split('/')
        .filter(Boolean)
        .pop();

const serverContent =
    document.getElementById(
        'serverContent'
    );

const lastUpdate =
    document.getElementById(
        'lastUpdate'
    );


/* =========================
   STATE
========================= */

let liveServerData = null;
let statisticsData = null;
let selectedPlayerRange = '24h';


/* =========================
   HELPERS
========================= */

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
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


function getAddress(server) {
    if (
        server.host &&
        server.port
    ) {
        return `${server.host}:${server.port}`;
    }

    return (
        server.connect ||
        'Unknown'
    );
}


function getServerTitle(name) {
    const value =
        String(
            name ??
            'Unknown Game Server'
        ).trim();

    return value.startsWith('#')
        ? value.slice(1).trim()
        : value;
}


function calculatePlayerPercentage(
    players,
    maxPlayers
) {
    const current =
        Number(players) || 0;

    const maximum =
        Number(maxPlayers) || 0;

    if (maximum <= 0) {
        return 0;
    }

    return Math.min(
        100,
        Math.max(
            0,
            (current / maximum) * 100
        )
    );
}


function formatDuration(totalSeconds) {
    const seconds =
        Math.max(
            0,
            Number(totalSeconds) || 0
        );

    const totalMinutes =
        Math.floor(
            seconds / 60
        );

    const hours =
        Math.floor(
            totalMinutes / 60
        );

    const minutes =
        totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${String(
            minutes
        ).padStart(2, '0')}m`;
    }

    return `${minutes}m`;
}


function formatScore(score) {
    return (
        score === null ||
        score === undefined
    )
        ? '—'
        : String(score);
}


function formatDateTime(value) {
    if (!value) {
        return '—';
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return '—';
    }

    return date.toLocaleString();
}


/* =========================
   PLAYER STATS LOOKUP
========================= */

function buildPlayerStatsMap() {
    const map =
        new Map();

    if (
        !statisticsData ||
        !Array.isArray(
            statisticsData.onlinePlayers
        )
    ) {
        return map;
    }

    for (
        const player
        of statisticsData.onlinePlayers
    ) {
        const key =
            String(
                player.name || ''
            )
                .trim()
                .toLowerCase()
                .replace(
                    /\s+/g,
                    ' '
                );

        if (key) {
            map.set(
                key,
                player
            );
        }
    }

    return map;
}


function findHistoricalPlayer(
    playerName,
    playerStatsMap
) {
    const key =
        String(
            playerName || ''
        )
            .trim()
            .toLowerCase()
            .replace(
                /\s+/g,
                ' '
            );

    return (
        playerStatsMap.get(
            key
        ) ||
        null
    );
}


/* =========================
   SVG CHART HELPERS
========================= */

function buildLineChart(
    points,
    valueKey,
    options = {}
) {
    const width = 900;
    const height = 280;

    const paddingLeft = 52;
    const paddingRight = 18;
    const paddingTop = 20;
    const paddingBottom = 38;

    const usableWidth =
        width -
        paddingLeft -
        paddingRight;

    const usableHeight =
        height -
        paddingTop -
        paddingBottom;

    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return `
            <div class="chart-empty">
                No historical data available yet.
            </div>
        `;
    }

    const values =
        points.map(
            point =>
                Number(
                    point[valueKey]
                ) || 0
        );

    const maxValue =
        Math.max(
            1,
            ...(options.maxValue !== undefined
                ? [Number(options.maxValue)]
                : values)
        );

    const minValue =
        options.minValue !== undefined
            ? Number(
                options.minValue
            )
            : 0;

    const valueRange =
        Math.max(
            1,
            maxValue -
            minValue
        );

    function getX(index) {
        if (
            points.length === 1
        ) {
            return (
                paddingLeft +
                usableWidth / 2
            );
        }

        return (
            paddingLeft +
            (
                index /
                (points.length - 1)
            ) *
            usableWidth
        );
    }

    function getY(value) {
        const normalized =
            (
                value -
                minValue
            ) /
            valueRange;

        return (
            paddingTop +
            usableHeight -
            (
                normalized *
                usableHeight
            )
        );
    }

    const coordinates =
        values.map(
            (
                value,
                index
            ) => ({
                x: getX(index),
                y: getY(value),
                value,
                point: points[index]
            })
        );

    const polyline =
        coordinates
            .map(
                point =>
                    `${point.x},${point.y}`
            )
            .join(' ');

    const areaPoints = [
        `${paddingLeft},${paddingTop + usableHeight}`,
        ...coordinates.map(
            point =>
                `${point.x},${point.y}`
        ),
        `${
            paddingLeft +
            usableWidth
        },${
            paddingTop +
            usableHeight
        }`
    ].join(' ');

    const gridLines = 4;

    let grid = '';

    for (
        let index = 0;
        index <= gridLines;
        index += 1
    ) {
        const ratio =
            index / gridLines;

        const y =
            paddingTop +
            usableHeight -
            ratio *
            usableHeight;

        const value =
            minValue +
            ratio *
            valueRange;

        grid += `
            <line
                x1="${paddingLeft}"
                y1="${y}"
                x2="${paddingLeft + usableWidth}"
                y2="${y}"
                class="chart-grid-line"
            ></line>

            <text
                x="${paddingLeft - 9}"
                y="${y + 4}"
                class="chart-axis-label"
                text-anchor="end"
            >
                ${escapeHtml(
                    Math.round(value)
                )}
            </text>
        `;
    }

    const firstPoint =
        coordinates[0];

    const lastPoint =
        coordinates[
            coordinates.length - 1
        ];

    return `
        <div class="chart-wrap">

            <svg
                class="history-chart"
                viewBox="0 0 ${width} ${height}"
                preserveAspectRatio="none"
                role="img"
                aria-label="${escapeHtml(
                    options.ariaLabel ||
                    'Historical chart'
                )}"
            >

                ${grid}

                <polygon
                    points="${areaPoints}"
                    class="chart-area"
                ></polygon>

                <polyline
                    points="${polyline}"
                    class="chart-line"
                ></polyline>

                ${
                    coordinates.length <= 80
                        ? coordinates.map(
                            point => `
                                <circle
                                    cx="${point.x}"
                                    cy="${point.y}"
                                    r="2.8"
                                    class="chart-point"
                                >
                                    <title>
                                        ${escapeHtml(
                                            formatDateTime(
                                                point.point.recorded_at ||
                                                point.point.recordedAt
                                            )
                                        )}
                                        — ${escapeHtml(
                                            point.value
                                        )}
                                    </title>
                                </circle>
                            `
                        ).join('')
                        : ''
                }

                <text
                    x="${firstPoint.x}"
                    y="${height - 10}"
                    class="chart-axis-label"
                    text-anchor="start"
                >
                    ${escapeHtml(
                        formatDateTime(
                            firstPoint.point.recorded_at ||
                            firstPoint.point.recordedAt
                        )
                    )}
                </text>

                <text
                    x="${lastPoint.x}"
                    y="${height - 10}"
                    class="chart-axis-label"
                    text-anchor="end"
                >
                    ${escapeHtml(
                        formatDateTime(
                            lastPoint.point.recorded_at ||
                            lastPoint.point.recordedAt
                        )
                    )}
                </text>

            </svg>

        </div>
    `;
}


function buildRankChart(
    points
) {
    const width = 900;
    const height = 280;

    const paddingLeft = 52;
    const paddingRight = 18;
    const paddingTop = 20;
    const paddingBottom = 38;

    const usableWidth =
        width -
        paddingLeft -
        paddingRight;

    const usableHeight =
        height -
        paddingTop -
        paddingBottom;

    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return `
            <div class="chart-empty">
                No rank history available yet.
            </div>
        `;
    }

    const ranks =
        points.map(
            point =>
                Math.max(
                    1,
                    Number(
                        point.rank
                    ) || 1
                )
        );

    const maxRank =
        Math.max(
            2,
            ...ranks
        );

    function getX(index) {
        if (
            points.length === 1
        ) {
            return (
                paddingLeft +
                usableWidth / 2
            );
        }

        return (
            paddingLeft +
            (
                index /
                (points.length - 1)
            ) *
            usableWidth
        );
    }

    function getY(rank) {
        const normalized =
            (
                rank - 1
            ) /
            Math.max(
                1,
                maxRank - 1
            );

        return (
            paddingTop +
            normalized *
            usableHeight
        );
    }

    const coordinates =
        ranks.map(
            (
                rank,
                index
            ) => ({
                x: getX(index),
                y: getY(rank),
                rank,
                point: points[index]
            })
        );

    const polyline =
        coordinates
            .map(
                point =>
                    `${point.x},${point.y}`
            )
            .join(' ');

    const gridLines = 4;

    let grid = '';

    for (
        let index = 0;
        index <= gridLines;
        index += 1
    ) {
        const ratio =
            index / gridLines;

        const y =
            paddingTop +
            ratio *
            usableHeight;

        const rankValue =
            Math.max(
                1,
                Math.round(
                    1 +
                    ratio *
                    (
                        maxRank -
                        1
                    )
                )
            );

        grid += `
            <line
                x1="${paddingLeft}"
                y1="${y}"
                x2="${paddingLeft + usableWidth}"
                y2="${y}"
                class="chart-grid-line"
            ></line>

            <text
                x="${paddingLeft - 9}"
                y="${y + 4}"
                class="chart-axis-label"
                text-anchor="end"
            >
                #${rankValue}
            </text>
        `;
    }

    return `
        <div class="chart-wrap">

            <svg
                class="history-chart"
                viewBox="0 0 ${width} ${height}"
                preserveAspectRatio="none"
                role="img"
                aria-label="Server rank history"
            >

                ${grid}

                <polyline
                    points="${polyline}"
                    class="rank-chart-line"
                ></polyline>

                ${
                    coordinates.length <= 80
                        ? coordinates.map(
                            point => `
                                <circle
                                    cx="${point.x}"
                                    cy="${point.y}"
                                    r="3"
                                    class="chart-point"
                                >
                                    <title>
                                        ${escapeHtml(
                                            formatDateTime(
                                                point.point.recordedAt
                                            )
                                        )}
                                        — #${escapeHtml(
                                            point.rank
                                        )}
                                    </title>
                                </circle>
                            `
                        ).join('')
                        : ''
                }

            </svg>

        </div>
    `;
}


/* =========================
   HISTORICAL SECTIONS
========================= */

function buildPlayersHistory(
    history
) {
    return `
        <section class="statistics-section">

            <div class="statistics-section-header">

                <div>
                    <div class="statistics-eyebrow">
                        HISTORICAL DATA
                    </div>

                    <h2>
                        PLAYERS
                    </h2>

                    <div class="statistics-subtitle">
                        Historical player count
                    </div>
                </div>

                <div class="statistics-tabs">

                    <button
                        type="button"
                        class="statistics-tab ${
                            selectedPlayerRange === '24h'
                                ? 'active'
                                : ''
                        }"
                        data-player-range="24h"
                    >
                        24 HOURS
                    </button>

                    <button
                        type="button"
                        class="statistics-tab ${
                            selectedPlayerRange === '7d'
                                ? 'active'
                                : ''
                        }"
                        data-player-range="7d"
                    >
                        7 DAYS
                    </button>

                    <button
                        type="button"
                        class="statistics-tab ${
                            selectedPlayerRange === '30d'
                                ? 'active'
                                : ''
                        }"
                        data-player-range="30d"
                    >
                        30 DAYS
                    </button>

                </div>

            </div>

            ${buildLineChart(
                history || [],
                'players',
                {
                    maxValue:
                        history?.length
                            ? Math.max(
                                1,
                                ...history.map(
                                    point =>
                                        Number(
                                            point.max_players
                                        ) || 0
                                )
                            )
                            : 1,
                    ariaLabel:
                        'Player history'
                }
            )}

        </section>
    `;
}


function buildFavoriteMaps(
    maps
) {
    if (
        !Array.isArray(maps) ||
        maps.length === 0
    ) {
        return `
            <section class="statistics-section">

                <div class="statistics-section-header">
                    <div>
                        <div class="statistics-eyebrow">
                            HISTORICAL DATA
                        </div>

                        <h2>
                            FAVORITE MAPS
                        </h2>

                        <div class="statistics-subtitle">
                            PAST WEEK
                        </div>
                    </div>
                </div>

                <div class="statistics-empty">
                    No map history available yet.
                </div>

            </section>
        `;
    }

    const maxPercentage =
        Math.max(
            1,
            ...maps.map(
                map =>
                    Number(
                        map.percentage
                    ) || 0
            )
        );

    return `
        <section class="statistics-section">

            <div class="statistics-section-header">

                <div>

                    <div class="statistics-eyebrow">
                        HISTORICAL DATA
                    </div>

                    <h2>
                        FAVORITE MAPS
                    </h2>

                    <div class="statistics-subtitle">
                        PAST WEEK
                    </div>

                </div>

            </div>


            <div class="favorite-maps-list">

                ${maps.map(
                    map => {
                        const percentage =
                            Number(
                                map.percentage
                            ) || 0;

                        const width =
                            (
                                percentage /
                                maxPercentage
                            ) * 100;

                        return `
                            <div class="favorite-map-row">

                                <div class="favorite-map-meta">

                                    <span class="favorite-map-name">
                                        ${escapeHtml(
                                            map.map
                                        )}
                                    </span>

                                    <span class="favorite-map-value">
                                        ${percentage.toFixed(
                                            1
                                        )}%
                                    </span>

                                </div>

                                <div class="favorite-map-bar">

                                    <div
                                        class="favorite-map-fill"
                                        style="width: ${width}%"
                                    ></div>

                                </div>

                            </div>
                        `;
                    }
                ).join('')}

            </div>

        </section>
    `;
}


function buildServerRank(
    rankData
) {
    const current =
        rankData?.current;

    const score =
        rankData?.score;

    const history =
        Array.isArray(
            rankData?.history
        )
            ? rankData.history
            : [];

    return `
        <section class="statistics-section">

            <div class="statistics-section-header">

                <div>

                    <div class="statistics-eyebrow">
                        HISTORICAL DATA
                    </div>

                    <h2>
                        SERVER RANK
                    </h2>

                    <div class="statistics-subtitle">
                        PAST 30 DAYS · CSMatrix-zC WORLD
                    </div>

                </div>

                <div class="rank-current">

                    <span>
                        CURRENT
                    </span>

                    <strong>
                        ${
                            current !== null &&
                            current !== undefined
                                ? `#${escapeHtml(current)}`
                                : '—'
                        }
                    </strong>

                </div>

            </div>


            <div class="rank-summary">

                <div class="rank-summary-box">

                    <span>
                        CURRENT RANK
                    </span>

                    <strong>
                        ${
                            current !== null &&
                            current !== undefined
                                ? `#${escapeHtml(current)}`
                                : '—'
                        }
                    </strong>

                </div>

                <div class="rank-summary-box">

                    <span>
                        RANK SCORE
                    </span>

                    <strong>
                        ${
                            score !== null &&
                            score !== undefined
                                ? Number(
                                    score
                                ).toFixed(3)
                                : '—'
                        }
                    </strong>

                </div>

                <div class="rank-summary-box">

                    <span>
                        DATA POINTS
                    </span>

                    <strong>
                        ${history.length}
                    </strong>

                </div>

            </div>


            ${buildRankChart(
                history
            )}

        </section>
    `;
}


/* =========================
   ONLINE PLAYERS
========================= */

function buildOnlinePlayers(
    server,
    playerStatsMap
) {
    const players =
        Array.isArray(
            server.playerList
        )
            ? server.playerList
            : [];

    if (
        players.length === 0
    ) {
        return `
            <section class="statistics-section">

                <div class="statistics-section-header">

                    <div>

                        <div class="statistics-eyebrow">
                            LIVE
                        </div>

                        <h2>
                            ONLINE PLAYERS
                        </h2>

                    </div>

                </div>

                <div class="statistics-empty">
                    No players currently online.
                </div>

            </section>
        `;
    }

    return `
        <section class="statistics-section">

            <div class="statistics-section-header">

                <div>

                    <div class="statistics-eyebrow">
                        LIVE
                    </div>

                    <h2>
                        ONLINE PLAYERS
                    </h2>

                    <div class="statistics-subtitle">
                        ${players.length} online ${
                            players.length === 1
                                ? 'player'
                                : 'players'
                        }
                    </div>

                </div>

            </div>


            <div class="players-table-wrap">

                <table class="players-table">

                    <thead>

                        <tr>
                            <th>RANK</th>
                            <th>NAME</th>
                            <th>SCORE</th>
                            <th>TIME PLAYED</th>
                        </tr>

                    </thead>

                    <tbody>

                        ${players.map(
                            (
                                playerName,
                                index
                            ) => {

                                const stats =
                                    findHistoricalPlayer(
                                        playerName,
                                        playerStatsMap
                                    );

                                return `
                                    <tr>

                                        <td>
                                            <span class="table-rank">
                                                ${index + 1}
                                            </span>
                                        </td>

                                        <td>
                                            <span class="table-player-name">
                                                ${escapeHtml(
                                                    playerName
                                                )}
                                            </span>
                                        </td>

                                        <td>
                                            <span class="table-score">
                                                ${formatScore(
                                                    stats?.score
                                                )}
                                            </span>
                                        </td>

                                        <td>
                                            <span class="table-time">
                                                ${formatDuration(
                                                    stats?.totalSeconds
                                                )}
                                            </span>
                                        </td>

                                    </tr>
                                `;
                            }
                        ).join('')}

                    </tbody>

                </table>

            </div>

        </section>
    `;
}


/* =========================
   TOP 10 PLAYERS
========================= */

function buildTopPlayers(
    players
) {
    if (
        !Array.isArray(players) ||
        players.length === 0
    ) {
        return `
            <section class="statistics-section">

                <div class="statistics-section-header">

                    <div>

                        <div class="statistics-eyebrow">
                            HISTORICAL
                        </div>

                        <h2>
                            TOP 10 PLAYERS
                        </h2>

                        <div class="statistics-subtitle">
                            ONLINE & OFFLINE
                        </div>

                    </div>

                </div>

                <div class="statistics-empty">
                    No player statistics available yet.
                </div>

            </section>
        `;
    }

    return `
        <section class="statistics-section">

            <div class="statistics-section-header">

                <div>

                    <div class="statistics-eyebrow">
                        HISTORICAL
                    </div>

                    <h2>
                        TOP 10 PLAYERS
                    </h2>

                    <div class="statistics-subtitle">
                        ONLINE & OFFLINE
                    </div>

                </div>

            </div>


            <div class="players-table-wrap">

                <table class="players-table">

                    <thead>

                        <tr>
                            <th>RANK</th>
                            <th>NAME</th>
                            <th>SCORE</th>
                            <th>TIME PLAYED</th>
                        </tr>

                    </thead>

                    <tbody>

                        ${players.map(
                            (
                                player,
                                index
                            ) => `
                                <tr>

                                    <td>
                                        <span class="table-rank">
                                            ${index + 1}
                                        </span>
                                    </td>

                                    <td>
                                        <span class="table-player-name">
                                            ${escapeHtml(
                                                player.name
                                            )}
                                        </span>
                                    </td>

                                    <td>
                                        <span class="table-score">
                                            ${formatScore(
                                                player.score
                                            )}
                                        </span>
                                    </td>

                                    <td>
                                        <span class="table-time">
                                            ${formatDuration(
                                                player.totalSeconds
                                            )}
                                        </span>
                                    </td>

                                </tr>
                            `
                        ).join('')}

                    </tbody>

                </table>

            </div>


            <div class="players-table-footer">
                Showing top ${players.length} players
            </div>

        </section>
    `;
}


/* =========================
   PLAYER RANGE
========================= */

function getSelectedHistory() {
    if (
        !statisticsData ||
        !statisticsData.players
    ) {
        return [];
    }

    return (
        statisticsData.players[
            selectedPlayerRange
        ] ||
        []
    );
}


function bindPlayerRangeButtons() {
    const buttons =
        document.querySelectorAll(
            '[data-player-range]'
        );

    buttons.forEach(
        button => {
            button.addEventListener(
                'click',
                () => {

                    selectedPlayerRange =
                        button.dataset.playerRange;

                    const historyContainer =
                        document.getElementById(
                            'playersHistory'
                        );

                    if (!historyContainer) {
                        return;
                    }

                    historyContainer.innerHTML =
                        buildPlayersHistory(
                            getSelectedHistory()
                        );

                    bindPlayerRangeButtons();
                }
            );
        }
    );
}


/* =========================
   SERVER PAGE
========================= */

function buildServerPage(
    data
) {
    const server =
        data.server;

    const isOnline =
        server.online === true;

    const statusClass =
        isOnline
            ? 'online'
            : 'offline';

    const statusText =
        isOnline
            ? 'ONLINE'
            : 'OFFLINE';

    const players =
        Number(
            server.players
        ) || 0;

    const maxPlayers =
        Number(
            server.maxPlayers
        ) || 0;

    const bots =
        Number(
            server.bots
        ) || 0;

    const ping =
        server.ping !== null &&
        server.ping !== undefined
            ? `${server.ping} ms`
            : '—';

    const address =
        getAddress(server);

    const playerPercentage =
        calculatePlayerPercentage(
            players,
            maxPlayers
        );

    const country =
        getCountry(server);

    const serverTitle =
        getServerTitle(
            server.name
        );

    const discordButton =
        server.discordInvite
            ? `
                <a
                    href="${escapeHtml(
                        server.discordInvite
                    )}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Discord
                </a>
            `
            : '';

    const playerStatsMap =
        buildPlayerStatsMap();


    return `
        <article class="server-hero">

            <div class="server-detail-header">

                <div>

                    <div class="server-detail-id">
                        SERVER #${escapeHtml(
                            server.id
                        )}
                    </div>

                    <h1 class="server-detail-title">
                        ${escapeHtml(
                            serverTitle
                        )}
                    </h1>

                    <div class="server-detail-game">
                        ${escapeHtml(
                            server.game
                        )}
                    </div>

                </div>


                <div class="server-status-wrap">

                    <div class="server-status ${statusClass}">

                        <span
                            class="server-status-dot"
                        ></span>

                        <span>
                            ${statusText}
                        </span>

                    </div>

                </div>

            </div>


            <div class="server-detail-address">
                ${escapeHtml(address)}
            </div>


            <div class="server-detail-grid">

                <div class="server-detail-box">

                    <span class="server-detail-box-label">
                        COUNTRY
                    </span>

                    <span class="server-detail-box-value">
                        ${escapeHtml(country)}
                    </span>

                </div>


                <div class="server-detail-box">

                    <span class="server-detail-box-label">
                        MAP
                    </span>

                    <span class="server-detail-box-value">
                        ${escapeHtml(
                            server.map ||
                            'Unavailable'
                        )}
                    </span>

                </div>


                <div class="server-detail-box">

                    <span class="server-detail-box-label">
                        PLAYERS
                    </span>

                    <span class="server-detail-box-value">
                        ${players} / ${maxPlayers}
                    </span>

                </div>


                <div class="server-detail-box">

                    <span class="server-detail-box-label">
                        BOTS
                    </span>

                    <span class="server-detail-box-value">
                        ${bots}
                    </span>

                </div>


                <div class="server-detail-box">

                    <span class="server-detail-box-label">
                        PING
                    </span>

                    <span class="server-detail-box-value">
                        ${escapeHtml(ping)}
                    </span>

                </div>


                <div class="server-detail-box">

                    <span class="server-detail-box-label">
                        ADDRESS
                    </span>

                    <span class="server-detail-box-value">
                        ${escapeHtml(address)}
                    </span>

                </div>

            </div>


            <div class="player-capacity">

                <div class="player-capacity-header">

                    <div class="player-capacity-title">
                        SERVER CAPACITY
                    </div>

                    <div class="player-capacity-value">
                        ${players} / ${maxPlayers}
                    </div>

                </div>


                <div class="player-capacity-bar">

                    <div
                        class="player-capacity-fill"
                        style="width: ${playerPercentage}%"
                    ></div>

                </div>


                <div class="player-capacity-percent">
                    ${Math.round(
                        playerPercentage
                    )}% occupied
                </div>

            </div>


            <div class="server-detail-actions">

                <button
                    type="button"
                    id="copyConnect"
                    data-connect="${escapeHtml(
                        server.connect || ''
                    )}"
                >
                    Copy Connect
                </button>

                ${discordButton}

            </div>

        </article>


        <section class="players-section">

            <div class="players-section-header">

                <div>

                    <h2>
                        Players
                    </h2>

                    <div class="players-count">
                        ${players}
                        online
                        ${
                            players === 1
                                ? 'player'
                                : 'players'
                        }
                    </div>

                </div>

            </div>


            ${
                Array.isArray(
                    server.playerList
                ) &&
                server.playerList.length
                    ? `
                        <div class="players-list">

                            ${server.playerList.map(
                                (
                                    player,
                                    index
                                ) => `
                                    <div class="player-row">

                                        <div class="player-number">
                                            ${
                                                index + 1
                                            }
                                        </div>

                                        <div class="player-name">
                                            ${escapeHtml(
                                                player
                                            )}
                                        </div>

                                    </div>
                                `
                            ).join('')}

                        </div>
                    `
                    : `
                        <div class="no-players">
                            No players currently online.
                        </div>
                    `
            }

        </section>


        <div id="playersHistory">
            ${buildPlayersHistory(
                getSelectedHistory()
            )}
        </div>


        ${buildFavoriteMaps(
            statisticsData?.favoriteMaps || []
        )}


        ${buildServerRank(
            statisticsData?.serverRank || {}
        )}


        ${buildOnlinePlayers(
            server,
            playerStatsMap
        )}


        ${buildTopPlayers(
            statisticsData?.topPlayers || []
        )}
    `;
}


/* =========================
   LIVE SERVER API
========================= */

async function loadLiveServer() {
    const response =
        await fetch(
            `/api/servers/${encodeURIComponent(
                serverId
            )}`,
            {
                cache: 'no-store'
            }
        );

    if (response.status === 404) {
        const error =
            new Error(
                'Game Server not found'
            );

        error.code =
            'SERVER_NOT_FOUND';

        throw error;
    }

    if (!response.ok) {
        throw new Error(
            `Live API HTTP ${response.status}`
        );
    }

    const data =
        await response.json();

    if (
        !data.success ||
        !data.server
    ) {
        throw new Error(
            'Invalid live server response'
        );
    }

    return data;
}


/* =========================
   STATISTICS API
========================= */

async function loadStatistics() {
    const response =
        await fetch(
            `/api/servers/${encodeURIComponent(
                serverId
            )}/statistics`,
            {
                cache: 'no-store'
            }
        );

    if (!response.ok) {
        throw new Error(
            `Statistics API HTTP ${response.status}`
        );
    }

    const data =
        await response.json();

    if (
        !data.success
    ) {
        throw new Error(
            'Invalid statistics response'
        );
    }

    return data;
}


/* =========================
   COPY CONNECT
========================= */

function bindCopyButton() {
    const copyButton =
        document.getElementById(
            'copyConnect'
        );

    copyButton?.addEventListener(
        'click',
        async () => {
            const value =
                copyButton.dataset
                    .connect;

            if (!value) {
                return;
            }

            const originalText =
                copyButton.textContent;

            try {
                await navigator
                    .clipboard
                    .writeText(value);

                copyButton.textContent =
                    'Copied';

                setTimeout(
                    () => {
                        copyButton.textContent =
                            originalText;
                    },
                    1500
                );

            } catch (error) {

                console.error(
                    '[Dashboard] Copy failed:',
                    error
                );

                try {
                    const textarea =
                        document.createElement(
                            'textarea'
                        );

                    textarea.value =
                        value;

                    textarea.style.position =
                        'fixed';

                    textarea.style.opacity =
                        '0';

                    document.body.appendChild(
                        textarea
                    );

                    textarea.focus();
                    textarea.select();

                    document.execCommand(
                        'copy'
                    );

                    textarea.remove();

                    copyButton.textContent =
                        'Copied';

                    setTimeout(
                        () => {
                            copyButton.textContent =
                                originalText;
                        },
                        1500
                    );

                } catch {
                    copyButton.textContent =
                        'Copy Failed';

                    setTimeout(
                        () => {
                            copyButton.textContent =
                                originalText;
                        },
                        1500
                    );
                }
            }
        }
    );
}


/* =========================
   LOAD PAGE
========================= */

async function loadServer() {
    try {
        if (!serverId) {
            throw new Error(
                'Missing server ID'
            );
        }

        /*
         * First load the live server data.
         * We intentionally do this before loading
         * statistics so deleted servers do not trigger
         * a second unnecessary 404 request.
         */
        const liveData =
            await loadLiveServer();

        /*
         * The server exists, so statistics can now
         * be loaded safely.
         */
        const historicalData =
            await loadStatistics();

        liveServerData =
            liveData.server;

        statisticsData =
            historicalData;

        serverContent.innerHTML =
            buildServerPage(
                liveData
            );

        lastUpdate.textContent =
            `Updated ${
                new Date(
                    liveData.timestamp ||
                    Date.now()
                ).toLocaleTimeString()
            }`;

        bindCopyButton();

        bindPlayerRangeButtons();

    } catch (error) {

        if (
            error?.code ===
            'SERVER_NOT_FOUND'
        ) {
            window.location.replace(
                `/?serverNotFound=${encodeURIComponent(
                    serverId
                )}`
            );

            return;
        }

        serverContent.innerHTML = `
            <div class="error">
                Failed to load this Game Server.
            </div>
        `;

        lastUpdate.textContent =
            'Update failed';
    }
}


/* =========================
   START
========================= */

loadServer();

setInterval(
    loadServer,
    REFRESH_INTERVAL
);