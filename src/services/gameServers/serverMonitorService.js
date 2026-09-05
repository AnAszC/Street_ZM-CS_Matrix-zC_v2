import {
    getMonitoredGameServers,
    updateGameServerStatus
} from './gameServerDatabase.js';

import { fetchServerInfo } from './gameQueryService.js';
import { buildServerEmbed } from './serverEmbed.js';
import { gameServerConfig } from './serverConfig.js';

import { pgDb } from '../../utils/postgresDatabase.js';
import { logger } from '../../utils/logger.js';

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
         */
        await this.updateServerMessage(
            updatedServer,
            embed
        );

        /*
         * لا نرسل Alert في أول فحص.
         *
         * مثلًا:
         * last_online = null
         * current = true
         *
         * هذا ليس "Offline -> Online"،
         * لأننا لا نعرف الحالة السابقة.
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
        if (!server.channel_id || !server.message_id) {
            logger.warn(
                `[GameServer Monitor] Server #${server.id} ` +
                `does not have a Discord message configured.`
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

            const message = await channel.messages.fetch(
                server.message_id
            );

            if (!message) {
                logger.warn(
                    `[GameServer Monitor] Message ${server.message_id} ` +
                    `not found for server #${server.id}.`
                );

                return;
            }

            /*
             * نعدل الـ Embed فقط.
             *
             * مهم:
             * لا نرسل components هنا، لذلك زر 🔄 تحديث
             * الموجود في الرسالة سيبقى موجودًا.
             */
            await message.edit({
                embeds: [embed]
            });

        } catch (error) {
            /*
             * Discord قد يرجع:
             *
             * Unknown Channel
             * Unknown Message
             * Missing Access
             *
             * لذلك لا نوقف الـ Monitor بالكامل بسبب
             * رسالة سيرفر واحدة.
             */

            logger.error(
                `[GameServer Monitor] Failed to update Discord message ` +
                `for server #${server.id}:`,
                error
            );
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