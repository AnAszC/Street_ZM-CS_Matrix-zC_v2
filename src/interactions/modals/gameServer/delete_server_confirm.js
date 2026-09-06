import {
    PermissionFlagsBits
} from 'discord.js';

import {
    getGameServerById,
    deleteGameServer
} from '../../../services/gameServers/gameServerDatabase.js';

export default {
    name: 'delete_server_confirm',

    async execute(interaction) {
        const [, serverId] = interaction.customId.split(':');

        try {
            await interaction.deferReply({
                ephemeral: true
            });

            if (!interaction.guildId) {
                await interaction.editReply({
                    content: '❌ This action can only be used inside a Discord server.'
                });
                return;
            }

            if (
                !interaction.member?.permissions?.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {
                await interaction.editReply({
                    content: '❌ You do not have permission to delete Game Servers.'
                });
                return;
            }

            if (!serverId) {
                await interaction.editReply({
                    content: '❌ Game Server ID is missing.'
                });
                return;
            }

            const server = await getGameServerById(serverId);

            if (!server) {
                await interaction.editReply({
                    content: '❌ The Game Server was not found in the database.'
                });
                return;
            }

            if (server.guild_id !== interaction.guildId) {
                await interaction.editReply({
                    content: '❌ You cannot delete a Game Server belonging to another Discord server.'
                });
                return;
            }

            const enteredId =
                interaction.fields
                    .getTextInputValue('server_id')
                    .trim();

            if (enteredId !== String(server.id)) {
                await interaction.editReply({
                    content:
                        `❌ Invalid Game Server ID.\n` +
                        `You must enter \`${server.id}\` exactly.`
                });
                return;
            }

            const deletedServer = await deleteGameServer(
                server.id,
                interaction.guildId
            );

            if (!deletedServer) {
                await interaction.editReply({
                    content:
                        '❌ Failed to delete the Game Server from the database.'
                });
                return;
            }

            /*
             * Delete the Game Server message associated with the server.
             * We do not rely on interaction.message because the Modal Submit
             * is a separate interaction from the delete button.
             */
            if (server.channel_id && server.message_id) {
                try {
                    const channel =
                        await interaction.client.channels.fetch(
                            server.channel_id
                        );

                    if (channel?.isTextBased()) {
                        const message =
                            await channel.messages.fetch(
                                server.message_id
                            );

                        await message.delete();
                    }
                } catch (deleteMessageError) {
                    if (deleteMessageError?.code === 10008) {
                        console.log(
                            `[GameServer Delete] Message ${server.message_id} was already deleted.`
                        );
                    } else {
                        console.warn(
                            `[GameServer Delete] Failed to delete message ${server.message_id}:`,
                            deleteMessageError.message
                        );
                    }
                }
            }

            await interaction.editReply({
                content:
                    `✅ Game Server **#${server.id}** was deleted successfully.\n` +
                    `🎮 **Server:** ${server.name}`
            });

            console.log(
                `[GameServer Delete] Server #${server.id} deleted by ${interaction.user.tag}`
            );

        } catch (error) {
            console.error(
                `[GameServer Delete] Failed for ${serverId}:`,
                error
            );

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content:
                        '❌ An error occurred while deleting the Game Server.'
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content:
                        '❌ An error occurred while deleting the Game Server.',
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
};