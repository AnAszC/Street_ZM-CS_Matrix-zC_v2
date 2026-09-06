
import {
    PermissionFlagsBits
} from 'discord.js';

import {
    getGameServerById,
    deleteGameServer
} from '../../../services/gameServers/gameServerDatabase.js';

export default {
    name: 'delete_server_confirm',

    async execute(interaction) {
        const [, serverId] = interaction.customId.split(':');

        try {
            await interaction.deferReply({
                ephemeral: true
            });

            if (!interaction.guildId) {
                await interaction.editReply({
                    content: '❌ هذا الإجراء يمكن استخدامه داخل السيرفر فقط.'
                });
                return;
            }

            if (
                !interaction.member?.permissions?.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {
                await interaction.editReply({
                    content: '❌ ليس لديك صلاحية حذف Game Servers.'
                });
                return;
            }

            if (!serverId) {
                await interaction.editReply({
                    content: '❌ معرف السيرفر غير موجود.'
                });
                return;
            }

            const server = await getGameServerById(serverId);

            if (!server) {
                await interaction.editReply({
                    content: '❌ لم يتم العثور على Game Server في قاعدة البيانات.'
                });
                return;
            }

            if (server.guild_id !== interaction.guildId) {
                await interaction.editReply({
                    content: '❌ لا يمكنك حذف Game Server تابع لسيرفر Discord آخر.'
                });
                return;
            }

            const enteredId =
                interaction.fields
                    .getTextInputValue('server_id')
                    .trim();

            if (enteredId !== String(server.id)) {
                await interaction.editReply({
                    content:
                        `❌ معرف السيرفر غير صحيح.\n` +
                        `يجب كتابة \`${server.id}\` بالضبط.`
                });
                return;
            }

            const deletedServer = await deleteGameServer(
                server.id,
                interaction.guildId
            );

            if (!deletedServer) {
                await interaction.editReply({
                    content:
                        '❌ فشل حذف Game Server من قاعدة البيانات.'
                });
                return;
            }

            /*
             * حذف رسالة Game Server المرتبطة بالسيرفر.
             * لا نعتمد على interaction.message لأن Modal Submit
             * هو Interaction مستقل عن زر الحذف.
             */
            if (server.channel_id && server.message_id) {
                try {
                    const channel =
                        await interaction.client.channels.fetch(
                            server.channel_id
                        );

                    if (channel?.isTextBased()) {
                        const message =
                            await channel.messages.fetch(
                                server.message_id
                            );

                        await message.delete();
                    }
                } catch (deleteMessageError) {
                    if (deleteMessageError?.code === 10008) {
                        console.log(
                            `[GameServer Delete] Message ${server.message_id} was already deleted.`
                        );
                    } else {
                        console.warn(
                            `[GameServer Delete] Failed to delete message ${server.message_id}:`,
                            deleteMessageError.message
                        );
                    }
                }
            }

            await interaction.editReply({
                content:
                    `✅ تم حذف Game Server **#${server.id}** بنجاح.\n` +
                    `🎮 **السيرفر:** ${server.name}`
            });

            console.log(
                `[GameServer Delete] Server #${server.id} deleted by ${interaction.user.tag}`
            );

        } catch (error) {
            console.error(
                `[GameServer Delete] Failed for ${serverId}:`,
                error
            );

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content:
                        '❌ حدث خطأ أثناء حذف Game Server.'
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content:
                        '❌ حدث خطأ أثناء حذف Game Server.',
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
};

