import { fetchServerInfo } from '../../services/gameServers/gameQueryService.js';
import { buildServerEmbed } from '../../services/gameServers/serverEmbed.js';
import { getGameServerById } from '../../services/gameServers/gameServerDatabase.js';

export default {
    name: 'refresh_server',

    async execute(interaction, client, args) {
        const [serverId] = args;

        if (!serverId) {
            await interaction.reply({
                content: '❌ معرف السيرفر غير موجود.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        try {
            const server = await getGameServerById(serverId);

            if (!server) {
                await interaction.editReply({
                    content: '❌ لم يتم العثور على السيرفر في قاعدة البيانات.',
                    embeds: [],
                    components: []
                });
                return;
            }

            const serverData = await fetchServerInfo(server);

            const embed = buildServerEmbed(
                server,
                serverData
            );

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {
            console.error(
                `[GameServer Refresh] Failed for ${serverId}:`,
                error
            );

            await interaction.editReply({
                content: '❌ حدث خطأ أثناء تحديث معلومات السيرفر.',
                embeds: [],
                components: []
            });
        }
    }
};