import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} from 'discord.js';

import {
    getGameServerById,
    updateGameServer,
    getOwnershipClaimState,
    recordFailedOwnershipAttempt,
    resetOwnershipClaimState
} from '../../../services/gameServers/gameServerDatabase.js';

import { fetchServerInfo } from '../../../services/gameServers/gameQueryService.js';
import { buildServerEmbed } from '../../../services/gameServers/serverEmbed.js';

const FAILED_ATTEMPT_COOLDOWN_SECONDS = 15;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

export default {
    name: 'claim_server_verify',

    async execute(interaction, client, args) {
        const [serverId] = args;

        try {
            await interaction.deferReply({
                ephemeral: true
            });

            /*
             * Discord Server check
             */
            if (!interaction.guildId) {
                await interaction.editReply({
                    content:
                        '❌ This action can only be used inside a Discord server.'
                });
                return;
            }

            /*
             * Permission check
             */
            if (
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {
                await interaction.editReply({
                    content:
                        '❌ You need the **Manage Server** permission to verify Game Server ownership.'
                });
                return;
            }

            /*
             * Server ID check
             */
            if (!serverId) {
                await interaction.editReply({
                    content:
                        '❌ Game Server ID is missing.'
                });
                return;
            }

            const server = await getGameServerById(serverId);

            if (!server) {
                await interaction.editReply({
                    content:
                        '❌ The Game Server was not found in the database.'
                });
                return;
            }

            /*
             * Guild ownership check
             */
            if (server.guild_id !== interaction.guildId) {
                await interaction.editReply({
                    content:
                        '❌ You cannot verify a Game Server from another Discord server.'
                });
                return;
            }

            /*
             * Already verified
             */
            if (server.ownership_verified) {
                await interaction.editReply({
                    content:
                        '✅ This Game Server is already verified.'
                });
                return;
            }

            /*
             * Verification code check
             */
            if (!server.verification_code) {
                await interaction.editReply({
                    content:
                        '❌ This Game Server does not have a verification code.'
                });
                return;
            }

            /*
             * Check persistent claim protection state.
             */
            const claimState =
                await getOwnershipClaimState(
                    server.id,
                    interaction.user.id
                );

            const now = Date.now();

            /*
             * Lock check
             */
            if (
                claimState?.locked_until &&
                new Date(claimState.locked_until).getTime() > now
            ) {
                const remainingSeconds =
                    Math.ceil(
                        (
                            new Date(
                                claimState.locked_until
                            ).getTime() - now
                        ) / 1000
                    );

                const remainingMinutes =
                    Math.ceil(
                        remainingSeconds / 60
                    );

                await interaction.editReply({
                    content:
                        `🔒 **Ownership verification temporarily locked.**\n\n` +
                        `Too many failed verification attempts were detected.\n` +
                        `Please try again in **${remainingMinutes} minute(s)**.`
                });

                return;
            }

            /*
             * Failed-attempt cooldown check.
             */
            if (claimState?.last_attempt_at) {
                const secondsSinceLastAttempt =
                    Math.floor(
                        (
                            now -
                            new Date(
                                claimState.last_attempt_at
                            ).getTime()
                        ) / 1000
                    );

                if (
                    secondsSinceLastAttempt <
                    FAILED_ATTEMPT_COOLDOWN_SECONDS
                ) {
                    const remainingSeconds =
                        FAILED_ATTEMPT_COOLDOWN_SECONDS -
                        secondsSinceLastAttempt;

                    await interaction.editReply({
                        content:
                            `⏳ Please wait **${remainingSeconds} second(s)** before attempting verification again.`
                    });

                    return;
                }
            }

            /*
             * Read submitted verification text.
             */
            const enteredVerification =
                interaction.fields
                    .getTextInputValue(
                        'verification_text'
                    )
                    .trim();

            const gameType =
                String(
                    server.game_type || 'unknown'
                ).toUpperCase();

            const expectedVerification =
                `${gameType} | ${server.verification_code}`;

            /*
             * Compare submitted verification text.
             */
            if (
                enteredVerification.toLowerCase() !==
                expectedVerification.toLowerCase()
            ) {
                const failedState =
                    await recordFailedOwnershipAttempt(
                        server.id,
                        interaction.user.id,
                        MAX_FAILED_ATTEMPTS,
                        LOCK_MINUTES
                    );

                const failedAttempts =
                    Number(
                        failedState?.failed_attempts || 0
                    );

                if (
                    failedState?.locked_until &&
                    new Date(
                        failedState.locked_until
                    ).getTime() > Date.now()
                ) {
                    await interaction.editReply({
                        content:
                            `❌ Invalid verification text.\n\n` +
                            `🔒 You have reached the maximum of **${MAX_FAILED_ATTEMPTS} failed attempts**.\n` +
                            `Please wait **${LOCK_MINUTES} minutes** before trying again.`
                    });

                    return;
                }

                const remainingAttempts =
                    Math.max(
                        0,
                        MAX_FAILED_ATTEMPTS -
                        failedAttempts
                    );

                await interaction.editReply({
                    content:
                        `❌ **Invalid verification text.**\n\n` +
                        `The verification text does not match this Game Server.\n\n` +
                        `Failed attempts: **${failedAttempts}/${MAX_FAILED_ATTEMPTS}**\n` +
                        `Remaining attempts: **${remainingAttempts}**\n\n` +
                        `⏳ You must wait **${FAILED_ATTEMPT_COOLDOWN_SECONDS} seconds** before another attempt.`
                });

                return;
            }

            /*
             * Query the live Game Server.
             *
             * An offline server is not counted as a failed
             * ownership attempt because ownership could not
             * be tested against the live hostname.
             */
            const serverData =
                await fetchServerInfo(server);

            if (!serverData.online) {
                await interaction.editReply({
                    content:
                        '❌ The Game Server is currently offline or did not respond.\n' +
                        'The server must be online so its hostname can be verified.\n\n' +
                        'Your failed-attempt counter was not increased.'
                });

                return;
            }

            /*
             * Validate the live server hostname.
             */
            const liveServerName =
                String(
                    serverData.name || ''
                ).trim();

            const hostnameContainsVerification =
                liveServerName
                    .toLowerCase()
                    .includes(
                        expectedVerification.toLowerCase()
                    );

            if (!hostnameContainsVerification) {
                const failedState =
                    await recordFailedOwnershipAttempt(
                        server.id,
                        interaction.user.id,
                        MAX_FAILED_ATTEMPTS,
                        LOCK_MINUTES
                    );

                const failedAttempts =
                    Number(
                        failedState?.failed_attempts || 0
                    );

                if (
                    failedState?.locked_until &&
                    new Date(
                        failedState.locked_until
                    ).getTime() > Date.now()
                ) {
                    await interaction.editReply({
                        content:
                            `❌ **Ownership verification failed.**\n\n` +
                            `The required verification text was not found in the live server name.\n\n` +
                            `🔒 You have reached the maximum of **${MAX_FAILED_ATTEMPTS} failed attempts**.\n` +
                            `Please wait **${LOCK_MINUTES} minutes** before trying again.`
                    });

                    return;
                }

                const remainingAttempts =
                    Math.max(
                        0,
                        MAX_FAILED_ATTEMPTS -
                        failedAttempts
                    );

                await interaction.editReply({
                    content:
                        `❌ **Ownership verification failed.**\n\n` +
                        `The required verification text was not found in the live server name.\n\n` +
                        `Required:\n` +
                        `\`${expectedVerification}\`\n\n` +
                        `Live Server Name:\n` +
                        `\`${liveServerName || 'Unknown'}\`\n\n` +
                        `Failed attempts: **${failedAttempts}/${MAX_FAILED_ATTEMPTS}**\n` +
                        `Remaining attempts: **${remainingAttempts}**\n\n` +
                        `⏳ You must wait **${FAILED_ATTEMPT_COOLDOWN_SECONDS} seconds** before another attempt.`
                });

                return;
            }

            /*
             * Save verified ownership.
             */
            const updatedServer =
                await updateGameServer(
                    server.id,
                    {
                        ownershipVerified: true,
                        ownerUserId: interaction.user.id,
                        ownerUsername:
                            interaction.user.username,
                        verifiedAt: new Date()
                    }
                );

            if (!updatedServer) {
                await interaction.editReply({
                    content:
                        '❌ Failed to save Game Server ownership verification.'
                });
                return;
            }

            /*
             * Reset protection state after successful verification.
             */
            await resetOwnershipClaimState(
                server.id,
                interaction.user.id
            );

            /*
             * Update the public Game Server message.
             */
            if (
                updatedServer.channel_id &&
                updatedServer.message_id
            ) {
                try {
                    const channel =
                        await interaction.client.channels.fetch(
                            updatedServer.channel_id
                        );

                    if (channel?.isTextBased()) {
                        const message =
                            await channel.messages.fetch(
                                updatedServer.message_id
                            );

                        const embedResult =
                            buildServerEmbed(
                                updatedServer,
                                serverData
                            );

                        const embeds =
                            Array.isArray(embedResult)
                                ? embedResult
                                : [embedResult];

                        const refreshButton =
                            new ButtonBuilder()
                                .setCustomId(
                                    `refresh_server:${updatedServer.id}`
                                )
                                .setLabel('Refresh')
                                .setEmoji('🔄')
                                .setStyle(
                                    ButtonStyle.Secondary
                                );

                        const playersButton =
                            new ButtonBuilder()
                                .setCustomId(
                                    `toggle_players:${updatedServer.id}`
                                )
                                .setLabel(
                                    updatedServer.show_players === false
                                        ? 'Show Players'
                                        : 'Hide Players'
                                )
                                .setEmoji(
                                    updatedServer.show_players === false
                                        ? '👥'
                                        : '🙈'
                                )
                                .setStyle(
                                    ButtonStyle.Primary
                                );

                        const verifiedButton =
                            new ButtonBuilder()
                                .setCustomId(
                                    `claim_server:${updatedServer.id}`
                                )
                                .setLabel('Verified')
                                .setEmoji('✅')
                                .setStyle(
                                    ButtonStyle.Success
                                )
                                .setDisabled(true);

                        const deleteButton =
                            new ButtonBuilder()
                                .setCustomId(
                                    `delete_server:${updatedServer.id}`
                                )
                                .setLabel('Delete')
                                .setEmoji('🗑️')
                                .setStyle(
                                    ButtonStyle.Danger
                                );

                        const row =
                            new ActionRowBuilder()
                                .addComponents(
                                    refreshButton,
                                    playersButton,
                                    verifiedButton,
                                    deleteButton
                                );

                        await message.edit({
                            content: null,
                            embeds,
                            components: [row]
                        });
                    }
                } catch (messageError) {
                    console.warn(
                        `[GameServer Verify] Failed to update public message for server #${server.id}:`,
                        messageError.message
                    );
                }
            }

            /*
             * Success response.
             */
            await interaction.editReply({
                content:
                    `✅ **Game Server Ownership Verified!**\n\n` +
                    `🎮 **Server:** ${updatedServer.name}\n` +
                    `🔐 **Ownership:** Verified\n` +
                    `👤 **Server Manager:** ${interaction.user.username}\n` +
                    `🆔 **Server ID:** \`${updatedServer.id}\``
            });

            console.log(
                `[GameServer Ownership] Server #${updatedServer.id} verified by ${interaction.user.tag}`
            );

        } catch (error) {
            console.error(
                `[GameServer Verify] Failed for ${serverId}:`,
                error
            );

            if (
                interaction.deferred ||
                interaction.replied
            ) {
                await interaction.editReply({
                    content:
                        '❌ An error occurred while verifying Game Server ownership.'
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content:
                        '❌ An error occurred while verifying Game Server ownership.',
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
};