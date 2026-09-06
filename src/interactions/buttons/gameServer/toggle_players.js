
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

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
             * buildServerEmbed returns:
             *
             * [Main Embed, Lists Embed]
             *
             * or:
             *
             * [Main Embed]
             *
             * when the lists are hidden.
             */
            const embedResult = buildServerEmbed(
                updatedServer,
                serverData
            );

            const embeds = Array.isArray(embedResult)
                ? embedResult
                : [embedResult];

            /*
             * Rebuild the complete Game Server button row.
             */
            const refreshButton = new ButtonBuilder()
                .setCustomId(`refresh_server:${updatedServer.id}`)
                .setLabel('Refresh')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary);

            const playersButton = new ButtonBuilder()
                .setCustomId(`toggle_players:${updatedServer.id}`)
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

            const claimButton = new ButtonBuilder()
                .setCustomId(`claim_server:${updatedServer.id}`)
                .setLabel(
                    updatedServer.ownership_verified
                        ? 'Verified'
                        : 'Claim This Server'
                )
                .setEmoji(
                    updatedServer.ownership_verified
                        ? '✅'
                        : '🔐'
                )
                .setStyle(ButtonStyle.Success)
                .setDisabled(
                    updatedServer.ownership_verified === true
                );

            const deleteButton = new ButtonBuilder()
                .setCustomId(`delete_server:${updatedServer.id}`)
                .setLabel('Delete')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder()
                .addComponents(
                    refreshButton,
                    playersButton,
                    claimButton,
                    deleteButton
                );

            /*
             * Update the Embeds and complete button row.
             */
            await interaction.editReply({
                content: null,
                embeds,
                components: [row]
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

