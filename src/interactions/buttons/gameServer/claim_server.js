
import crypto from 'crypto';

import {
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

import {
    getGameServerById,
    updateGameServer,
    findGameServerByVerificationCode,
    getOwnershipClaimState,
    recordOwnershipClaimRequest
} from '../../../services/gameServers/gameServerDatabase.js';

const CLAIM_COOLDOWN_SECONDS = 30;

/**
 * Generate a short, readable verification code.
 *
 * Example:
 * GSM-7K4P9X
 */
function generateVerificationCode() {
    const characters =
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let randomPart = '';

    for (let i = 0; i < 6; i++) {
        randomPart += characters[
            crypto.randomInt(
                0,
                characters.length
            )
        ];
    }

    return `GSM-${randomPart}`;
}

/**
 * Generate a globally unique verification code.
 */
async function generateUniqueVerificationCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
        const code = generateVerificationCode();

        const existing =
            await findGameServerByVerificationCode(code);

        if (!existing) {
            return code;
        }
    }

    throw new Error(
        'Unable to generate a unique verification code.'
    );
}

export default {
    name: 'claim_server',

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
                    '❌ You need **Manage Server** permission to claim a Game Server.',
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
                        '❌ You cannot claim a Game Server from another Discord server.',
                    ephemeral: true
                });
                return;
            }

            if (server.ownership_verified) {
                await interaction.reply({
                    content:
                        '✅ This Game Server has already been verified.\n' +
                        `👤 **Server Manager:** ${server.owner_username || 'Unknown'}`,
                    ephemeral: true
                });
                return;
            }

            /*
             * Check Claim cooldown.
             */
            const claimState =
                await getOwnershipClaimState(
                    server.id,
                    interaction.user.id
                );

            if (claimState?.last_claim_at) {
                const lastClaim =
                    new Date(
                        claimState.last_claim_at
                    ).getTime();

                const elapsed =
                    (Date.now() - lastClaim) / 1000;

                if (
                    elapsed <
                    CLAIM_COOLDOWN_SECONDS
                ) {
                    const remaining =
                        Math.ceil(
                            CLAIM_COOLDOWN_SECONDS -
                            elapsed
                        );

                    await interaction.reply({
                        content:
                            `⏳ Please wait **${remaining}s** before requesting another ownership claim.`,
                        ephemeral: true
                    });
                    return;
                }
            }

            /*
             * Generate a verification code for older servers.
             */
            let verificationCode =
                server.verification_code;

            if (!verificationCode) {
                verificationCode =
                    await generateUniqueVerificationCode();

                const updatedServer =
                    await updateGameServer(
                        server.id,
                        {
                            verificationCode
                        }
                    );

                if (!updatedServer) {
                    await interaction.reply({
                        content:
                            '❌ Failed to generate and save the Game Server verification code.',
                        ephemeral: true
                    });
                    return;
                }

                verificationCode =
                    updatedServer.verification_code;
            }

            await recordOwnershipClaimRequest(
                server.id,
                interaction.user.id
            );

            const gameType =
                String(
                    server.game_type || 'unknown'
                ).toUpperCase();

            const verificationValue =
                `${gameType} | ${verificationCode}`;

            const verifyButton =
                new ButtonBuilder()
                    .setCustomId(
                        `verify_ownership:${server.id}`
                    )
                    .setLabel('Verify Ownership')
                    .setEmoji('✅')
                    .setStyle(
                        ButtonStyle.Success
                    );

            const row =
                new ActionRowBuilder()
                    .addComponents(
                        verifyButton
                    );

            await interaction.reply({
                content:
                    `🔐 **Claim This Game Server**\n\n` +
                    `🎮 **Game Type:** \`${gameType}\`\n` +
                    `🔑 **Verification:** \`${verificationValue}\`\n\n` +
                    `Add the following text to your game server name:\n\n` +
                    `\`${verificationValue}\`\n\n` +
                    `The verification code is unique to this Game Server.\n` +
                    `After updating the server name, click **Verify Ownership**.`,
                components: [row],
                ephemeral: true
            });

        } catch (error) {
            console.error(
                `[GameServer Claim] Failed for ${serverId}:`,
                error
            );

            await interaction.reply({
                content:
                    '❌ An error occurred while preparing Game Server ownership verification.',
                ephemeral: true
            }).catch(() => {});
        }
    }
};

