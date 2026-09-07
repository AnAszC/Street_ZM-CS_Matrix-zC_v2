
import {
    getMonitoredGameServers,
    updateGameServerStatus,
    setGameServerMessage,
    updateGameServerLocation,
    deleteGameServer
} from './gameServerDatabase.js';

import {
    recordGameServerHistory,
    recordGameServerPlayerPresence,
    recordServerRankSnapshot
} from './serverStatisticsDatabase.js';

import { fetchServerInfo } from './gameQueryService.js';
import { getIpLocation } from './geoIpService.js';
import { buildServerEmbed } from './serverEmbed.js';
import { gameServerConfig } from './serverConfig.js';

import { pgDb } from '../../utils/postgresDatabase.js';
import { logger } from '../../utils/logger.js';

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';


/* =========================
   QUERY FAILURE SETTINGS
========================= */

/*
 * Number of consecutive Query failures
 * before the Game Server is removed.
 */
const MAX_QUERY_FAILURES = 5;


/* =========================
   SERVER MONITOR SERVICE
========================= */

class ServerMonitorService {

    constructor(client) {

        this.client = client;

        /*
         * Prevent multiple monitoring cycles
         * from running at the same time.
         */
        this.isChecking = false;

        /*
         * Interval identifier.
         */
        this.interval = null;

        /*
         * Prevent status alerts from being sent
         * during the first successful check.
         */
        this.initializedServers = new Set();

        /*
         * Number of consecutive Query failures
         * for each server.
         *
         * Example:
         *
         * #21 -> 1
         * #21 -> 2
         * #21 -> 3
         *
         * Successful Query:
         *
         * #21 -> counter removed
         */
        this.queryFailureCounts = new Map();


        /*
         * If Discord is already ready,
         * start monitoring immediately.
         *
         * Otherwise wait for ready.
         */
        if (this.client.isReady()) {

            this.startMonitoring();

        } else {

            this.client.once(
                'ready',
                () => {
                    this.startMonitoring();
                }
            );
        }
    }


    /* =========================
       START MONITORING
    ========================= */

    startMonitoring() {

        /*
         * Prevent the monitoring service
         * from being started twice.
         */
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
         * Run the first check immediately.
         */
        this.runCheck();


        /*
         * Start periodic monitoring.
         */
        this.interval =
            setInterval(
                () => {
                    this.runCheck();
                },
                gameServerConfig.updateInterval
            );
    }


    /* =========================
       MONITORING CYCLE
    ========================= */

    async runCheck() {

        /*
         * Prevent overlapping monitoring cycles.
         */
        if (this.isChecking) {

            logger.warn(
                '[GameServer Monitor] Previous check is still running, skipping.'
            );

            return;
        }


        this.isChecking = true;


        try {

            /*
             * PostgreSQL must be available.
             */
            if (!pgDb.isAvailable()) {

                logger.warn(
                    '[GameServer Monitor] PostgreSQL is not available.'
                );

                return;
            }


            /*
             * Get only monitored servers.
             */
            const servers =
                await getMonitoredGameServers();


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
             * Check servers sequentially.
             */
            for (const server of servers) {

                try {

                    await this.checkServer(
                        server
                    );

                } catch (error) {

                    logger.error(
                        `[GameServer Monitor] Failed to check server #${server.id}:`,
                        error
                    );
                }
            }


            /*
             * Save the daily
             * CSMatrix-zC WORLD ranking.
             */
            try {

                await recordServerRankSnapshot();

            } catch (error) {

                logger.error(
                    '[GameServer Monitor] Failed to record server rank snapshot:',
                    error
                );
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


    /* =========================
       CHECK SINGLE SERVER
    ========================= */

    async checkServer(server) {

        /*
         * Save previous status before updating
         * PostgreSQL.
         */
        const previousOnline =
            server.last_online;


        /*
         * Query the Game Server.
         *
         * throwOnFailure=true means that a
         * complete Query failure is thrown
         * and handled below.
         */
        let serverData;


        try {

            serverData =
                await fetchServerInfo(
                    server,
                    {
                        throwOnFailure: true
                    }
                );


        } catch (error) {

            /*
             * Real Query failure.
             *
             * This is NOT the same as a valid
             * server response with online=false.
             */
            await this.handleQueryFailure(
                server,
                error
            );

            return;
        }


        /*
         * Query succeeded.
         *
         * Reset the consecutive failure counter.
         */
        this.queryFailureCounts.delete(
            server.id
        );


        /*
         * Save current server status.
         */
        const updatedServer =
            await updateGameServerStatus(
                server.id,
                {
                    online:
                        serverData.online,

                    players:
                        serverData.players,

                    maxPlayers:
                        serverData.maxPlayers,

                    map:
                        serverData.map,

                    ping:
                        serverData.ping
                }
            );


        /*
         * Make sure the server still exists.
         */
        if (!updatedServer) {

            logger.warn(
                `[GameServer Monitor] Server #${server.id} disappeared from database.`
            );

            return;
        }


        /* =========================
           HISTORICAL STATISTICS
        ========================= */

        try {

            await recordGameServerHistory(
                server.id,
                {
                    online:
                        serverData.online,

                    players:
                        serverData.players,

                    maxPlayers:
                        serverData.maxPlayers,

                    bots:
                        serverData.botCount,

                    map:
                        serverData.map,

                    ping:
                        serverData.ping
                }
            );


            /*
             * Save player presence.
             */
            const playerDetails =
                Array.isArray(
                    serverData.playerDetails
                )
                    ? serverData.playerDetails

                    : (
                        Array.isArray(
                            serverData.playerList
                        )
                            ? serverData.playerList.map(
                                name => ({
                                    name,
                                    score: null
                                })
                            )

                            : []
                    );


            await recordGameServerPlayerPresence(
                server.id,
                playerDetails
            );


        } catch (error) {

            /*
             * Statistics must never stop
             * normal monitoring.
             */
            logger.error(
                `[GameServer Monitor] Failed to record historical statistics for #${server.id}:`,
                error
            );
        }


        /* =========================
           GEO LOCATION
        ========================= */

        let serverForEmbed =
            updatedServer;


        /*
         * Detect and cache server country
         * only once.
         */
        if (!updatedServer.country_code) {

            const location =
                await getIpLocation(
                    updatedServer.host
                );


            if (location) {

                const locationUpdated =
                    await updateGameServerLocation(
                        updatedServer.id,
                        location
                    );


                if (locationUpdated) {

                    serverForEmbed =
                        locationUpdated;
                }
            }
        }


        /* =========================
           BUILD EMBED
        ========================= */

        const embedResult =
            buildServerEmbed(
                serverForEmbed,
                serverData
            );


        const embeds =
            Array.isArray(
                embedResult
            )
                ? embedResult
                : [embedResult];


        /* =========================
           UPDATE DISCORD MESSAGE
        ========================= */

        await this.updateServerMessage(
            updatedServer,
            embeds
        );


        /* =========================
           STATUS ALERT
        ========================= */

        const isFirstCheck =
            !this.initializedServers.has(
                server.id
            );


        if (!isFirstCheck) {

            await this.handleStatusChange(
                updatedServer,
                previousOnline,
                serverData.online
            );
        }


        /*
         * Server initialized successfully.
         */
        this.initializedServers.add(
            server.id
        );


        logger.info(
            `[GameServer Monitor] #${server.id} ${server.name}: ` +
            `${serverData.online ? 'ONLINE' : 'OFFLINE'} | ` +
            `${serverData.players}/${serverData.maxPlayers} players | ` +
            `${serverData.map || 'N/A'}`
        );
    }


    /* =========================
       QUERY FAILURE
    ========================= */

    async handleQueryFailure(
        server,
        error
    ) {

        /*
         * Get previous failure count.
         */
        const previousFailures =
            this.queryFailureCounts.get(
                server.id
            ) || 0;


        /*
         * Increase failure count.
         */
        const currentFailures =
            previousFailures + 1;


        this.queryFailureCounts.set(
            server.id,
            currentFailures
        );


        const errorMessage =
            error?.message ||
            'Unknown Query error';


        /*
         * Log the current count.
         */
        logger.warn(
            `[GameServer Monitor] Query failed for ` +
            `#${server.id} ${server.name}: ` +
            `${currentFailures}/${MAX_QUERY_FAILURES} ` +
            `- ${errorMessage}`
        );


        /*
         * Keep the server while the threshold
         * has not yet been reached.
         */
        if (
            currentFailures <
            MAX_QUERY_FAILURES
        ) {

            return;
        }


        /*
         * Threshold reached.
         *
         * Remove the unreachable server.
         */
        await this.removeUnreachableServer(
            server
        );


        /*
         * Cleanup in-memory state.
         */
        this.queryFailureCounts.delete(
            server.id
        );

        this.initializedServers.delete(
            server.id
        );
    }


    /* =========================
       REMOVE UNREACHABLE SERVER
    ========================= */

    async removeUnreachableServer(
        server
    ) {

        logger.warn(
            `[GameServer Monitor] Removing unreachable ` +
            `Game Server #${server.id} ${server.name} ` +
            `after ${MAX_QUERY_FAILURES} consecutive Query failures.`
        );


        /* =========================
           DELETE DISCORD MESSAGE
        ========================= */

        if (
            server.channel_id &&
            server.message_id
        ) {

            try {

                const channel =
                    await this.client.channels.fetch(
                        server.channel_id
                    );


                if (
                    channel &&
                    channel.isTextBased()
                ) {

                    try {

                        await channel.messages.delete(
                            server.message_id
                        );


                        logger.info(
                            `[GameServer Monitor] Deleted Discord monitoring ` +
                            `message for removed server #${server.id}.`
                        );


                    } catch (error) {

                        /*
                         * Discord 10008 =
                         * Unknown Message.
                         *
                         * The message is already gone.
                         */
                        if (
                            error?.code === 10008
                        ) {

                            logger.debug(
                                `[GameServer Monitor] Discord message ` +
                                `${server.message_id} for server #${server.id} ` +
                                `was already deleted.`
                            );


                        } else {

                            logger.warn(
                                `[GameServer Monitor] Failed to delete Discord ` +
                                `message for server #${server.id}:`,
                                error
                            );
                        }
                    }
                }


            } catch (error) {

                /*
                 * Discord cleanup failure should
                 * not stop database deletion.
                 */
                logger.warn(
                    `[GameServer Monitor] Failed to fetch Discord channel ` +
                    `for server #${server.id}:`,
                    error
                );
            }
        }


        /* =========================
           DELETE DATABASE RECORD
        ========================= */

        try {

            const deleted =
                await deleteGameServer(
                    server.id
                );


            if (deleted) {

                logger.info(
                    `[GameServer Monitor] Game Server #${server.id} ` +
                    `${server.name} removed from the server list.`
                );


            } else {

                logger.warn(
                    `[GameServer Monitor] Game Server #${server.id} ` +
                    `was not deleted because no database record was found.`
                );
            }


        } catch (error) {

            logger.error(
                `[GameServer Monitor] Failed to remove ` +
                `unreachable Game Server #${server.id}:`,
                error
            );
        }
    }


    /* =========================
       UPDATE SERVER MESSAGE
    ========================= */

    async updateServerMessage(
        server,
        embeds
    ) {

        /*
         * A server needs a Discord channel
         * to update its monitoring message.
         */
        if (!server.channel_id) {

            logger.warn(
                `[GameServer Monitor] Server #${server.id} ` +
                `does not have a Discord channel configured.`
            );

            return;
        }


        try {

            const channel =
                await this.client.channels.fetch(
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
             * No message exists yet.
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

                const message =
                    await channel.messages.fetch(
                        server.message_id
                    );


                /* =========================
                   REFRESH BUTTON
                ========================= */

                const refreshButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `refresh_server:${server.id}`
                        )
                        .setLabel('Refresh')
                        .setEmoji('🔄')
                        .setStyle(
                            ButtonStyle.Secondary
                        );


                /* =========================
                   PLAYERS BUTTON
                ========================= */

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


                /* =========================
                   CLAIM BUTTON
                ========================= */

                const claimButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `claim_server:${server.id}`
                        )
                        .setLabel(
                            server.ownership_verified
                                ? 'Verified'
                                : 'Claim This Server'
                        )
                        .setEmoji(
                            server.ownership_verified
                                ? '✅'
                                : '🔐'
                        )
                        .setStyle(
                            ButtonStyle.Success
                        )
                        .setDisabled(
                            server.ownership_verified === true
                        );


                /* =========================
                   DELETE BUTTON
                ========================= */

                const deleteButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `delete_server:${server.id}`
                        )
                        .setLabel('Delete')
                        .setEmoji('🗑️')
                        .setStyle(
                            ButtonStyle.Danger
                        );


                /* =========================
                   BUTTON ROW
                ========================= */

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            refreshButton,
                            playersButton,
                            claimButton,
                            deleteButton
                        );


                /*
                 * Update the message.
                 */
                await message.edit({
                    content: null,
                    embeds,
                    components: [row]
                });


                return;


            } catch (error) {

                /*
                 * Discord 10008 =
                 * Unknown Message.
                 */
                if (
                    error?.code === 10008
                ) {

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


    /* =========================
       CREATE SERVER MESSAGE
    ========================= */

    async createServerMessage(
        server,
        channel,
        embeds
    ) {

        try {

            /* =========================
               REFRESH BUTTON
            ========================= */

            const refreshButton =
                new ButtonBuilder()
                    .setCustomId(
                        `refresh_server:${server.id}`
                    )
                    .setLabel('Refresh')
                    .setEmoji('🔄')
                    .setStyle(
                        ButtonStyle.Secondary
                    );


            /* =========================
               PLAYERS BUTTON
            ========================= */

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


            /* =========================
               CLAIM BUTTON
            ========================= */

            const claimButton =
                new ButtonBuilder()
                    .setCustomId(
                        `claim_server:${server.id}`
                    )
                    .setLabel(
                        server.ownership_verified
                            ? 'Verified'
                            : 'Claim This Server'
                    )
                    .setEmoji(
                        server.ownership_verified
                            ? '✅'
                            : '🔐'
                    )
                    .setStyle(
                        ButtonStyle.Success
                    )
                    .setDisabled(
                        server.ownership_verified === true
                    );


            /* =========================
               DELETE BUTTON
            ========================= */

            const deleteButton =
                new ButtonBuilder()
                    .setCustomId(
                        `delete_server:${server.id}`
                    )
                    .setLabel('Delete')
                    .setEmoji('🗑️')
                    .setStyle(
                        ButtonStyle.Danger
                    );


            /* =========================
               BUTTON ROW
            ========================= */

            const row =
                new ActionRowBuilder()
                    .addComponents(
                        refreshButton,
                        playersButton,
                        claimButton,
                        deleteButton
                    );


            /* =========================
               SEND DISCORD MESSAGE
            ========================= */

            const message =
                await channel.send({
                    embeds,
                    components: [row]
                });


            /*
             * Save channel_id and message_id.
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


    /* =========================
       STATUS CHANGE
    ========================= */

    async handleStatusChange(
        server,
        previousOnline,
        currentOnline
    ) {

        /*
         * No status change.
         */
        if (
            previousOnline ===
            currentOnline
        ) {

            return;
        }


        /*
         * Alerts disabled.
         */
        if (!server.alert_enabled) {

            logger.info(
                `[GameServer Monitor] Status changed for #${server.id}, ` +
                `but alerts are disabled.`
            );

            return;
        }


        /*
         * Offline -> Online.
         */
        if (
            previousOnline === false &&
            currentOnline === true
        ) {

            await this.sendStatusAlert(
                server,
                'online'
            );

            return;
        }


        /*
         * Online -> Offline.
         */
        if (
            previousOnline === true &&
            currentOnline === false
        ) {

            await this.sendStatusAlert(
                server,
                'offline'
            );
        }
    }


    /* =========================
       SEND STATUS ALERT
    ========================= */

    async sendStatusAlert(
        server,
        status
    ) {

        /*
         * No alert channel.
         */
        if (!server.alert_channel_id) {

            logger.warn(
                `[GameServer Monitor] Server #${server.id} ` +
                `does not have an alert channel configured.`
            );

            return;
        }


        try {

            const channel =
                await this.client.channels.fetch(
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


            /* =========================
               ONLINE ALERT
            ========================= */

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


            /* =========================
               OFFLINE ALERT
            ========================= */

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


    /* =========================
       STOP MONITORING
    ========================= */

    stopMonitoring() {

        if (!this.interval) {
            return;
        }


        clearInterval(
            this.interval
        );


        this.interval = null;


        logger.info(
            '[GameServer Monitor] Automatic monitoring stopped.'
        );
    }
}


export default ServerMonitorService;

