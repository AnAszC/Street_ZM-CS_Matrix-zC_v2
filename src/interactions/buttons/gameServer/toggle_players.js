import {
    getGameServerById,
    updateGameServer
} from '../../../services/gameServers/gameServerDatabase.js';

import { fetchServerInfo } from '../../../services/gameServers/gameQueryService.js';
import { buildServerEmbed } from '../../../services/gameServers/serverEmbed.js';

export default {
    name: 'toggle_players',

    async execute(interaction, client, args) {
        const [serverId] = args;

        if (!serverId) {
            await interaction.reply({
                content: '❌ Server ID is missing.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        try {
            const server = await getGameServerById(serverId);

            if (!server) {
                await interaction.editReply({
                    content: '❌ Server was not found in the database.',
                    embeds: [],
                    components: []
                });
                return;
            }

            /*
             * Toggle list visibility
             *
             * true  = Show Player List + Bot List
             * false = Hide Player List + Bot List
             */
            const newShowPlayers = server.show_players === false;

            const updatedServer = await updateGameServer(
                server.id,
                {
                    showPlayers: newShowPlayers
                }
            );

            if (!updatedServer) {
                await interaction.editReply({
                    content: '❌ Failed to update player display settings.',
                    embeds: [],
                    components: []
                });
                return;
            }

            /*
             * Fetch the server data again
             */
            const serverData = await fetchServerInfo(updatedServer);

            /*
             * buildServerEmbed now returns:
             *
             * [Main Embed, Lists Embed]
             *
             * or:
             *
             * [Main Embed]
             *
             * when the lists are hidden.
             */
            const embeds = buildServerEmbed(
                updatedServer,
                serverData
            );

            /*
             * Find the existing buttons
             */
            const refreshButton = interaction.message.components[0]
                ?.components.find(
                    button =>
                        button.customId === `refresh_server:${server.id}`
                );

            const deleteButton = interaction.message.components[0]
                ?.components.find(
                    button =>
                        button.customId === `delete_server:${server.id}`
                );

            /*
             * Rebuild the button row while preserving:
             * Refresh
             * Show / Hide Players
             * Delete
             */
            if (refreshButton && deleteButton) {
                const {
                    ActionRowBuilder,
                    ButtonBuilder,
                    ButtonStyle
                } = await import('discord.js');

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
                    embeds,
                    components: [row]
                });

                return;
            }

            /*
             * If the existing buttons could not be found
             */
            await interaction.editReply({
                embeds
            });

        } catch (error) {
            console.error(
                `[GameServer Toggle Players] Failed for ${serverId}:`,
                error
            );

            await interaction.editReply({
                content:
                    '❌ An error occurred while changing player display settings.',
                embeds: [],
                components: []
            });
        }
    }
};