import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import express from 'express';

import {
    getPlayerHistory,
    getFavoriteMaps,
    getServerRankHistory,
    getCurrentServerRank,
    getOnlinePlayerStats,
    getTopPlayers
} from '../services/gameServers/serverStatisticsDatabase.js';

import {
    getMonitoredGameServers
} from '../services/gameServers/gameServerDatabase.js';

import {
    fetchServerInfo
} from '../services/gameServers/gameQueryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dashboardPublicPath = path.join(
    __dirname,
    'public'
);

// ========================================
// Dashboard API Rate Limit
// ========================================

const rateState = new Map();

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 60;

function getClientIp(req) {
    return (
        req.ip ||
        req.headers['x-forwarded-for']
            ?.split(',')[0]
            ?.trim() ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

function dashboardRateLimit(req, res, next) {
    const now = Date.now();
    const ip = getClientIp(req);

    let state = rateState.get(ip);

    if (!state || state.resetAt <= now) {
        state = {
            count: 0,
            resetAt: now + RATE_WINDOW_MS
        };

        rateState.set(ip, state);
    }

    state.count += 1;

    if (state.count > RATE_MAX_REQUESTS) {
        const retryAfter = Math.max(
            1,
            Math.ceil(
                (state.resetAt - now) / 1000
            )
        );

        res.setHeader(
            'Retry-After',
            String(retryAfter)
        );

        return res.status(429).json({
            error: 'Too many dashboard requests',
            retryAfter
        });
    }

    next();
}

function cleanupRateState() {
    const now = Date.now();

    for (const [ip, state] of rateState.entries()) {
        if (state.resetAt <= now) {
            rateState.delete(ip);
        }
    }
}

// ========================================
// Host / Port Helpers
// ========================================

function normalizeHost(host) {
    const value = String(host || '').trim();

    if (!value) {
        return null;
    }

    // IPv6 in [address]:port format
    if (value.startsWith('[')) {
        const closingBracket = value.indexOf(']');

        if (closingBracket !== -1) {
            return value.slice(
                1,
                closingBracket
            );
        }
    }

    // Plain IP
    if (net.isIP(value)) {
        return value;
    }

    // IPv4:PORT
    const ipv4PortMatch = value.match(
        /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/
    );

    if (ipv4PortMatch) {
        return ipv4PortMatch[1];
    }

    // hostname:PORT
    const hostnamePortMatch = value.match(
        /^(.+):\d+$/
    );

    if (hostnamePortMatch) {
        return hostnamePortMatch[1];
    }

    return value;
}

function normalizePort(server) {
    const explicitPort = Number(server?.port);

    if (
        Number.isInteger(explicitPort) &&
        explicitPort > 0 &&
        explicitPort <= 65535
    ) {
        return explicitPort;
    }

    const host = String(
        server?.host ||
        server?.ip ||
        ''
    ).trim();

    const portMatch = host.match(
        /:(\d+)$/
    );

    if (portMatch) {
        const parsedPort = Number(
            portMatch[1]
        );

        if (
            Number.isInteger(parsedPort) &&
            parsedPort > 0 &&
            parsedPort <= 65535
        ) {
            return parsedPort;
        }
    }

    return null;
}

function buildAddress(host, port) {
    if (!host) {
        return null;
    }

    if (!port) {
        return host;
    }

    // IPv6
    if (net.isIP(host) === 6) {
        return `[${host}]:${port}`;
    }

    return `${host}:${port}`;
}

// ========================================
// Game Server Serialization
// ========================================

function serializeGameServer(
    server,
    liveData
) {
    const host = normalizeHost(
        server?.host ||
        server?.ip
    );

    const port = normalizePort(server);

    const liveName =
        liveData?.name ||
        server?.name ||
        'Unknown Game Server';

    const online =
        liveData?.online === true;

    const players =
        Number(liveData?.players) || 0;

    const maxPlayers =
        Number(liveData?.maxPlayers) || 0;

    const countryCode =
        liveData?.countryCode ||
        server?.country_code ||
        null;

    const countryFlag =
        liveData?.countryFlag ||
        server?.country_flag ||
        null;

    return {
        id: server?.id ?? null,

        name: liveName,

        game:
            server?.game_type ||
            server?.type ||
            server?.game ||
            'Unknown',

        host,
        port,

        online,

        map:
            liveData?.map ||
            'Unavailable',

        players,
        maxPlayers,

        bots:
            Number(
                liveData?.botCount
            ) || 0,

        ping:
            liveData?.ping ??
            null,

        countryCode,
        countryFlag,

        discordInvite:
            server?.discord_invite ||
            null,

        connect:
            liveData?.connect ||
            buildAddress(
                host,
                port
            )
    };
}

// ========================================
// Live Game Server Query
// ========================================

async function queryLiveServer(server) {
    const host = normalizeHost(
        server?.host ||
        server?.ip
    );

    const port = normalizePort(server);

    if (!host || !port) {
        return {
            online: false,

            map: 'Unavailable',

            players: 0,

            maxPlayers: 0,

            botCount: 0,

            ping: null,

            connect:
                buildAddress(
                    host,
                    port
                ),

            countryCode:
                server?.country_code ||
                null,

            countryFlag:
                server?.country_flag ||
                null,

            name:
                server?.name ||
                'Unknown Game Server',

            playerList: [],

            playerDetails: [],

            botList: []
        };
    }

    try {
        return await fetchServerInfo({
            ...server,
            host,
            port
        });
    } catch (error) {
        console.error(
            `[Dashboard] Live query failed for server #${server?.id}:`,
            error?.message || error
        );

        return {
            online: false,

            map: 'Unavailable',

            players: 0,

            maxPlayers: 0,

            botCount: 0,

            ping: null,

            connect:
                buildAddress(
                    host,
                    port
                ),

            countryCode:
                server?.country_code ||
                null,

            countryFlag:
                server?.country_flag ||
                null,

            name:
                server?.name ||
                'Unknown Game Server',

            playerList: [],

            playerDetails: [],

            botList: []
        };
    }
}

// ========================================
// Dashboard Routes
// ========================================

export function registerDashboardRoutes(app) {
    app.set(
        'trust proxy',
        1
    );

    // ====================================
    // Public Game Servers
    // ====================================

    app.get(
        '/api/servers',
        dashboardRateLimit,
        async (req, res) => {
            try {
                const servers =
                    await getMonitoredGameServers();

                if (
                    !Array.isArray(servers) ||
                    servers.length === 0
                ) {
                    return res.status(200).json({
                        success: true,
                        count: 0,
                        servers: [],
                        timestamp:
                            new Date().toISOString()
                    });
                }

                const liveResults =
                    await Promise.all(
                        servers.map(
                            server =>
                                queryLiveServer(
                                    server
                                )
                        )
                    );

                const result =
                    servers.map(
                        (
                            server,
                            index
                        ) =>
                            serializeGameServer(
                                server,
                                liveResults[index]
                            )
                    );

                return res.status(200).json({
                    success: true,
                    count: result.length,
                    servers: result,
                    timestamp:
                        new Date().toISOString()
                });
            } catch (error) {
                console.error(
                    '[Dashboard] Failed to load Game Servers:',
                    error
                );

                return res.status(500).json({
                    success: false,
                    error:
                        'Failed to load Game Servers'
                });
            }
        }
    );

    // ====================================
    // Public Home Page
    // ====================================

    app.get(
        '/',
        (req, res) => {
            res.sendFile(
                path.join(
                    dashboardPublicPath,
                    'index.html'
                )
            );
        }
    );

    // ====================================
    // Public Server Details Page
    // ====================================

    app.get(
        '/servers/:id',
        (req, res) => {
            res.sendFile(
                path.join(
                    dashboardPublicPath,
                    'server.html'
                )
            );
        }
    );

    // ====================================
    // Live Server Details API
    // ====================================

    app.get(
        '/api/servers/:id',
        dashboardRateLimit,
        async (req, res) => {
            try {
                const serverId =
                    Number(
                        req.params.id
                    );

                if (
                    !Number.isInteger(serverId) ||
                    serverId <= 0
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'Invalid server ID'
                    });
                }

                const servers =
                    await getMonitoredGameServers();

                const server =
                    servers.find(
                        item =>
                            Number(item.id) ===
                            serverId
                    );

                if (!server) {
                    return res.status(404).json({
                        success: false,
                        error:
                            'Game Server not found'
                    });
                }

                const liveData =
                    await queryLiveServer(
                        server
                    );

                const result =
                    serializeGameServer(
                        server,
                        liveData
                    );

                return res.status(200).json({
                    success: true,

                    server: {
                        ...result,

                        playerList:
                            Array.isArray(
                                liveData.playerList
                            )
                                ? liveData.playerList
                                : [],

                        playerDetails:
                            Array.isArray(
                                liveData.playerDetails
                            )
                                ? liveData.playerDetails
                                : [],

                        botList:
                            Array.isArray(
                                liveData.botList
                            )
                                ? liveData.botList
                                : [],

                        botCount:
                            Number(
                                liveData.botCount
                            ) || 0
                    },

                    timestamp:
                        new Date().toISOString()
                });
            } catch (error) {
                console.error(
                    '[Dashboard] Failed to load live server:',
                    error
                );

                return res.status(500).json({
                    success: false,
                    error:
                        'Failed to load live server'
                });
            }
        }
    );

    // ====================================
    // Server Statistics API
    // ====================================

    app.get(
        '/api/servers/:id/statistics',
        dashboardRateLimit,
        async (req, res) => {
            try {
                const serverId =
                    Number(
                        req.params.id
                    );

                if (
                    !Number.isInteger(serverId) ||
                    serverId <= 0
                ) {
                    return res.status(400).json({
                        success: false,
                        error:
                            'Invalid server ID'
                    });
                }

                const servers =
                    await getMonitoredGameServers();

                const server =
                    servers.find(
                        item =>
                            Number(item.id) ===
                            serverId
                    );

                if (!server) {
                    return res.status(404).json({
                        success: false,
                        error:
                            'Game Server not found'
                    });
                }

                /*
                 * The live query is intentionally kept here
                 * for the current online player names used
                 * by getOnlinePlayerStats().
                 */
                const liveData =
                    await queryLiveServer(
                        server
                    );

                const playerNames =
                    Array.isArray(
                        liveData.playerList
                    )
                        ? liveData.playerList
                        : [];

                const [
                    history24h,
                    history7d,
                    history30d,
                    favoriteMaps,
                    rankHistory,
                    currentRank,
                    onlinePlayers,
                    topPlayers
                ] = await Promise.all([
                    getPlayerHistory(
                        serverId,
                        24
                    ),

                    getPlayerHistory(
                        serverId,
                        24 * 7
                    ),

                    getPlayerHistory(
                        serverId,
                        24 * 30
                    ),

                    getFavoriteMaps(
                        serverId,
                        7
                    ),

                    getServerRankHistory(
                        serverId,
                        30
                    ),

                    getCurrentServerRank(
                        serverId
                    ),

                    getOnlinePlayerStats(
                        serverId,
                        playerNames
                    ),

                    getTopPlayers(
                        serverId,
                        10
                    )
                ]);

                return res.status(200).json({
                    success: true,

                    serverId,

                    players: {
                        '24h': history24h,
                        '7d': history7d,
                        '30d': history30d
                    },

                    favoriteMaps,

                    serverRank: {
                        current:
                            currentRank
                                ? Number(
                                    currentRank.rank
                                )
                                : null,

                        score:
                            currentRank
                                ? Number(
                                    currentRank.rank_score
                                )
                                : null,

                        history:
                            rankHistory
                    },

                    onlinePlayers,

                    topPlayers,

                    timestamp:
                        new Date().toISOString()
                });
            } catch (error) {
                console.error(
                    '[Dashboard] Failed to load server statistics:',
                    error
                );

                return res.status(500).json({
                    success: false,
                    error:
                        'Failed to load server statistics'
                });
            }
        }
    );

    // ====================================
    // Static Dashboard Files
    // ====================================

    app.use(
        express.static(
            dashboardPublicPath,
            {
                index: false,
                maxAge: '5m'
            }
        )
    );

    // ====================================
    // Rate State Cleanup
    // ====================================

    const cleanupInterval =
        setInterval(
            cleanupRateState,
            5 * 60 * 1000
        );

    cleanupInterval.unref?.();

    return {
        stop() {
            clearInterval(
                cleanupInterval
            );
        }
    };
}