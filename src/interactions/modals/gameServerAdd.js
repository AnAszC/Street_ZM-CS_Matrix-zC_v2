import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

import {
    createGameServer,
    findGameServerByAddress,
    setGameServerMessage
} from '../../services/gameServers/gameServerDatabase.js';

import { fetchServerInfo } from '../../services/gameServers/gameQueryService.js';
import { buildServerEmbed } from '../../services/gameServers/serverEmbed.js';

export default {
    name: 'gameserver_add',

    async execute(interaction, client, args) {
        try {
            // يجب أن يكون الأمر داخل Discord Server
            if (!interaction.guildId) {
                await interaction.reply({
                    content: '❌ هذا الأمر لا يمكن استخدامه داخل الرسائل الخاصة.',
                    ephemeral: true
                });
                return;
            }

            // قراءة بيانات الـ Modal
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
                // Emoji اختياري
            }

            // =========================
            // Validation
            // =========================

            if (!name) {
                await interaction.reply({
                    content: '❌ يجب إدخال اسم السيرفر.',
                    ephemeral: true
                });
                return;
            }

            if (!host) {
                await interaction.reply({
                    content: '❌ يجب إدخال IP أو Host السيرفر.',
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
                        '❌ Port غير صالح.\n' +
                        'يجب أن يكون رقمًا بين `1` و `65535`.',
                    ephemeral: true
                });
                return;
            }

            if (!gameType) {
                await interaction.reply({
                    content: '❌ يجب إدخال نوع اللعبة.',
                    ephemeral: true
                });
                return;
            }

            // GameDig يدعم cs16 لـ Counter-Strike 1.6
            const supportedGameTypes = [
                'cs16'
            ];

            if (!supportedGameTypes.includes(gameType)) {
                await interaction.reply({
                    content:
                        '❌ نوع اللعبة غير مدعوم حاليًا.\n\n' +
                        'الأنواع المتاحة حاليًا:\n' +
                        '`cs16` — Counter-Strike 1.6',
                    ephemeral: true
                });
                return;
            }

            // =========================
            // منع السيرفر المكرر
            // =========================

            const existingServer = await findGameServerByAddress(
                interaction.guildId,
                host,
                port
            );

            if (existingServer) {
                await interaction.reply({
                    content:
                        '⚠️ هذا السيرفر موجود بالفعل في قاعدة البيانات.\n\n' +
                        `**Server:** ${existingServer.name}\n` +
                        `**Address:** \`${existingServer.host}:${existingServer.port}\`\n` +
                        `**ID:** \`${existingServer.id}\``,
                    ephemeral: true
                });
                return;
            }

            // =========================
            // إنشاء السيرفر في PostgreSQL
            // =========================

            const server = await createGameServer({
                guildId: interaction.guildId,
                name,
                host,
                port,
                gameType,
                emoji,
                monitorEnabled: true,
                alertEnabled: true
            });

            // =========================
            // فحص السيرفر مباشرة
            // =========================

            const serverData = await fetchServerInfo(server);

            // =========================
            // إنشاء Embed
            // =========================

            const embed = buildServerEmbed(
                server,
                serverData
            );

            // =========================
            // زر التحديث
            // =========================

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`refresh_server:${server.id}`)
                        .setLabel('🔄 تحديث')
                        .setStyle(ButtonStyle.Primary)
                );

            // =========================
            // إرسال الرسالة
            // =========================

            const message = await interaction.reply({
                content:
                    `✅ تم إضافة السيرفر **${server.name}** بنجاح.`,
                embeds: [embed],
                components: [row],
                fetchReply: true
            });

            // =========================
            // حفظ Channel ID + Message ID
            // =========================

            await setGameServerMessage(
                server.id,
                interaction.channelId,
                message.id
            );

            console.log(
                `[GameServer] Added server #${server.id} ` +
                `${server.host}:${server.port} ` +
                `to guild ${interaction.guildId}`
            );

        } catch (error) {
            console.error(
                '[GameServer Add] Error:',
                error
            );

            // في حالة حدوث خطأ قبل الرد
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content:
                        '❌ حدث خطأ أثناء إضافة Game Server.\n' +
                        'تحقق من بيانات السيرفر وحاول مرة أخرى.',
                    ephemeral: true
                });

                return;
            }

            // في حالة أن Interaction تم الرد عليه مسبقًا
            try {
                await interaction.followUp({
                    content:
                        '❌ حدث خطأ أثناء حفظ بيانات Game Server.',
                    ephemeral: true
                });
            } catch {
                // تجاهل خطأ الرد الإضافي
            }
        }
    }
};