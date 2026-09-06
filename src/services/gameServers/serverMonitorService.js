
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

        // منع تشغيل أكثر من دورة مراقبة في نفس الوقت
        this.isChecking = false;

        // معرف الـ interval
        this.interval = null;

        // يمنع إرسال إشعارات عند أول فحص
        this.initializedServers = new Set();

        /*
         * إذا كان Discord جاهزًا بالفعل نبدأ مباشرة.
         * وإذا لم يكن جاهزًا، ننتظر ready.
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
        // حماية من تشغيل الخدمة مرتين
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
         * فحص أولي مباشرة عند تشغيل البوت
         */
        this.runCheck();

        /*
         * الفحص الدوري
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
             * نفحص السيرفرات بالتتابع حتى لا نرسل
             * عددًا كبيرًا من الطلبات في نفس اللحظة.
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
         * نحتفظ بالحالة السابقة قبل تحديث PostgreSQL
         * حتى نستطيع اكتشاف:
         *
         * Online -> Offline
         * Offline -> Online
         */
        const previousOnline = server.last_online;

        /*
         * الاستعلام عن Game Server
         */
        const serverData = await fetchServerInfo(server);

        /*
         * حفظ الحالة الجديدة في PostgreSQL
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
         * إنشاء Embed الجديد
         */
        const embed = buildServerEmbed(
            updatedServer,
            serverData
        );

        /*
         * تحديث رسالة Discord
         *
         * إذا كانت الرسالة محذوفة، سيتم إنشاء رسالة
         * جديدة تلقائيًا وحفظ الـ message_id الجديد.
         */
        await this.updateServerMessage(
            updatedServer,
            embed
        );

        /*
         * لا نرسل Alert في أول فحص.
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

    async updateServerMessage(server, embed) {
        /*
         * السيرفر يحتاج إلى channel_id و message_id
         * حتى نستطيع تعديل الرسالة الموجودة.
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
             * إذا لم يكن هناك message_id أصلًا،
             * ننشئ رسالة جديدة.
             */
            if (!server.message_id) {
                await this.createServerMessage(
                    server,
                    channel,
                    embed
                );

                return;
            }

            try {
                const message = await channel.messages.fetch(
                    server.message_id
                );

                /*
                * إعادة بناء أزرار Game Server.
                *
                * هذا مهم للرسائل القديمة التي تم إنشاؤها
                * قبل إضافة زر Delete.
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
                * تحديث الـ Embed وإعادة إرسال الزرين.
                *
                * بهذه الطريقة:
                * - الرسائل القديمة تحصل على زر Delete.
                * - الرسائل الجديدة تبقى كما هي.
                * - زر Delete لن يختفي عند تحديث السيرفر.
                */
                await message.edit({
                    embeds: [embed],
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
                        embed
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

    async createServerMessage(server, channel, embed) {
        try {
            /*
             * زر Refresh
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
             * إرسال الرسالة الجديدة.
             */
            const message = await channel.send({
                embeds: [embed],
                components: [row]
            });

            /*
             * حفظ channel_id و message_id الجديدين
             * في PostgreSQL.
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
         * لا يوجد تغيير
         */
        if (previousOnline === currentOnline) {
            return;
        }

        /*
         * التنبيهات معطلة لهذا السيرفر
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
        if (!server.channel_id) {
            return;
        }

        try {
            const channel = await this.client.channels.fetch(
                server.channel_id
            );

            if (!channel) {
                return;
            }

            if (status === 'online') {
                await channel.send({
                    content:
                        `🟢 **${server.name}** عاد للعمل!\n` +
                        `\`${server.host}:${server.port}\``
                });

                logger.info(
                    `[GameServer Monitor] ONLINE alert sent for #${server.id}.`
                );

                return;
            }

            if (status === 'offline') {
                await channel.send({
                    content:
                        `🔴 **${server.name}** أصبح Offline!\n` +
                        `\`${server.host}:${server.port}\``
                });

                logger.info(
                    `[GameServer Monitor] OFFLINE alert sent for #${server.id}.`
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

