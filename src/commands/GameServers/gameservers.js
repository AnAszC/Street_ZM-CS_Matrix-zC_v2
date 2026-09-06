
import {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ChannelType,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

import {
    getGameServerById,
    setGameServerMessage
} from '../../services/gameServers/gameServerDatabase.js';

import { fetchServerInfo } from '../../services/gameServers/gameQueryService.js';
import { buildServerEmbed } from '../../services/gameServers/serverEmbed.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gameserver')
        .setDescription('إدارة خوادم الألعاب')

        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('إضافة خادم ألعاب جديد')
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('عرض خوادم الألعاب')
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('عرض حالة خادم')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('معرف الخادم')
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('حذف خادم ألعاب')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('معرف الخادم')
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('تعديل خادم ألعاب')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('معرف الخادم')
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('القناة التي ستظهر فيها رسالة السيرفر')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            const modal = new ModalBuilder()
                .setCustomId('gameserver_add')
                .setTitle('🎮 إضافة Game Server');

            const nameInput = new TextInputBuilder()
                .setCustomId('server_name')
                .setLabel('اسم السيرفر')
                .setPlaceholder('مثال: CSMatrix-zC Zombie Server')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100);

            const hostInput = new TextInputBuilder()
                .setCustomId('server_host')
                .setLabel('IP / Host')
                .setPlaceholder('مثال: 51.38.123.45')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(255);

            const portInput = new TextInputBuilder()
                .setCustomId('server_port')
                .setLabel('Port')
                .setPlaceholder('مثال: 27015')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(5);

            const gameTypeInput = new TextInputBuilder()
                .setCustomId('game_type')
                .setLabel('Game Type')
                .setPlaceholder('cs16')
                .setValue('cs16')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(50);

            const emojiInput = new TextInputBuilder()
                .setCustomId('server_emoji')
                .setLabel('Emoji')
                .setPlaceholder('🎮')
                .setValue('🎮')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(16);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(hostInput),
                new ActionRowBuilder().addComponents(portInput),
                new ActionRowBuilder().addComponents(gameTypeInput),
                new ActionRowBuilder().addComponents(emojiInput)
            );

            await interaction.showModal(modal);
            return;
        }

        if (subcommand === 'edit') {
            await interaction.deferReply({ ephemeral: true });

            const serverId = interaction.options.getInteger('id');
            const targetChannel = interaction.options.getChannel('channel');

            try {
                const server = await getGameServerById(serverId);

                if (!server) {
                    await interaction.editReply({
                        content: `❌ لم يتم العثور على Game Server بالمعرف \`#${serverId}\`.`
                    });
                    return;
                }

                if (server.guild_id !== interaction.guildId) {
                    await interaction.editReply({
                        content: '❌ لا يمكنك تعديل Game Server تابع لسيرفر Discord آخر.'
                    });
                    return;
                }

                if (
                    !targetChannel ||
                    targetChannel.type !== ChannelType.GuildText
                ) {
                    await interaction.editReply({
                        content: '❌ يجب اختيار قناة نصية.'
                    });
                    return;
                }

                if (!targetChannel.isTextBased()) {
                    await interaction.editReply({
                        content: '❌ القناة المختارة لا يمكن إرسال الرسائل إليها.'
                    });
                    return;
                }

                const serverData = await fetchServerInfo(server);
                const embed = buildServerEmbed(server, serverData);

                const refreshButton = new ButtonBuilder()
                    .setCustomId(`refresh_server:${server.id}`)
                    .setLabel('Refresh')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Secondary);

                const deleteButton = new ButtonBuilder()
                    .setCustomId(`delete_server:${server.id}`)
                    .setLabel('Delete')
                    .setEmoji('🗑️')
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder()
                    .addComponents(
                        refreshButton,
                        deleteButton
                    );

                const newMessage = await targetChannel.send({
                    embeds: [embed],
                    components: [row]
                });

                const oldChannelId = server.channel_id;
                const oldMessageId = server.message_id;

                await setGameServerMessage(
                    server.id,
                    targetChannel.id,
                    newMessage.id
                );

                if (oldChannelId && oldMessageId) {
                    try {
                        const oldChannel = await interaction.client.channels.fetch(
                            oldChannelId
                        );

                        if (oldChannel && oldChannel.isTextBased()) {
                            const oldMessage = await oldChannel.messages.fetch(
                                oldMessageId
                            );

                            await oldMessage.delete();
                        }
                    } catch (deleteError) {
                        if (deleteError?.code === 10008) {
                            console.log(
                                `[GameServer Edit] Old message ${oldMessageId} was already deleted.`
                            );
                        } else {
                            console.error(
                                `[GameServer Edit] Failed to delete old message ${oldMessageId}:`,
                                deleteError
                            );
                        }
                    }
                }

                console.log(
                    `[GameServer Edit] Server #${server.id} moved from channel ${oldChannelId || 'none'} to ${targetChannel.id}. New message ID: ${newMessage.id}`
                );

                await interaction.editReply({
                    content:
                        `✅ تم تعديل Game Server **#${server.id}** بنجاح.\n\n` +
                        `🎮 **السيرفر:** ${server.name}\n` +
                        `📢 **القناة الجديدة:** ${targetChannel}\n` +
                        `🆔 **Server ID:** \`${server.id}\``
                });

                return;
            } catch (error) {
                console.error(
                    `[GameServer Edit] Failed to edit server #${serverId}:`,
                    error
                );

                await interaction.editReply({
                    content:
                        '❌ حدث خطأ أثناء تعديل Game Server.\n' +
                        'تأكد أن البوت يملك صلاحية **View Channel** و **Send Messages** في القناة الجديدة.'
                });

                return;
            }
        }

        /*
         * سيتم تنفيذ list / status / remove
         * في الخطوات التالية.
         */

        await interaction.reply({
            content: `⚙️ الأمر \`/gameserver ${subcommand}\` سيتم تفعيله قريبًا.`,
            ephemeral: true
        });
    }
};

