
import crypto from 'crypto';

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

import {
    createGameServer,
    findGameServerByAddress,
    setGameServerMessage,
    updateGameServer
} from '../../services/gameServers/gameServerDatabase.js';

import { fetchServerInfo } from '../../services/gameServers/gameQueryService.js';
import { buildServerEmbed } from '../../services/gameServers/serverEmbed.js';
import { createDiscordChannelInvite } from '../../services/discord/discordInviteService.js';

/**
 * Generate a short and readable Game Server verification code.
 *
 * Example:
 * GSM-7K4P9X
 */
function generateVerificationCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let randomPart = '';

    for (let i = 0; i < 6; i++) {
        const randomIndex = crypto.randomInt(
            0,
            characters.length
        );

        randomPart += characters[randomIndex];
    }

    return `GSM-${randomPart}`;
}

/**
 * Convert the stored game type into the display format used
 * by the Ownership Verification system.
 *
 * Example:
 * cs16 -> CS16
 */
function getVerificationGameType(gameType) {
    return String(gameType || 'unknown').toUpperCase();
}

export default {
    name: 'gameserver_add',

    async execute(interaction, client, args) {
        try {
            // The command must be used inside a Discord server
            if (!interaction.guildId) {
                await interaction.reply({
                    content: '❌ This command cannot be used inside DMs.',
                    ephemeral: true
                });
                return;
            }

            // Read modal data
            const name = interaction.fields
                .getTextInputValue('server_name')
                .trim();

            const host = interaction.fields
                .getTextInputValue('server_host')
                .trim();

            const portValue = interaction.fields
                .getTextInputValue('server_port')
                .trim();

            const gameType = interaction.fields
                .getTextInputValue('game_type')
                .trim()
                .toLowerCase();

            let emoji = '🎮';

            try {
                const emojiValue = interaction.fields
                    .getTextInputValue('server_emoji')
                    .trim();

                if (emojiValue) {
                    emoji = emojiValue;
                }
            } catch {
                // Emoji is optional
            }

            // =========================
            // Validation
            // =========================

            if (!name) {
                await interaction.reply({
                    content: '❌ You must enter a server name.',
                    ephemeral: true
                });
                return;
            }

            if (!host) {
                await interaction.reply({
                    content: '❌ You must enter the server IP or Host.',
                    ephemeral: true
                });
                return;
            }

            const port = Number(portValue);

            if (
                !Number.isInteger(port) ||
                port < 1 ||
                port > 65535
            ) {
                await interaction.reply({
                    content:
                        '❌ Invalid Port.\n' +
                        'The port must be a number between `1` and `65535`.',
                    ephemeral: true
                });
                return;
            }

            if (!gameType) {
                await interaction.reply({
                    content: '❌ You must enter the game type.',
                    ephemeral: true
                });
                return;
            }

            // GameDig currently supports cs16 in this feature
            const supportedGameTypes = [
                'cs16'
            ];

            if (!supportedGameTypes.includes(gameType)) {
                await interaction.reply({
                    content:
                        '❌ This game type is not currently supported.\n\n' +
                        'Currently supported types:\n' +
                        '`cs16` — Counter-Strike 1.6',
                    ephemeral: true
                });
                return;
            }

            // =========================
            // Prevent Duplicate Servers
            // =========================

            const existingServer = await findGameServerByAddress(
                interaction.guildId,
                host,
                port
            );

            if (existingServer) {
                await interaction.reply({
                    content:
                        '⚠️ This server already exists in the database.\n\n' +
                        `**Server:** ${existingServer.name}\n` +
                        `**Address:** \`${existingServer.host}:${existingServer.port}\`\n` +
                        `**ID:** \`${existingServer.id}\``,
                    ephemeral: true
                });
                return;
            }

            // =========================
            // Generate Ownership Code
            // =========================

            const verificationCode = generateVerificationCode();
            const verificationGameType =
                getVerificationGameType(gameType);

            const verificationValue =
                `${verificationGameType} | ${verificationCode}`;

            // =========================
            // Create Server in PostgreSQL
            // =========================

            const server = await createGameServer({
                guildId: interaction.guildId,
                name,
                host,
                port,
                gameType,
                emoji,
                verificationCode,
                ownershipVerified: false,
                ownerUserId: null,
                ownerUsername: null,
                verifiedAt: null,
                monitorEnabled: true,
                alertEnabled: true
            });

            // =========================
            // Query Server Immediately
            // =========================

            const serverData = await fetchServerInfo(server);

            // =========================
            // Build Embeds
            // =========================

            const embedResult = buildServerEmbed(
                server,
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
                    server.show_players === false
                        ? 'Show Players'
                        : 'Hide Players'
                )
                .setEmoji(
                    server.show_players === false
                        ? '👥'
                        : '🙈'
                )
                .setStyle(ButtonStyle.Primary);

            const claimButton = new ButtonBuilder()
                .setCustomId(`claim_server:${server.id}`)
                .setLabel('Claim This Server')
                .setEmoji('🔐')
                .setStyle(ButtonStyle.Success);

            const deleteButton = new ButtonBuilder()
                .setCustomId(`delete_server:${server.id}`)
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

            // =========================
            // Send Message
            // =========================

            const message = await interaction.reply({
                content:
                    `✅ Game Server **${server.name}** was added successfully.`,
                embeds,
                components: [row],
                fetchReply: true
            });

            // =========================
            // Save Channel ID + Message ID
            // =========================

            await setGameServerMessage(
                server.id,
                interaction.channelId,
                message.id
            );

            // =========================
            // Create Discord Invite
            // =========================

            const discordInvite = await createDiscordChannelInvite(
                interaction.channel
            );

            if (discordInvite) {
                // Save the invite URL in the database
                const updatedServer = await updateGameServer(
                    server.id,
                    {
                        discordInvite
                    }
                );

                // Rebuild the Embeds after adding the Discord invite
                const updatedEmbedResult = buildServerEmbed(
                    updatedServer || {
                        ...server,
                        discord_invite: discordInvite
                    },
                    serverData
                );

                const updatedEmbeds = Array.isArray(updatedEmbedResult)
                    ? updatedEmbedResult
                    : [updatedEmbedResult];

                // Update the message to display the Discord invite
                await message.edit({
                    content: null,
                    embeds: updatedEmbeds,
                    components: [row]
                });

                console.log(
                    `[GameServer] Discord invite created for server #${server.id}: ${discordInvite}`
                );
            } else {
                console.warn(
                    `[GameServer] Could not create Discord invite for server #${server.id}.`
                );
            }

            console.log(
                `[GameServer] Added server #${server.id} ` +
                `${server.host}:${server.port} ` +
                `to guild ${interaction.guildId}`
            );

            console.log(
                `[GameServer Ownership] Verification code generated for server #${server.id}: ${verificationValue}`
            );

        } catch (error) {
            console.error(
                '[GameServer Add] Error:',
                error
            );

            // If an error occurs before replying
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content:
                        '❌ An error occurred while adding the Game Server.\n' +
                        'Please check the server information and try again.',
                    ephemeral: true
                });

                return;
            }

            // If the interaction has already been replied to
            try {
                await interaction.followUp({
                    content:
                        '❌ An error occurred while saving the Game Server data.',
                    ephemeral: true
                });
            } catch {
                // Ignore follow-up response errors
            }
        }
    }
};

