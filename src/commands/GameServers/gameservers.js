import {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} from 'discord.js';

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

        /*
         * سيتم تنفيذ list / status / edit / remove
         * في الخطوات التالية.
         */

        await interaction.reply({
            content: `⚙️ الأمر \`/gameserver ${subcommand}\` سيتم تفعيله قريبًا.`,
            ephemeral: true
        });
    }
};