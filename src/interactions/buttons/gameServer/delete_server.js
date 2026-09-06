
import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    PermissionFlagsBits
} from 'discord.js';

import {
    getGameServerById
} from '../../../services/gameServers/gameServerDatabase.js';

export default {
    name: 'delete_server',

    async execute(interaction, client, args) {
        const [serverId] = args;

        if (!serverId) {
            await interaction.reply({
                content: '❌ معرف السيرفر غير موجود.',
                ephemeral: true
            });
            return;
        }

        if (!interaction.guildId) {
            await interaction.reply({
                content: '❌ هذا الزر يمكن استخدامه داخل السيرفر فقط.',
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
                content: '❌ ليس لديك صلاحية حذف Game Servers.',
                ephemeral: true
            });
            return;
        }

        try {
            const server = await getGameServerById(serverId);

            if (!server) {
                await interaction.reply({
                    content:
                        '❌ لم يتم العثور على Game Server في قاعدة البيانات.',
                    ephemeral: true
                });
                return;
            }

            if (server.guild_id !== interaction.guildId) {
                await interaction.reply({
                    content:
                        '❌ لا يمكنك حذف Game Server تابع لسيرفر Discord آخر.',
                    ephemeral: true
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`delete_server_confirm:${server.id}`)
                .setTitle('تأكيد حذف Game Server');

            const confirmationInput = new TextInputBuilder()
                .setCustomId('server_id')
                .setLabel(`اكتب Server ID (${server.id}) للتأكيد`)
                .setPlaceholder(String(server.id))
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(20);

            const row = new ActionRowBuilder().addComponents(
                confirmationInput
            );

            modal.addComponents(row);

            /*
             * عرض الـ Modal فقط.
             *
             * لا نستخدم awaitModalSubmit() هنا.
             * Discord سيرسل Modal Submit كـ Interaction مستقل،
             * وسيتم التعامل معه بواسطة:
             *
             * modals/gameServer/delete_server_confirm.js
             */
            await interaction.showModal(modal);

            return;

        } catch (error) {
            console.error(
                `[GameServer Delete] Failed for ${serverId}:`,
                error
            );

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: '❌ حدث خطأ أثناء فتح نافذة حذف Game Server.',
                    ephemeral: true
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content: '❌ حدث خطأ أثناء فتح نافذة حذف Game Server.',
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
};

