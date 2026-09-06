import { EmbedBuilder } from 'discord.js';
import { gameServerConfig } from './serverConfig.js';

export function buildServerEmbed(server, serverData) {
    const isOnline = serverData?.online === true;

    const host = server.host || server.ip || 'Unknown';
    const port = Number(server.port) || 0;
    const address = `${host}:${port}`;

    const gameType = {
        cs16: 'Counter-Strike 1.6',
        csgo: 'Counter-Strike: Global Offensive',
        cs2: 'Counter-Strike 2'
    };

    const gameName =
        gameType[server.game_type] ||
        server.game_type ||
        'Unknown Game';

    const countryFlag =
        serverData?.countryFlag ||
        server.country_flag ||
        null;

    const countryCode =
        serverData?.countryCode ||
        server.country_code ||
        null;

    const country =
        countryFlag && countryCode
            ? `${countryFlag} ${countryCode}`
            : '🌐 Unknown';

    const connectAddress =
        serverData?.connect || address;

    /*
     * Display server name.
     *
     * Prefer the live hostname returned by GameDig.
     * Fall back to the database name if the live name
     * is unavailable.
     */
    const displayServerName =
        String(serverData?.name || '').trim() ||
        server.name ||
        'Unknown Game Server';

    /*
     * Server Manager
     */
    const serverManager =
    server.owner_user_id
        ? `<@${server.owner_user_id}>`
        : 'Unknown';

    /*
     * Ownership Status
     */
    const ownershipStatus =
        server.ownership_verified === true
            ? `<:locked:1546233004072902887> Verified`
            : '<:unlocked:1546233009215242301> Not Verified';

    /*
     * Main Server Information Embed
     */
    const embed = new EmbedBuilder()
        .setColor(
            isOnline
                ? gameServerConfig.embedColorOnline
                : gameServerConfig.embedColorOffline
        )
        .setTitle(
            `${server.emoji || '<:guarded:1546099145004032051>'} ${displayServerName}`
        )
        .setDescription(
            `<:guarded:1546099145004032051> **Server Manager:** ${serverManager}`
        )
        .addFields(
            {
                name: '<:steam:1546100353559298148> Connect:',
                value: `\`${connectAddress}\``,
                inline: false
            },
            {
                name: '<a:onlinelive:1546120656310108210> Status:',
                value: isOnline
                    ? '<a:onlines:1546099245440831598> Online'
                    : '<a:offlines:1546099244086337536> Offline',
                inline: true
            },
            {
                name: '<a:oldkey:1546233008397357248> Ownership:',
                value: ownershipStatus,
                inline: true
            },
            {
                name: '<a:v_approved:1546121365470322839> Address:',
                value: `\`${address}\``,
                inline: true
            },
            {
                name: '<a:Worldmap:1546100198466392135> Country:',
                value: country,
                inline: true
            },
            {
                name: '<a:videogame:1546115517721346128> Game:',
                value: gameName,
                inline: true
            },
            {
                name: '<:map:1546117810756001922> Current Map:',
                value: serverData?.map || 'Unknown',
                inline: true
            },
            {
                name: '<a:gamer:1546109618969780305> Players:',
                value:
                    `${serverData?.players ?? 0} / ` +
                    `${serverData?.maxPlayers ?? 0}`,
                inline: true
            },
            {
                name: '<a:robot:1546127261915283486> Bots:',
                value:
                    `${serverData?.botCount ?? 0} / ` +
                    `${serverData?.maxPlayers ?? 0}`,
                inline: true
            }
        );

    /*
     * Discord Invite
     */
    if (server.discord_invite) {
        embed.addFields({
            name: '<a:check1:1546102810809208933> Discord',
            value: server.discord_invite,
            inline: false
        });
    }

    /*
     * Footer
     */
    embed.data.footer = {
        text:
            `🌐 ${gameServerConfig.name} v${gameServerConfig.version}` +
            ` | 🆔 Server ID : #${server.id}`
    };

    /*
     * Lists data
     */
    const players =
        server.show_players !== false &&
        isOnline &&
        Array.isArray(serverData?.playerList)
            ? serverData.playerList
            : [];

    const bots =
        server.show_players !== false &&
        isOnline &&
        Array.isArray(serverData?.botList)
            ? serverData.botList
            : [];

    const hasLists =
        players.length > 0 ||
        bots.length > 0;

    /*
     * Return only the main Embed when lists are hidden
     * or when there are no players/bots.
     */
    if (!hasLists) {
        return [embed];
    }

    /*
     * Lists Embed
     */
    const listsEmbed = new EmbedBuilder()
        .setColor(
            isOnline
                ? gameServerConfig.embedColorOnline
                : gameServerConfig.embedColorOffline
        );

    /*
     * Player List
     */
    if (players.length > 0) {
        const playerList = players
            .map((player, index) => `${index + 1}. ${player}`)
            .join('\n');

        listsEmbed.addFields({
            name: '<a:gamer:1546109618969780305> Player List:',
            value:
                playerList.length > 1024
                    ? `${playerList.slice(0, 1021)}...`
                    : playerList,
            inline: false
        });
    }

    /*
     * Separator
     */
    if (
        players.length > 0 &&
        bots.length > 0
    ) {
        listsEmbed.addFields({
            name: '\u200b',
            value:
                '\u2003\u2003\u2003\u2003\u2003' +
                '━━━━━━━━━━━━━━ ' +
                '<a:wing:1546119219446288384>' +
                ' ━━━━━━━━━━━━━━',
            inline: false
        });
    }

    /*
     * Bot List
     */
    if (bots.length > 0) {
        const botList = bots
            .map((bot, index) => `${index + 1}. ${bot}`)
            .join('\n');

        listsEmbed.addFields({
            name: '<a:robot:1546127261915283486> Bot List:',
            value:
                botList.length > 1024
                    ? `${botList.slice(0, 1021)}...`
                    : botList,
            inline: false
        });
    }

    /*
     * Return both Embeds
     */
    return [
        embed,
        listsEmbed
    ];
}