/**
 * Create a permanent Discord invite for a channel.
 *
 * The bot must have the "Create Instant Invite" permission
 * in the target channel.
 */
export async function createDiscordChannelInvite(channel) {
    try {
        if (!channel) {
            return null;
        }

        if (!channel.isTextBased()) {
            console.warn(
                '[Discord Invite] Target channel is not text-based.'
            );
            return null;
        }

        if (!channel.guild) {
            console.warn(
                '[Discord Invite] Target channel is not inside a guild.'
            );
            return null;
        }

        const invite = await channel.createInvite({
            maxAge: 0,
            maxUses: 0,
            unique: false,
            reason: 'Game Server Discord invite'
        });

        return invite?.url || null;
    } catch (error) {
        console.error(
            `[Discord Invite] Failed to create invite for channel ${channel?.id || 'unknown'}:`,
            error.message
        );

        return null;
    }
}