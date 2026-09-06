import {
    getMonitoredGameServers,
    updateGameServerStatus,
    setGameServerMessage
} from './gameServerDatabase.js';

import { fetchServerInfo } from './gameQueryService.js';
import { buildServerEmbed } from './serverEmbed.js';
import { gameServerConfig } from './serverConfig.js';

import { pgDb } from '../../utils/postgresDatabase.js';
import { logger } from '../../utils/logger.js';

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

class ServerMonitorService {
    constructor(client) {
        this.client = client;

        // Prevent multiple monitoring cycles from running at the same time
        this.isChecking = false;

        // Interval identifier
        this.interval = null;

        // Prevent status alerts from being sent during the first check
        this.initializedServers = new Set();

        /*
         * If Discord is already ready, start monitoring immediately.
         * Otherwise, wait for the ready event.
         */
        if (this.client.isReady()) {
            this.startMonitoring();
        } else {
            this.client.once('ready', () => {
                this.startMonitoring();
            });
        }
    }

    startMonitoring() {
        // Prevent the monitoring service from being started twice
        if (this.interval) {
            logger.warn(
                '[GameServer Monitor] Monitoring is already running.'
            );
            return;
        }

        logger.info(
            `[GameServer Monitor] Starting automatic monitoring every ` +
            `${gameServerConfig.updateInterval / 1000}s`
        );

        /*
         * Run the first check immediately after startup
         */
        this.runCheck();

        /*
         * Start the periodic monitoring cycle
         */
        this.interval = setInterval(() => {
            this.runCheck();
        }, gameServerConfig.updateInterval);
    }

    async runCheck() {
        if (this.isChecking) {
            logger.warn(
                '[GameServer Monitor] Previous check is still running, skipping.'
            );
            return;
        }

        this.isChecking = true;

        try {
            if (!pgDb.isAvailable()) {
                logger.warn(
                    '[GameServer Monitor] PostgreSQL is not available.'
                );

                return;
            }

            const servers = await getMonitoredGameServers();

            if (!servers.length) {
                logger.info(
                    '[GameServer Monitor] No monitored game servers found.'
                );

                return;
            }

            logger.info(
                `[GameServer Monitor] Checking ${servers.length} game server(s)...`
            );

            /*
             * Check servers sequentially to avoid sending
             * too many requests at the same time.
             */
            for (const server of servers) {
                try {
                    await this.checkServer(server);
                } catch (error) {
                    logger.error(
                        `[GameServer Monitor] Failed to check server #${server.id}:`,
                        error
                    );
                }
            }

            logger.info(
                '[GameServer Monitor] Monitoring cycle completed.'
            );

        } catch (error) {
            logger.error(
                '[GameServer Monitor] Monitoring cycle failed:',
                error
            );
        } finally {
            this.isChecking = false;
        }
    }

    async checkServer(server) {
        /*
         * Keep the previous status before updating PostgreSQL
         * so we can detect:
         *
         * Online -> Offline
         * Offline -> Online
         */
        const previousOnline = server.last_online;

        /*
         * Query the Game Server
         */
        const serverData = await fetchServerInfo(server);

        /*
         * Save the new server status to PostgreSQL
         */
        const updatedServer = await updateGameServerStatus(
            server.id,
            {
                online: serverData.online,
                players: serverData.players,
                maxPlayers: serverData.maxPlayers,
                map: serverData.map,
                ping: serverData.ping
            }
        );

        if (!updatedServer) {
            logger.warn(
                `[GameServer Monitor] Server #${server.id} disappeared from database.`
            );

            return;
        }

        /*
         * Build the new Embeds
         */
        const embedResult = buildServerEmbed(
            updatedServer,
            serverData
        );

        const embeds = Array.isArray(embedResult)
            ? embedResult
            : [embedResult];

        /*
         * Update the Discord message
         */
        await this.updateServerMessage(
            updatedServer,
            embeds
        );

        /*
         * Do not send an alert during the first check.
         */
        const isFirstCheck = !this.initializedServers.has(
            server.id
        );

        if (!isFirstCheck) {
            await this.handleStatusChange(
                updatedServer,
                previousOnline,
                serverData.online
            );
        }

        this.initializedServers.add(server.id);

        logger.info(
            `[GameServer Monitor] #${server.id} ${server.name}: ` +
            `${serverData.online ? 'ONLINE' : 'OFFLINE'} | ` +
            `${serverData.players}/${serverData.maxPlayers} players | ` +
            `${serverData.map || 'N/A'}`
        );
    }

    async updateServerMessage(server, embeds) {
        /*
         * The server needs a channel_id and message_id
         * so we can update the existing Discord message.
         */
        if (!server.channel_id) {
            logger.warn(
                `[GameServer Monitor] Server #${server.id} ` +
                `does not have a Discord channel configured.`
            );

            return;
        }

        try {
            const channel = await this.client.channels.fetch(
                server.channel_id
            );

            if (!channel) {
                logger.warn(
                    `[GameServer Monitor] Channel ${server.channel_id} ` +
                    `not found for server #${server.id}.`
                );

                return;
            }

            /*
             * If there is no message_id, create a new message.
             */
            if (!server.message_id) {
                await this.createServerMessage(
                    server,
                    channel,
                    embeds
                );

                return;
            }

            try {
                const message = await channel.messages.fetch(
                    server.message_id
                );

                /*
                 * Rebuild the Game Server buttons.
                 */
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

                /*
                 * Update the Embeds and buttons.
                 */
                await message.edit({
                    content: null,
                    embeds,
                    components: [row]
                });

                return;

            } catch (error) {
                /*
                 * Discord error 10008 =
                 * Unknown Message
                 */
                if (error?.code === 10008) {
                    logger.warn(
                        `[GameServer Monitor] Message ${server.message_id} ` +
                        `was deleted for server #${server.id}. ` +
                        `Creating a new message...`
                    );

                    await this.createServerMessage(
                        server,
                        channel,
                        embeds
                    );

                    return;
                }

                throw error;
            }

        } catch (error) {
            logger.error(
                `[GameServer Monitor] Failed to update Discord message ` +
                `for server #${server.id}:`,
                error
            );
        }
    }

    async createServerMessage(server, channel, embeds) {
        try {
            /*
             * Refresh button
             */
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

            /*
             * Send the new message
             */
            const message = await channel.send({
                embeds,
                components: [row]
            });

            /*
             * Save the new channel_id and message_id
             * to PostgreSQL.
             */
            await setGameServerMessage(
                server.id,
                channel.id,
                message.id
            );

            logger.info(
                `[GameServer Monitor] Recreated message for server #${server.id}. ` +
                `New message ID: ${message.id}`
            );

            return message;

        } catch (error) {
            logger.error(
                `[GameServer Monitor] Failed to recreate message ` +
                `for server #${server.id}:`,
                error
            );

            return null;
        }
    }

    async handleStatusChange(
        server,
        previousOnline,
        currentOnline
    ) {
        /*
         * No status change
         */
        if (previousOnline === currentOnline) {
            return;
        }

        /*
         * Alerts are disabled for this server
         */
        if (!server.alert_enabled) {
            logger.info(
                `[GameServer Monitor] Status changed for #${server.id}, ` +
                `but alerts are disabled.`
            );

            return;
        }

        /*
         * Offline -> Online
         */
        if (previousOnline === false && currentOnline === true) {
            await this.sendStatusAlert(
                server,
                'online'
            );

            return;
        }

        /*
         * Online -> Offline
         */
        if (previousOnline === true && currentOnline === false) {
            await this.sendStatusAlert(
                server,
                'offline'
            );
        }
    }

    async sendStatusAlert(server, status) {
        if (!server.alert_channel_id) {
            logger.warn(
                `[GameServer Monitor] Server #${server.id} ` +
                `does not have an alert channel configured.`
            );

            return;
        }

        try {
            const channel = await this.client.channels.fetch(
                server.alert_channel_id
            );

            if (!channel) {
                logger.warn(
                    `[GameServer Monitor] Alert channel ${server.alert_channel_id} ` +
                    `not found for server #${server.id}.`
                );

                return;
            }

            if (!channel.isTextBased()) {
                logger.warn(
                    `[GameServer Monitor] Alert channel ${server.alert_channel_id} ` +
                    `is not text-based for server #${server.id}.`
                );

                return;
            }

            if (status === 'online') {
                await channel.send({
                    content:
                        `🟢 **${server.name}** is back online!\n` +
                        `\`${server.host}:${server.port}\``
                });

                logger.info(
                    `[GameServer Monitor] ONLINE alert sent for #${server.id} ` +
                    `to alert channel ${server.alert_channel_id}.`
                );

                return;
            }

            if (status === 'offline') {
                await channel.send({
                    content:
                        `🔴 **${server.name}** is now offline!\n` +
                        `\`${server.host}:${server.port}\``
                });

                logger.info(
                    `[GameServer Monitor] OFFLINE alert sent for #${server.id} ` +
                    `to alert channel ${server.alert_channel_id}.`
                );
            }

        } catch (error) {
            logger.error(
                `[GameServer Monitor] Failed to send status alert ` +
                `for server #${server.id}:`,
                error
            );
        }
    }

    stopMonitoring() {
        if (!this.interval) {
            return;
        }

        clearInterval(this.interval);
        this.interval = null;

        logger.info(
            '[GameServer Monitor] Automatic monitoring stopped.'
        );
    }
}

export default ServerMonitorService;