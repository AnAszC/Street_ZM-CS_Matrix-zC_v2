import { pgDb } from '../../utils/postgresDatabase.js';

const HISTORY_TABLE = 'game_server_history';
const PLAYER_TABLE = 'game_server_player_stats';
const RANK_TABLE = 'game_server_rank_history';

/**
 * Save one historical server snapshot.
 */
export async function recordGameServerHistory(
    serverId,
    {
        online = false,
        players = 0,
        maxPlayers = 0,
        bots = 0,
        map = null,
        ping = null,
        recordedAt = new Date()
    } = {}
) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const result = await pgDb.pool.query(
        `
        INSERT INTO ${HISTORY_TABLE} (
            server_id,
            online,
            players,
            max_players,
            bots,
            map,
            ping,
            recorded_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8
        )
        RETURNING *
        `,
        [
            Number(serverId),
            Boolean(online),
            Number(players) || 0,
            Number(maxPlayers) || 0,
            Number(bots) || 0,
            map || null,
            ping !== null
                ? Number(ping)
                : null,
            recordedAt
        ]
    );

    return result.rows[0] ?? null;
}


/**
 * Save player presence from the current monitor cycle.
 *
 * Time played is accumulated from the gap between appearances,
 * capped at twice the monitor interval (10 minutes with the
 * current 5-minute monitor configuration).
 */
export async function recordGameServerPlayerPresence(
    serverId,
    playerDetails = [],
    {
        observedAt = new Date(),
        maxIntervalSeconds = 600
    } = {}
) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    if (!Array.isArray(playerDetails) || !playerDetails.length) {
        return [];
    }

    const client = await pgDb.pool.connect();

    try {
        await client.query('BEGIN');

        const results = [];

        for (const player of playerDetails) {
            const name =
                String(player?.name || '').trim();

            if (!name) {
                continue;
            }

            const playerKey =
                name
                    .toLowerCase()
                    .trim()
                    .replace(/\s+/g, ' ');

            const score =
                Number.isFinite(Number(player?.score))
                    ? Number(player.score)
                    : null;

            const result = await client.query(
                `
                INSERT INTO ${PLAYER_TABLE} (
                    server_id,
                    player_key,
                    player_name,
                    score,
                    first_seen,
                    last_seen,
                    total_seconds
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $5,
                    0
                )
                ON CONFLICT (
                    server_id,
                    player_key
                )
                DO UPDATE SET
                    player_name = EXCLUDED.player_name,
                    score =
                        COALESCE(
                            EXCLUDED.score,
                            ${PLAYER_TABLE}.score
                        ),
                    total_seconds =
                        ${PLAYER_TABLE}.total_seconds +
                        LEAST(
                            $6,
                            GREATEST(
                                0,
                                EXTRACT(
                                    EPOCH FROM (
                                        $5 -
                                        ${PLAYER_TABLE}.last_seen
                                    )
                                )
                            )
                        )::BIGINT,
                    last_seen = $5,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
                `,
                [
                    Number(serverId),
                    playerKey,
                    name,
                    score,
                    observedAt,
                    Number(maxIntervalSeconds) || 600
                ]
            );

            if (result.rows[0]) {
                results.push(result.rows[0]);
            }
        }

        await client.query('COMMIT');

        return results;

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;

    } finally {
        client.release();
    }
}


/**
 * Get historical player count points.
 */
export async function getPlayerHistory(
    serverId,
    hours = 24
) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const safeHours =
        Math.min(
            24 * 30,
            Math.max(1, Number(hours) || 24)
        );

    const result = await pgDb.pool.query(
        `
        SELECT
            recorded_at,
            players,
            max_players,
            online
        FROM ${HISTORY_TABLE}
        WHERE server_id = $1
          AND recorded_at >=
              CURRENT_TIMESTAMP -
              ($2 || ' hours')::interval
        ORDER BY recorded_at ASC
        `,
        [
            Number(serverId),
            safeHours
        ]
    );

    return result.rows;
}


/**
 * Get favorite maps for a period.
 */
export async function getFavoriteMaps(
    serverId,
    days = 7
) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const safeDays =
        Math.min(
            30,
            Math.max(1, Number(days) || 7)
        );

    const result = await pgDb.pool.query(
        `
        SELECT
            map,
            COUNT(*)::INTEGER AS samples,
            ROUND(
                (
                    COUNT(*)::NUMERIC /
                    NULLIF(
                        SUM(COUNT(*))
                        OVER (),
                        0
                    )
                ) * 100,
                1
            ) AS percentage
        FROM ${HISTORY_TABLE}
        WHERE server_id = $1
          AND recorded_at >=
              CURRENT_TIMESTAMP -
              ($2 || ' days')::interval
          AND online = TRUE
          AND map IS NOT NULL
          AND map <> ''
          AND map <> 'Unavailable'
        GROUP BY map
        ORDER BY samples DESC, map ASC
        LIMIT 10
        `,
        [
            Number(serverId),
            safeDays
        ]
    );

    return result.rows.map(row => ({
        map: row.map,
        samples: Number(row.samples) || 0,
        percentage: Number(row.percentage) || 0
    }));
}


/**
 * Get server rank history.
 */
export async function getServerRankHistory(
    serverId,
    days = 30
) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const safeDays =
        Math.min(
            90,
            Math.max(1, Number(days) || 30)
        );

    const result = await pgDb.pool.query(
        `
        SELECT
            rank,
            rank_score,
            average_occupancy,
            uptime_percentage,
            peak_occupancy,
            recorded_at
        FROM ${RANK_TABLE}
        WHERE server_id = $1
          AND recorded_at >=
              CURRENT_TIMESTAMP -
              ($2 || ' days')::interval
        ORDER BY recorded_at ASC
        `,
        [
            Number(serverId),
            safeDays
        ]
    );

    return result.rows.map(row => ({
        rank: Number(row.rank),
        score: Number(row.rank_score),
        averageOccupancy:
            Number(row.average_occupancy),
        uptimePercentage:
            Number(row.uptime_percentage),
        peakOccupancy:
            Number(row.peak_occupancy),
        recordedAt:
            row.recorded_at
    }));
}


/**
 * Save today's CSMatrix-zC WORLD server ranking.
 *
 * Ranking formula:
 * 50% average player occupancy
 * 30% uptime
 * 20% peak player occupancy
 */
export async function recordServerRankSnapshot() {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const result = await pgDb.pool.query(
        `
        WITH server_metrics AS (
            SELECT
                g.id AS server_id,

                COALESCE(
                    AVG(
                        CASE
                            WHEN h.max_players > 0
                            THEN
                                (
                                    h.players::NUMERIC /
                                    h.max_players::NUMERIC
                                ) * 100
                            ELSE 0
                        END
                    ),
                    0
                ) AS average_occupancy,

                COALESCE(
                    AVG(
                        CASE
                            WHEN h.online = TRUE
                            THEN 100
                            ELSE 0
                        END
                    ),
                    0
                ) AS uptime_percentage,

                COALESCE(
                    MAX(
                        CASE
                            WHEN h.max_players > 0
                            THEN
                                (
                                    h.players::NUMERIC /
                                    h.max_players::NUMERIC
                                ) * 100
                            ELSE 0
                        END
                    ),
                    0
                ) AS peak_occupancy

            FROM game_servers g

            LEFT JOIN ${HISTORY_TABLE} h
                ON h.server_id = g.id
               AND h.recorded_at >=
                   CURRENT_TIMESTAMP -
                   INTERVAL '30 days'

            WHERE g.monitor_enabled = TRUE

            GROUP BY g.id
        ),

        scored AS (
            SELECT
                server_id,
                average_occupancy,
                uptime_percentage,
                peak_occupancy,

                (
                    average_occupancy * 0.50
                    +
                    uptime_percentage * 0.30
                    +
                    peak_occupancy * 0.20
                ) AS rank_score

            FROM server_metrics
        ),

        ranked AS (
            SELECT
                *,
                ROW_NUMBER() OVER (
                    ORDER BY
                        rank_score DESC,
                        average_occupancy DESC,
                        uptime_percentage DESC,
                        peak_occupancy DESC,
                        server_id ASC
                ) AS rank
            FROM scored
        )

                INSERT INTO ${RANK_TABLE} (
            server_id,
            rank,
            rank_score,
            average_occupancy,
            uptime_percentage,
            peak_occupancy,
            recorded_date,
            recorded_at
        )
        SELECT
            server_id,
            rank,
            rank_score,
            average_occupancy,
            uptime_percentage,
            peak_occupancy,
            CURRENT_DATE,
            CURRENT_TIMESTAMP
        FROM ranked
        ON CONFLICT (
            server_id,
            recorded_date
        )
        DO NOTHING
        RETURNING *;
        `
    );

    return result.rows;
}


/**
 * Current rank information for one server.
 */
export async function getCurrentServerRank(serverId) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const result = await pgDb.pool.query(
        `
        SELECT
            rank,
            rank_score,
            recorded_at
        FROM ${RANK_TABLE}
        WHERE server_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1
        `,
        [
            Number(serverId)
        ]
    );

    return result.rows[0] ?? null;
}


/**
 * Player statistics for the currently online players.
 */
export async function getOnlinePlayerStats(
    serverId,
    playerNames = []
) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    if (!Array.isArray(playerNames) || !playerNames.length) {
        return [];
    }

    const keys =
        playerNames
            .map(name =>
                String(name || '')
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
            )
            .filter(Boolean);

    if (!keys.length) {
        return [];
    }

    const result = await pgDb.pool.query(
        `
        SELECT
            player_name,
            score,
            total_seconds,
            first_seen,
            last_seen
        FROM ${PLAYER_TABLE}
        WHERE server_id = $1
          AND player_key = ANY($2::TEXT[])
        ORDER BY
            total_seconds DESC,
            player_name ASC
        `,
        [
            Number(serverId),
            keys
        ]
    );

    return result.rows.map(row => ({
        name: row.player_name,
        score:
            row.score !== null
                ? Number(row.score)
                : null,
        totalSeconds:
            Number(row.total_seconds) || 0,
        firstSeen:
            row.first_seen,
        lastSeen:
            row.last_seen
    }));
}


/**
 * Top 10 historical players.
 */
export async function getTopPlayers(
    serverId,
    limit = 10
) {
    if (!pgDb.isAvailable()) {
        throw new Error('PostgreSQL database is not available.');
    }

    const safeLimit =
        Math.min(
            100,
            Math.max(1, Number(limit) || 10)
        );

    const result = await pgDb.pool.query(
        `
        SELECT
            player_name,
            score,
            total_seconds,
            first_seen,
            last_seen
        FROM ${PLAYER_TABLE}
        WHERE server_id = $1
        ORDER BY
            total_seconds DESC,
            COALESCE(score, -1) DESC,
            player_name ASC
        LIMIT $2
        `,
        [
            Number(serverId),
            safeLimit
        ]
    );

    return result.rows.map(row => ({
        name: row.player_name,
        score:
            row.score !== null
                ? Number(row.score)
                : null,
        totalSeconds:
            Number(row.total_seconds) || 0,
        firstSeen:
            row.first_seen,
        lastSeen:
            row.last_seen
    }));
}