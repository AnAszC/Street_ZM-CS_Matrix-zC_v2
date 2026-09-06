
import { getGameServerById, updateGameServer } from '../../../services/gameServers/gameServerDatabase.js';
import { fetchServerInfo } from '../../../services/gameServers/gameQueryService.js';
import { buildServerEmbed } from '../../../services/gameServers/serverEmbed.js';

export default {
    name: 'toggle_players',

    async execute(interaction, client, args) {
        const [serverId] = args;

        if (!serverId) {
            await interaction.reply({
                content: '❌ معرف السيرفر غير موجود.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        try {
            const server = await getGameServerById(serverId);

            if (!server) {
                await interaction.editReply({
                    content: '❌ لم يتم العثور على السيرفر في قاعدة البيانات.',
                    embeds: [],
                    components: []
                });
                return;
            }

            const newShowPlayers = server.show_players === false;

            const updatedServer = await updateGameServer(server.id, {
                showPlayers: newShowPlayers
            });

            if (!updatedServer) {
                await interaction.editReply({
                    content: '❌ تعذر تحديث إعدادات عرض اللاعبين.',
                    embeds: [],
                    components: []
                });
                return;
            }

            const serverData = await fetchServerInfo(updatedServer);

            const embed = buildServerEmbed(
                updatedServer,
                serverData
            );

            const refreshButton = interaction.message.components[0]
                ?.components.find(
                    button => button.customId === `refresh_server:${server.id}`
                );

            const deleteButton = interaction.message.components[0]
                ?.components.find(
                    button => button.customId === `delete_server:${server.id}`
                );

            if (refreshButton && deleteButton) {
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } =
                    await import('discord.js');

                const playersButton = new ButtonBuilder()
                    .setCustomId(`toggle_players:${server.id}`)
                    .setLabel(
                        newShowPlayers
                            ? 'Hide Players'
                            : 'Show Players'
                    )
                    .setEmoji(
                        newShowPlayers
                            ? '🙈'
                            : '👥'
                    )
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder()
                    .addComponents(
                        ButtonBuilder.from(refreshButton),
                        playersButton,
                        ButtonBuilder.from(deleteButton)
                    );

                await interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });

                return;
            }

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {
            console.error(
                `[GameServer Toggle Players] Failed for ${serverId}:`,
                error
            );

            await interaction.editReply({
                content: '❌ حدث خطأ أثناء تغيير إعدادات عرض اللاعبين.',
                embeds: [],
                components: []
            });
        }
    }
};

