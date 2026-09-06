
import gamedig from 'gamedig';

const { query } = gamedig;

export async function fetchServerInfo(serverConfig) {
    try {
        const info = await query({
            type: serverConfig.type || serverConfig.game_type || 'cs16',
            host: serverConfig.host || serverConfig.ip,
            port: Number(serverConfig.port)
        });

        const playerList = Array.isArray(info.players)
            ? info.players
                .map(player => player.name)
                .filter(Boolean)
                .slice(0, 20)
            : [];

        const botList = Array.isArray(info.bots)
            ? info.bots
                .map(bot => bot.name)
                .filter(Boolean)
                .slice(0, 20)
            : [];

        return {
            online: true,

            name: info.name || serverConfig.name,

            map: info.map || 'Unknown',

            players: Array.isArray(info.players)
                ? info.players.length
                : 0,

            maxPlayers: info.maxplayers || 0,

            playerList,

            bots: botList,

            botList,

            botCount: botList.length,

            ping: info.ping || null,

            connect:
                info.connect ||
                `${serverConfig.host || serverConfig.ip}:${Number(serverConfig.port)}`,

            // Will be populated later by GeoIP
            country: null,
            countryCode: null,
            countryFlag: null,

            // Keep the raw data in case additional information is needed later
            raw: info.raw || null
        };
    } catch (error) {
        console.error(
            `[GameServer Query] Failed to query ${serverConfig.name || 'server'}:`,
            error.message
        );

        return {
            online: false,

            name: serverConfig.name || 'Game Server',

            map: 'Unavailable',

            players: 0,

            maxPlayers: 0,

            playerList: [],

            bots: [],

            botList: [],

            botCount: 0,

            ping: null,

            connect:
                serverConfig.host || serverConfig.ip
                    ? `${serverConfig.host || serverConfig.ip}:${Number(serverConfig.port)}`
                    : null,

            country: null,
            countryCode: null,
            countryFlag: null,

            raw: null
        };
    }
}

