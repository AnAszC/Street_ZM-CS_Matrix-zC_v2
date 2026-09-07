
import gamedig from 'gamedig';

const { query } = gamedig;


/**
 * Query a Game Server.
 *
 * @param {Object} serverConfig
 * @param {Object} options
 * @param {boolean} options.throwOnFailure
 *
 * When throwOnFailure = true:
 * - A successful query returns the normal server data.
 * - A failed query throws the original error.
 *
 * When throwOnFailure = false:
 * - A successful query returns the normal server data.
 * - A failed query returns querySuccess: false.
 */
export async function fetchServerInfo(
    serverConfig,
    options = {}
) {

    const {
        throwOnFailure = false
    } = options;


    try {

        const info =
            await query({
                type:
                    serverConfig.type ||
                    serverConfig.game_type ||
                    'cs16',

                host:
                    serverConfig.host ||
                    serverConfig.ip,

                port:
                    Number(
                        serverConfig.port
                    )
            });


        return {
            querySuccess: true,

            online: true,

            name:
                info.name ||
                serverConfig.name,

            map:
                info.map ||
                'Unknown',

            players:
                Array.isArray(info.players)
                    ? info.players.length
                    : 0,

            maxPlayers:
                info.maxplayers ||
                0,

            playerList:
                Array.isArray(info.players)
                    ? info.players
                        .map(
                            player =>
                                player.name
                        )
                        .filter(Boolean)
                        .slice(0, 20)
                    : [],

            playerDetails:
                Array.isArray(info.players)
                    ? info.players
                        .map(
                            player => ({
                                name:
                                    player.name ||
                                    null,

                                score:
                                    player.score ??
                                    null
                            })
                        )
                        .filter(
                            player =>
                                Boolean(
                                    player.name
                                )
                        )
                        .slice(0, 20)
                    : [],

            botList:
                Array.isArray(info.bots)
                    ? info.bots
                        .map(
                            bot =>
                                bot.name ||
                                null
                        )
                        .filter(Boolean)
                        .slice(0, 20)
                    : [],

            botCount:
                Array.isArray(info.bots)
                    ? info.bots.length
                    : 0,

            ping:
                info.ping ||
                null
        };


    } catch (error) {

        console.error(
            `[GameServer Query] Failed to query ${
                serverConfig.name ||
                'server'
            }:`,
            error.message
        );


        /*
         * The Game Server Monitor can request
         * the original error to be thrown.
         *
         * This allows the monitor to count
         * consecutive Query failures.
         */
        if (throwOnFailure) {

            throw error;
        }


        /*
         * Keep the existing behavior for
         * all other callers in the project.
         */
        return {
            querySuccess: false,

            online: false,

            name:
                serverConfig.name ||
                'Game Server',

            map:
                'Unavailable',

            players: 0,

            maxPlayers: 0,

            playerList: [],

            playerDetails: [],

            botList: [],

            botCount: 0,

            ping: null,

            error:
                error.message
        };
    }
}

