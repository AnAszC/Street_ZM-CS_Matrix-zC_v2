import { fetchServerInfo } from '../../../services/gameServers/gameQueryService.js';
import { buildServerEmbed } from '../../../services/gameServers/serverEmbed.js';
import { getGameServerById } from '../../../services/gameServers/gameServerDatabase.js';

export default {
    name: 'refresh_server',

    async execute(interaction, client, args) {
        const [serverId] = args;

        if (!serverId) {
            await interaction.reply({
                content: '❌ Server ID is missing.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferUpdate();

        try {
            const server = await getGameServerById(serverId);

            if (!server) {
                await interaction.editReply({
                    content: '❌ Server was not found in the database.',
                    embeds: [],
                    components: []
                });
                return;
            }

            const serverData = await fetchServerInfo(server);

            /*
             * buildServerEmbed returns an array:
             *
             * [Main Embed]
             * or
             * [Main Embed, Lists Embed]
             */
            const embedResult = buildServerEmbed(
                server,
                serverData
            );

            const embeds = Array.isArray(embedResult)
                ? embedResult
                : [embedResult];

            /*
             * Update the existing message.
             * Keep the current buttons unchanged.
             */
            await interaction.editReply({
                content: null,
                embeds
            });;

        } catch (error) {
            console.error(
                `[GameServer Refresh] Failed for ${serverId}:`,
                error
            );

            await interaction.editReply({
                content: '❌ An error occurred while updating the server information.',
                embeds: [],
                components: []
            });
        }
    }
};