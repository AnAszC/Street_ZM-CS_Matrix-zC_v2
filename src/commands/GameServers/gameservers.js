
import {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ChannelType,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

import {
    getGameServerById,
    setGameServerMessage,
    updateGameServer
} from '../../services/gameServers/gameServerDatabase.js';

import { fetchServerInfo } from '../../services/gameServers/gameQueryService.js';
import { buildServerEmbed } from '../../services/gameServers/serverEmbed.js';
import { createDiscordChannelInvite } from '../../services/discord/discordInviteService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gameserver')
        .setDescription('Manage game servers')

        // =========================
        // Add Game Server
        // =========================

        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new game server')
        )

        // =========================
        // Edit Game Server
        // =========================

        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit a game server')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('Game server ID')
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel where the Game Server message will be displayed')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option
                        .setName('alert-channel')
                        .setDescription('Channel for Online / Offline alerts')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // =========================
        // Add Game Server
        // =========================

        if (subcommand === 'add') {
            const modal = new ModalBuilder()
                .setCustomId('gameserver_add')
                .setTitle('🎮 Add Game Server');

            const nameInput = new TextInputBuilder()
                .setCustomId('server_name')
                .setLabel('Server Name')
                .setPlaceholder('Example: CSMatrix-zC Zombie Server')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100);

            const hostInput = new TextInputBuilder()
                .setCustomId('server_host')
                .setLabel('IP / Host')
                .setPlaceholder('Example: 51.38.123.45')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(255);

            const portInput = new TextInputBuilder()
                .setCustomId('server_port')
                .setLabel('Port')
                .setPlaceholder('Example: 27015')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(5);

            const gameTypeInput = new TextInputBuilder()
                .setCustomId('game_type')
                .setLabel('Game Type')
                .setPlaceholder('cs16')
                .setValue('cs16')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(50);

            const emojiInput = new TextInputBuilder()
                .setCustomId('server_emoji')
                .setLabel('Emoji')
                .setPlaceholder('🎮')
                .setValue('🎮')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(16);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(hostInput),
                new ActionRowBuilder().addComponents(portInput),
                new ActionRowBuilder().addComponents(gameTypeInput),
                new ActionRowBuilder().addComponents(emojiInput)
            );

            await interaction.showModal(modal);
            return;
        }

        // =========================
        // Edit Game Server
        // =========================

        if (subcommand === 'edit') {
            await interaction.deferReply({ ephemeral: true });

            const serverId = interaction.options.getInteger('id');
            const targetChannel =
                interaction.options.getChannel('channel');
            const targetAlertChannel =
                interaction.options.getChannel('alert-channel');

            try {
                const server = await getGameServerById(serverId);

                if (!server) {
                    await interaction.editReply({
                        content:
                            `❌ No Game Server was found with ID \`#${serverId}\`.`
                    });
                    return;
                }

                if (server.guild_id !== interaction.guildId) {
                    await interaction.editReply({
                        content:
                            '❌ You cannot edit a Game Server that belongs to another Discord server.'
                    });
                    return;
                }

                if (
                    !targetChannel ||
                    targetChannel.type !== ChannelType.GuildText
                ) {
                    await interaction.editReply({
                        content:
                            '❌ You must select a text channel for the Game Server message.'
                    });
                    return;
                }

                if (!targetChannel.isTextBased()) {
                    await interaction.editReply({
                        content:
                            '❌ The selected Game Server channel cannot receive messages.'
                    });
                    return;
                }

                if (
                    !targetAlertChannel ||
                    targetAlertChannel.type !== ChannelType.GuildText
                ) {
                    await interaction.editReply({
                        content:
                            '❌ You must select a text channel for Online / Offline alerts.'
                    });
                    return;
                }

                if (!targetAlertChannel.isTextBased()) {
                    await interaction.editReply({
                        content:
                            '❌ The selected alert channel cannot receive messages.'
                    });
                    return;
                }

                const serverData = await fetchServerInfo(server);

                // =========================
                // Discord Invite
                // =========================

                const channelChanged =
                    server.channel_id !== targetChannel.id;

                let discordInvite =
                    server.discord_invite || null;

                if (channelChanged) {
                    discordInvite =
                        await createDiscordChannelInvite(
                            targetChannel
                        );

                    if (!discordInvite) {
                        console.warn(
                            `[GameServer Edit] Could not create Discord invite for target channel ${targetChannel.id}.`
                        );
                    }
                }

                // =========================
                // Build Embeds
                // =========================

                const serverForEmbed = {
                    ...server,
                    discord_invite: discordInvite
                };

                const embedResult = buildServerEmbed(
                    serverForEmbed,
                    serverData
                );

                const embeds = Array.isArray(embedResult)
                    ? embedResult
                    : [embedResult];

                // =========================
                // Game Server Buttons
                // =========================

                const refreshButton = new ButtonBuilder()
                    .setCustomId(`refresh_server:${server.id}`)
                    .setLabel('Refresh')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Secondary);

                const playersButton = new ButtonBuilder()
                    .setCustomId(`toggle_players:${server.id}`)
                    .setLabel(
                        server.show_players
                            ? 'Hide Players'
                            : 'Show Players'
                    )
                    .setEmoji(
                        server.show_players
                            ? '🙈'
                            : '👥'
                    )
                    .setStyle(ButtonStyle.Primary);

                const deleteButton = new ButtonBuilder()
                    .setCustomId(`delete_server:${server.id}`)
                    .setLabel('Delete')
                    .setEmoji('🗑️')
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder()
                    .addComponents(
                        refreshButton,
                        playersButton,
                        deleteButton
                    );

                // =========================
                // Send New Game Server Message
                // =========================

                const newMessage = await targetChannel.send({
                    embeds,
                    components: [row]
                });

                const oldChannelId = server.channel_id;
                const oldMessageId = server.message_id;

                // =========================
                // Save New Message
                // =========================

                await setGameServerMessage(
                    server.id,
                    targetChannel.id,
                    newMessage.id
                );

                // =========================
                // Update Alert Channel
                // =========================

                await updateGameServer(server.id, {
                    alertChannelId: targetAlertChannel.id,
                    discordInvite
                });

                // =========================
                // Delete Old Message
                // =========================

                if (oldChannelId && oldMessageId) {
                    try {
                        const oldChannel =
                            await interaction.client.channels.fetch(
                                oldChannelId
                            );

                        if (
                            oldChannel &&
                            oldChannel.isTextBased()
                        ) {
                            const oldMessage =
                                await oldChannel.messages.fetch(
                                    oldMessageId
                                );

                            await oldMessage.delete();
                        }
                    } catch (deleteError) {
                        if (deleteError?.code === 10008) {
                            console.log(
                                `[GameServer Edit] Old message ${oldMessageId} was already deleted.`
                            );
                        } else {
                            console.error(
                                `[GameServer Edit] Failed to delete old message ${oldMessageId}:`,
                                deleteError
                            );
                        }
                    }
                }

                // =========================
                // Log
                // =========================

                console.log(
                    `[GameServer Edit] Server #${server.id} moved from channel ${oldChannelId || 'none'} to ${targetChannel.id}. ` +
                    `New message ID: ${newMessage.id}. Alert channel: ${targetAlertChannel.id}`
                );

                // =========================
                // Success Response
                // =========================

                await interaction.editReply({
                    content:
                        `✅ Game Server **#${server.id}** was updated successfully.\n\n` +
                        `🎮 **Server:** ${server.name}\n` +
                        `📢 **Game Server Channel:** ${targetChannel}\n` +
                        `🚨 **Alert Channel:** ${targetAlertChannel}\n` +
                        `🆔 **Server ID:** \`${server.id}\``
                });

                return;

            } catch (error) {
                console.error(
                    `[GameServer Edit] Failed to edit server #${serverId}:`,
                    error
                );

                await interaction.editReply({
                    content:
                        '❌ An error occurred while editing the Game Server.\n' +
                        'Make sure the bot has **View Channel** and **Send Messages** permissions in the selected channels.'
                });

                return;
            }
        }
    }
};

