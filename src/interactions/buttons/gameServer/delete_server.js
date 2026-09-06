import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    PermissionFlagsBits
} from 'discord.js';

import {
    getGameServerById
} from '../../../services/gameServers/gameServerDatabase.js';

export default {
    name: 'delete_server',

    async execute(interaction, client, args) {
        const [serverId] = args;

        if (!serverId) {
            await interaction.reply({
                content: '❌ Server ID is missing.',
                ephemeral: true
            });
            return;
        }

        if (!interaction.guildId) {
            await interaction.reply({
                content: '❌ This button can only be used inside a Discord server.',
                ephemeral: true
            });
            return;
        }

        if (
            !interaction.member?.permissions?.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {
            await interaction.reply({
                content: '❌ You do not have permission to delete Game Servers.',
                ephemeral: true
            });
            return;
        }

        try {
            const server = await getGameServerById(serverId);

            if (!server) {
                await interaction.reply({
                    content:
                        '❌ Game Server was not found in the database.',
                    ephemeral: true
                });
                return;
            }

            if (server.guild_id !== interaction.guildId) {
                await interaction.reply({
                    content:
                        '❌ You cannot delete a Game Server that belongs to another Discord server.',
                    ephemeral: true
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`delete_server_confirm:${server.id}`)
                .setTitle('Confirm Game Server Deletion');

            const confirmationInput = new TextInputBuilder()
                .setCustomId('server_id')
                .setLabel(`Enter Server ID (${server.id}) to confirm`)
                .setPlaceholder(String(server.id))
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(20);

            const row = new ActionRowBuilder().addComponents(
                confirmationInput
            );

            modal.addComponents(row);

            /*
             * Show the confirmation modal.
             *
             * Do not use awaitModalSubmit() here.
             * Discord will send the Modal Submit as a separate Interaction,
             * which will be handled by:
             *
             * modals/gameServer/delete_server_confirm.js
             */
            await interaction.showModal(modal);

            return;

        } catch (error) {
            console.error(
                `[GameServer Delete] Failed for ${serverId}:`,
                error
            );

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content:
                        '❌ An error occurred while opening the Game Server deletion window.',
                    ephemeral: true
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content:
                        '❌ An error occurred while opening the Game Server deletion window.',
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
};