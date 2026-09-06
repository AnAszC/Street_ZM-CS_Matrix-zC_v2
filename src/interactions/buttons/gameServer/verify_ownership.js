
import {
    PermissionFlagsBits,
    ModalBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';

import {
    getGameServerById,
    getOwnershipClaimState
} from '../../../services/gameServers/gameServerDatabase.js';

const FAILED_ATTEMPT_COOLDOWN_SECONDS = 15;

export default {
    name: 'verify_ownership',

    async execute(interaction, client, args) {
        const [serverId] = args;

        if (!serverId) {
            await interaction.reply({
                content:
                    '❌ Game Server ID is missing.',
                ephemeral: true
            });
            return;
        }

        if (!interaction.guildId) {
            await interaction.reply({
                content:
                    '❌ This action can only be used inside a Discord server.',
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
                content:
                    '❌ You need **Manage Server** permission to verify a Game Server.',
                ephemeral: true
            });
            return;
        }

        try {
            const server =
                await getGameServerById(serverId);

            if (!server) {
                await interaction.reply({
                    content:
                        '❌ The Game Server was not found in the database.',
                    ephemeral: true
                });
                return;
            }

            if (
                server.guild_id !==
                interaction.guildId
            ) {
                await interaction.reply({
                    content:
                        '❌ You cannot verify a Game Server from another Discord server.',
                    ephemeral: true
                });
                return;
            }

            if (server.ownership_verified) {
                await interaction.reply({
                    content:
                        '✅ This Game Server is already verified.',
                    ephemeral: true
                });
                return;
            }

            const claimState =
                await getOwnershipClaimState(
                    server.id,
                    interaction.user.id
                );

            /*
             * Temporary lock after too many failures.
             */
            if (claimState?.locked_until) {
                const lockedUntil =
                    new Date(
                        claimState.locked_until
                    );

                if (
                    lockedUntil.getTime() >
                    Date.now()
                ) {
                    const remainingMinutes =
                        Math.ceil(
                            (
                                lockedUntil.getTime() -
                                Date.now()
                            ) / 60000
                        );

                    await interaction.reply({
                        content:
                            `🔒 Ownership verification is temporarily locked.\n` +
                            `Please try again in approximately **${remainingMinutes} minute(s)**.`,
                        ephemeral: true
                    });
                    return;
                }
            }

            /*
             * Cooldown after a failed verification.
             */
            if (claimState?.last_attempt_at) {
                const lastAttempt =
                    new Date(
                        claimState.last_attempt_at
                    ).getTime();

                const elapsed =
                    (
                        Date.now() -
                        lastAttempt
                    ) / 1000;

                if (
                    elapsed <
                    FAILED_ATTEMPT_COOLDOWN_SECONDS
                ) {
                    const remaining =
                        Math.ceil(
                            FAILED_ATTEMPT_COOLDOWN_SECONDS -
                            elapsed
                        );

                    await interaction.reply({
                        content:
                            `⏳ Please wait **${remaining}s** before trying verification again.`,
                        ephemeral: true
                    });
                    return;
                }
            }

            if (!server.verification_code) {
                await interaction.reply({
                    content:
                        '❌ This Game Server does not have a verification code.',
                    ephemeral: true
                });
                return;
            }

            const gameType =
                String(
                    server.game_type || 'unknown'
                ).toUpperCase();

            const verificationValue =
                `${gameType} | ${server.verification_code}`;

            const modal =
                new ModalBuilder()
                    .setCustomId(
                        `claim_server_verify:${server.id}`
                    )
                    .setTitle(
                        '🔐 Verify Game Server Ownership'
                    );

            const verificationInput =
                new TextInputBuilder()
                    .setCustomId(
                        'verification_text'
                    )
                    .setLabel(
                        'Enter the verification text'
                    )
                    .setPlaceholder(
                        verificationValue
                    )
                    .setStyle(
                        TextInputStyle.Short
                    )
                    .setRequired(true)
                    .setMaxLength(64);

            modal.addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        verificationInput
                    )
            );

            await interaction.showModal(
                modal
            );

        } catch (error) {
            console.error(
                `[GameServer Verify] Failed for ${serverId}:`,
                error
            );

            await interaction.reply({
                content:
                    '❌ An error occurred while opening ownership verification.',
                ephemeral: true
            }).catch(() => {});
        }
    }
};

