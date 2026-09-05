import { pgDb } from '../../utils/postgresDatabase.js';
import { pgConfig } from '../../config/database/postgres.js';
import { logger } from '../../utils/logger.js';

const table = pgConfig.tables.game_servers;

/**
 * Get a single game server by ID.
 */
export async function getGameServerById(serverId) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const result = await pgDb.pool.query(
        `
        SELECT
            id,
            guild_id,
            name,
            host,
            port,
            game_type,
            emoji,
            channel_id,
            message_id,
            monitor_enabled,
            alert_enabled,
            last_online,
            last_players,
            last_max_players,
            last_map,
            last_ping,
            last_checked_at,
            created_at,
            updated_at
        FROM ${table}
        WHERE id = $1
        LIMIT 1
        `,
        [Number(serverId)]
    );

    return result.rows[0] ?? null;
}

/**
 * Get all game servers belonging to a Discord guild.
 */
export async function getGameServersByGuild(guildId) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const result = await pgDb.pool.query(
        `
        SELECT
            id,
            guild_id,
            name,
            host,
            port,
            game_type,
            emoji,
            channel_id,
            message_id,
            monitor_enabled,
            alert_enabled,
            last_online,
            last_players,
            last_max_players,
            last_map,
            last_ping,
            last_checked_at,
            created_at,
            updated_at
        FROM ${table}
        WHERE guild_id = $1
        ORDER BY id ASC
        `,
        [guildId]
    );

    return result.rows;
}

/**
 * Create a new game server.
 */
export async function createGameServer({
    guildId,
    name,
    host,
    port,
    gameType = 'cs16',
    emoji = '🎮',
    channelId = null,
    messageId = null,
    monitorEnabled = true,
    alertEnabled = true
}) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const result = await pgDb.pool.query(
        `
        INSERT INTO ${table} (
            guild_id,
            name,
            host,
            port,
            game_type,
            emoji,
            channel_id,
            message_id,
            monitor_enabled,
            alert_enabled
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        `,
        [
            guildId,
            name,
            host,
            Number(port),
            gameType,
            emoji,
            channelId,
            messageId,
            monitorEnabled,
            alertEnabled
        ]
    );

    logger.info('Game server created', {
        id: result.rows[0].id,
        guildId,
        name,
        host,
        port
    });

    return result.rows[0];
}

/**
 * Update a game server.
 */
export async function updateGameServer(serverId, updates = {}) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const allowedFields = {
        name: 'name',
        host: 'host',
        port: 'port',
        gameType: 'game_type',
        emoji: 'emoji',
        channelId: 'channel_id',
        messageId: 'message_id',
        monitorEnabled: 'monitor_enabled',
        alertEnabled: 'alert_enabled'
    };

    const entries = Object.entries(updates)
        .filter(([key, value]) => (
            Object.prototype.hasOwnProperty.call(allowedFields, key) &&
            value !== undefined
        ));

    if (entries.length === 0) {
        return getGameServerById(serverId);
    }

    const setParts = [];
    const values = [];

    for (const [key, value] of entries) {
        values.push(
            key === 'port'
                ? Number(value)
                : value
        );

        setParts.push(
            `${allowedFields[key]} = $${values.length}`
        );
    }

    values.push(Number(serverId));

    const result = await pgDb.pool.query(
        `
        UPDATE ${table}
        SET
            ${setParts.join(', ')},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length}
        RETURNING *
        `,
        values
    );

    return result.rows[0] ?? null;
}

/**
 * Delete a game server.
 */
export async function deleteGameServer(serverId, guildId = null) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    let query;
    let params;

    if (guildId) {
        query = `
            DELETE FROM ${table}
            WHERE id = $1
              AND guild_id = $2
            RETURNING *
        `;

        params = [
            Number(serverId),
            guildId
        ];
    } else {
        query = `
            DELETE FROM ${table}
            WHERE id = $1
            RETURNING *
        `;

        params = [
            Number(serverId)
        ];
    }

    const result = await pgDb.pool.query(query, params);

    return result.rows[0] ?? null;
}

/**
 * Update the latest server status.
 */
export async function updateGameServerStatus(serverId, status = {}) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const {
        online = null,
        players = 0,
        maxPlayers = 0,
        map = null,
        ping = null
    } = status;

    const result = await pgDb.pool.query(
        `
        UPDATE ${table}
        SET
            last_online = $1,
            last_players = $2,
            last_max_players = $3,
            last_map = $4,
            last_ping = $5,
            last_checked_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
        `,
        [
            online,
            Number(players) || 0,
            Number(maxPlayers) || 0,
            map,
            ping !== null ? Number(ping) : null,
            Number(serverId)
        ]
    );

    return result.rows[0] ?? null;
}

/**
 * Find a server by guild + host + port.
 */
export async function findGameServerByAddress(
    guildId,
    host,
    port
) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const result = await pgDb.pool.query(
        `
        SELECT *
        FROM ${table}
        WHERE guild_id = $1
          AND host = $2
          AND port = $3
        LIMIT 1
        `,
        [
            guildId,
            host,
            Number(port)
        ]
    );

    return result.rows[0] ?? null;
}

/**
 * Get all servers that have monitoring enabled.
 */
export async function getMonitoredGameServers() {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const result = await pgDb.pool.query(
        `
        SELECT *
        FROM ${table}
        WHERE monitor_enabled = TRUE
        ORDER BY guild_id, id
        `
    );

    return result.rows;
}

/**
 * Save Discord channel/message used for server monitoring.
 */
export async function setGameServerMessage(
    serverId,
    channelId,
    messageId
) {
    return updateGameServer(serverId, {
        channelId,
        messageId
    });
}