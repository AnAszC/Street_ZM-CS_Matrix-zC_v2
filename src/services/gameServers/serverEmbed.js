
import { EmbedBuilder } from 'discord.js';
import { gameServerConfig } from './serverConfig.js';

export function buildServerEmbed(server, serverData) {
    const isOnline = serverData?.online === true;

    const embed = new EmbedBuilder()
        .setColor(
            isOnline
                ? gameServerConfig.embedColorOnline
                : gameServerConfig.embedColorOffline
        )
        .setTitle(`${server.emoji || '🎮'} ${server.name}`)
        .setDescription(
            `**📡 الحالة:** ${isOnline ? '🟢 Online' : '🔴 Offline'}`
        )
        .addFields(
            {
                name: '🌍 الخريطة',
                value: serverData?.map || 'غير معروف',
                inline: true
            },
            {
                name: '👥 اللاعبين',
                value: `${serverData?.players ?? 0}/${serverData?.maxPlayers ?? 0}`,
                inline: true
            },
            {
                name: '🆔 معرف السيرفر',
                value: `\`${server.id}\``,
                inline: true
            },
            {
                name: '🔗 العنوان',
                value: `\`${server.host}:${server.port}\``,
                inline: false
            }
        )
        .setFooter({
            text: `آخر تحديث: ${new Date().toLocaleString('ar-MA')}`
        });

        if (
            server.show_players !== false &&
            isOnline &&
            Array.isArray(serverData.playerList) &&
            serverData.playerList.length > 0
        ) {
            const playerList = serverData.playerList
                .map((player, index) => `${index + 1}. ${player}`)
                .join('\n');

            embed.addFields({
                name: '🟢 اللاعبون المتصلون',
                value:
                    playerList.length > 1024
                        ? `${playerList.slice(0, 1021)}...`
                        : playerList,
                inline: false
            });
        }

    return embed;
}

