import gamedig from 'gamedig';

const { query } = gamedig;

export async function fetchServerInfo(serverConfig) {
    try {
        const info = await query({
            type: serverConfig.type || serverConfig.game_type || 'cs16',
            host: serverConfig.host || serverConfig.ip,
            port: Number(serverConfig.port)
        });

        return {
            online: true,
            name: info.name || serverConfig.name,
            map: info.map || 'غير معروف',
            players: Array.isArray(info.players)
                ? info.players.length
                : 0,
            maxPlayers: info.maxplayers || 0,
            playerList: Array.isArray(info.players)
                ? info.players
                    .map(player => player.name)
                    .filter(Boolean)
                    .slice(0, 20)
                : [],
            ping: info.ping || null
        };
    } catch (error) {
        console.error(
            `[GameServer Query] Failed to query ${serverConfig.name || 'server'}:`,
            error.message
        );

        return {
            online: false,
            name: serverConfig.name || 'Game Server',
            map: 'غير متاح',
            players: 0,
            maxPlayers: 0,
            playerList: [],
            ping: null
        };
    }
}