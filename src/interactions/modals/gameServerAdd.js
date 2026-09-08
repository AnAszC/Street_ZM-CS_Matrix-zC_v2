import crypto from 'crypto';
import net from 'node:net';

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
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


/* ========================================
   Game Server Add Protection
======================================== */

const USER_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const USER_RATE_LIMIT_MAX_REQUESTS = 5;

const GUILD_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const GUILD_RATE_LIMIT_MAX_REQUESTS = 20;

const userRateState = new Map();
const guildRateState = new Map();

const activeUserRequests = new Set();


const protectionCleanup = setInterval(() => {
    const now = Date.now();

    for (const [
        userId,
        timestamps
    ] of userRateState.entries()) {
        const filtered =
            timestamps.filter(
                timestamp =>
                    timestamp >
                    now -
                    USER_RATE_LIMIT_WINDOW_MS
            );

        if (filtered.length === 0) {
            userRateState.delete(
                userId
            );
        } else {
            userRateState.set(
                userId,
                filtered
            );
        }
    }

    for (const [
        guildId,
        timestamps
    ] of guildRateState.entries()) {
        const filtered =
            timestamps.filter(
                timestamp =>
                    timestamp >
                    now -
                    GUILD_RATE_LIMIT_WINDOW_MS
            );

        if (filtered.length === 0) {
            guildRateState.delete(
                guildId
            );
        } else {
            guildRateState.set(
                guildId,
                filtered
            );
        }
    }
}, 5 * 60 * 1000);

protectionCleanup.unref?.();


function consumeRateLimit(
    stateMap,
    key,
    windowMs,
    maxRequests
) {
    const now = Date.now();

    let timestamps =
        stateMap.get(
            key
        ) || [];

    timestamps =
        timestamps.filter(
            timestamp =>
                timestamp >
                now -
                windowMs
        );

    if (
        timestamps.length >=
        maxRequests
    ) {
        const oldestTimestamp =
            timestamps[0];

        const retryAfter =
            Math.max(
                1,
                Math.ceil(
                    (
                        oldestTimestamp +
                        windowMs -
                        now
                    ) / 1000
                )
            );

        stateMap.set(
            key,
            timestamps
        );

        return {
            allowed: false,
            retryAfter
        };
    }

    timestamps.push(
        now
    );

    stateMap.set(
        key,
        timestamps
    );

    return {
        allowed: true,
        retryAfter: 0
    };
}


/**
 * Generate a short and readable Game Server verification code.
 *
 * Example:
 * GSM-7K4P9X
 */
function generateVerificationCode() {
    const characters =
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    let randomPart = '';

    for (let i = 0; i < 6; i++) {
        const randomIndex =
            crypto.randomInt(
                0,
                characters.length
            );

        randomPart +=
            characters[randomIndex];
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
function getVerificationGameType(
    gameType
) {
    return String(
        gameType ||
        'unknown'
    ).toUpperCase();
}


/**
 * Normalize the game server host.
 *
 * Examples:
 * 46.174.50.74           -> 46.174.50.74
 * 46.174.50.74:27015     -> 46.174.50.74
 * example.com             -> example.com
 * example.com:27015      -> example.com
 * [2001:db8::1]:27015    -> 2001:db8::1
 */
function normalizeGameServerHost(
    value
) {
    let host =
        String(
            value ||
            ''
        ).trim();

    if (!host) {
        return '';
    }

    host =
        host
            .replace(
                'http://',
                ''
            )
            .replace(
                'https://',
                '');

    host =
        host.split('/')[0];

    if (
        host.startsWith('[')
    ) {
        const closingBracket =
            host.indexOf(']');

        if (
            closingBracket !==
            -1
        ) {
            return host.slice(
                1,
                closingBracket
            );
        }
    }

    if (
        net.isIP(
            host
        )
    ) {
        return host;
    }

    const portSeparator =
        host.lastIndexOf(':');

    if (
        portSeparator >
        -1
    ) {
        const possiblePort =
            host.slice(
                portSeparator + 1
            );

        if (
            /^\d{1,5}$/.test(
                possiblePort
            )
        ) {
            return host.slice(
                0,
                portSeparator
            );
        }
    }

    return host;
}


export default {
    name: 'gameserver_add',

    async execute(
        interaction,
        client,
        args
    ) {
        const userId =
            interaction.user?.id ||
            'unknown';

        const guildId =
            interaction.guildId ||
            null;

        try {
            // =========================
            // Guild Validation
            // =========================

            if (!guildId) {
                await interaction.reply({
                    content:
                        '❌ This command cannot be used inside DMs.',
                    ephemeral: true
                });

                return;
            }

            // =========================
            // Permission Check
            // =========================

            if (
                !interaction.memberPermissions?.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {
                await interaction.reply({
                    content:
                        '❌ You need the **Manage Server** permission to add a Game Server.',
                    ephemeral: true
                });

                return;
            }

            // =========================
            // Prevent Concurrent Requests
            // =========================

            if (
                activeUserRequests.has(
                    userId
                )
            ) {
                await interaction.reply({
                    content:
                        '⏳ You already have a Game Server add operation in progress.\n' +
                        'Please wait for it to finish before starting another one.',
                    ephemeral: true
                });

                return;
            }

            // =========================
            // Read Modal Data
            // =========================

            const name =
                interaction.fields
                    .getTextInputValue(
                        'server_name'
                    )
                    .trim();

            const rawHost =
                interaction.fields
                    .getTextInputValue(
                        'server_host'
                    )
                    .trim();

            const host =
                normalizeGameServerHost(
                    rawHost
                );

            const portValue =
                interaction.fields
                    .getTextInputValue(
                        'server_port'
                    )
                    .trim();

            const gameType =
                interaction.fields
                    .getTextInputValue(
                        'game_type'
                    )
                    .trim()
                    .toLowerCase();

            let emoji =
                '🎮';

            try {
                const emojiValue =
                    interaction.fields
                        .getTextInputValue(
                            'server_emoji'
                        )
                        .trim();

                if (
                    emojiValue
                ) {
                    emoji =
                        emojiValue;
                }
            } catch {
                // Emoji is optional
            }

            // =========================
            // Validation
            // =========================

            if (!name) {
                await interaction.reply({
                    content:
                        '❌ You must enter a server name.',
                    ephemeral: true
                });

                return;
            }

            if (!host) {
                await interaction.reply({
                    content:
                        '❌ You must enter the server IP or Host.',
                    ephemeral: true
                });

                return;
            }

            const port =
                Number(
                    portValue
                );

            if (
                !Number.isInteger(
                    port
                ) ||
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
                    content:
                        '❌ You must enter the game type.',
                    ephemeral: true
                });

                return;
            }

            // GameDig currently supports cs16 in this feature
            const supportedGameTypes = [
                'cs16'
            ];

            if (
                !supportedGameTypes.includes(
                    gameType
                )
            ) {
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
            // Per-User Rate Limit
            // =========================

            const userRateResult =
                consumeRateLimit(
                    userRateState,
                    userId,
                    USER_RATE_LIMIT_WINDOW_MS,
                    USER_RATE_LIMIT_MAX_REQUESTS
                );

            if (
                !userRateResult.allowed
            ) {
                await interaction.reply({
                    content:
                        '⏳ You have reached the Game Server add limit.\n' +
                        `Please try again in **${userRateResult.retryAfter}s**.`,
                    ephemeral: true
                });

                return;
            }

            // =========================
            // Per-Guild Rate Limit
            // =========================

            const guildRateResult =
                consumeRateLimit(
                    guildRateState,
                    guildId,
                    GUILD_RATE_LIMIT_WINDOW_MS,
                    GUILD_RATE_LIMIT_MAX_REQUESTS
                );

            if (
                !guildRateResult.allowed
            ) {
                await interaction.reply({
                    content:
                        '⚠️ This server has reached the Game Server add limit.\n' +
                        `Please try again in **${guildRateResult.retryAfter}s**.`,
                    ephemeral: true
                });

                return;
            }

            // =========================
            // Lock User Request
            // =========================

            activeUserRequests.add(
                userId
            );

            try {
                // =========================
                // Prevent Duplicate Servers
                // =========================

                const existingServer =
                    await findGameServerByAddress(
                        guildId,
                        host,
                        port
                    );

                if (
                    existingServer
                ) {
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
                // Defer Before Gamedig
                // =========================

                await interaction.deferReply({
                    ephemeral: true
                });

                // =========================
                // Verify Game Server
                // =========================

                let serverData;

                try {
                    serverData =
                        await fetchServerInfo(
                            {
                                name,
                                host,
                                port,
                                type:
                                    gameType
                            },
                            {
                                throwOnFailure:
                                    true
                            }
                        );

                } catch (error) {
                    console.error(
                        `[GameServer Add] Game server verification failed for ${host}:${port}:`,
                        error.message
                    );

                    await interaction.editReply({
                        content:
                            '❌ Unable to reach the Game Server.\n\n' +
                            `**Address:** \`${host}:${port}\`\n` +
                            `**Game:** \`${gameType}\`\n\n` +
                            'The server must be online and reachable from the Internet before it can be added.'
                    });

                    return;
                }

                if (
                    !serverData ||
                    serverData.querySuccess !==
                        true ||
                    serverData.online !==
                        true
                ) {
                    await interaction.editReply({
                        content:
                            '❌ The Game Server could not be verified.\n\n' +
                            `**Address:** \`${host}:${port}\`\n` +
                            `**Game:** \`${gameType}\`\n\n` +
                            'The server must be online and reachable from the Internet before it can be added.'
                    });

                    return;
                }

                // =========================
                // Generate Ownership Code
                // =========================

                const verificationCode =
                    generateVerificationCode();

                const verificationGameType =
                    getVerificationGameType(
                        gameType
                    );

                const verificationValue =
                    `${verificationGameType} | ${verificationCode}`;

                // =========================
                // Create Server in PostgreSQL
                // =========================

                const server =
                    await createGameServer({
                        guildId:
                            guildId,

                        name,

                        host,

                        port,

                        gameType,

                        emoji,

                        verificationCode,

                        ownershipVerified:
                            false,

                        ownerUserId:
                            null,

                        ownerUsername:
                            null,

                        verifiedAt:
                            null,

                        monitorEnabled:
                            true,

                        alertEnabled:
                            true
                    });

                // =========================
                // Build Embeds
                // =========================

                const embedResult =
                    buildServerEmbed(
                        server,
                        serverData
                    );

                const embeds =
                    Array.isArray(
                        embedResult
                    )
                        ? embedResult
                        : [embedResult];

                // =========================
                // Game Server Buttons
                // =========================

                const refreshButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `refresh_server:${server.id}`
                        )
                        .setLabel(
                            'Refresh'
                        )
                        .setEmoji(
                            '🔄'
                        )
                        .setStyle(
                            ButtonStyle.Secondary
                        );

                const playersButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `toggle_players:${server.id}`
                        )
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
                        .setStyle(
                            ButtonStyle.Primary
                        );

                const claimButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `claim_server:${server.id}`
                        )
                        .setLabel(
                            'Claim This Server'
                        )
                        .setEmoji(
                            '🔐'
                        )
                        .setStyle(
                            ButtonStyle.Success
                        );

                const deleteButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `delete_server:${server.id}`
                        )
                        .setLabel(
                            'Delete'
                        )
                        .setEmoji(
                            '🗑️'
                        )
                        .setStyle(
                            ButtonStyle.Danger
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            refreshButton,
                            playersButton,
                            claimButton,
                            deleteButton
                        );

                // =========================
                // Send Message
                // =========================

                await interaction.editReply({
                    content:
                        `✅ Game Server **${server.name}** was added successfully.`,
                    embeds,
                    components: [
                        row
                    ]
                });

                const message =
                    await interaction.fetchReply();

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

                const discordInvite =
                    await createDiscordChannelInvite(
                        interaction.channel
                    );

                if (
                    discordInvite
                ) {
                    const updatedServer =
                        await updateGameServer(
                            server.id,
                            {
                                discordInvite
                            }
                        );

                    const updatedEmbedResult =
                        buildServerEmbed(
                            updatedServer || {
                                ...server,
                                discord_invite:
                                    discordInvite
                            },
                            serverData
                        );

                    const updatedEmbeds =
                        Array.isArray(
                            updatedEmbedResult
                        )
                            ? updatedEmbedResult
                            : [updatedEmbedResult];

                    await message.edit({
                        content: null,
                        embeds:
                            updatedEmbeds,
                        components: [
                            row
                        ]
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
                    `to guild ${guildId}`
                );

                console.log(
                    `[GameServer Ownership] Verification code generated for server #${server.id}: ${verificationValue}`
                );

            } finally {
                activeUserRequests.delete(
                    userId
                );
            }

        } catch (error) {
            console.error(
                '[GameServer Add] Error:',
                error
            );

            activeUserRequests.delete(
                userId
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                await interaction.reply({
                    content:
                        '❌ An error occurred while adding the Game Server.\n' +
                        'Please check the server information and try again.',
                    ephemeral: true
                });

                return;
            }

            if (
                interaction.deferred &&
                !interaction.replied
            ) {
                try {
                    await interaction.editReply({
                        content:
                            '❌ An error occurred while adding the Game Server.\n' +
                            'Please check the server information and try again.'
                    });

                } catch {
                    // Ignore interaction edit errors
                }

                return;
            }

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