# CSMatrix-zC - FuZZy ComManDer

**CSMatrix-zC - FuZZy ComManDer (AnAs.zC)** is a feature-rich Discord bot project derived from [TitanBot](https://github.com/codebymitch/TitanBot) and customized for the CSMatrix-zC ecosystem.

The project provides moderation, community, utility, economy, ticketing, leveling, music, server statistics, game server monitoring, ownership verification, GeoIP country detection, and other tools for Discord communities.

Built with modern **Discord.js v14**, **Node.js 20+**, **PostgreSQL**, and Docker-based development.

[![Discord.js](https://img.shields.io/npm/v/discord.js?style=flat-square\&label=Discord.js\&logo=discord)](https://www.npmjs.com/package/discord.js)

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-brightgreen?style=flat-square\&logo=node.js)](https://nodejs.org/)

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-336791?style=flat-square\&logo=postgresql)](https://www.postgresql.org/)

[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

## Table of Contents

* [Features Overview](#features-overview)
* [Game Server Monitor](#game-server-monitor)
* [Quick Setup](#quick-setup)
* [Manual Installation](#manual-installation)
* [Required Bot Intents](#required-bot-intents)
* [Project Structure](#project-structure)
* [Security](#security)
* [License](#license)
* [Credits](#credits)

## Features Overview

CSMatrix-zC includes a broad set of Discord server management and community features.

### Moderation & Administration

* Mass ban and kick actions
* User notes and moderation records
* Case management
* Member moderation tools
* Permission-based administration

### Community

* Community management tools
* Application systems
* Dashboards and configuration panels
* Server utilities

### Economy

* Shop and inventory
* Currency and transfers
* Economy configuration
* Economy-related activities

### Tickets

* Ticket creation and management
* Claim and priority systems
* Ticket limits
* Transcript support
* Staff workflows

### Server Statistics

* Member counters
* Voice statistics
* Dynamic channel updates
* Server activity information

### Verification

* Member verification flows
* Verification panels
* Permission-aware verification handling

### Reaction Roles

* Self-assignable roles
* Reaction-based role selection
* Multi-role support

### Leveling

* XP tracking
* Level roles
* Automatic role synchronization
* Configurable leveling behavior

### Giveaways

* Multiple winners
* Automatic winner selection
* Rerolls
* Event management

### Birthday System

* Birthday tracking
* Automatic birthday announcements
* Timezone-aware scheduling

### Utility

* Reports
* Todo tools
* First-message navigation
* General server utilities

### Welcome

* Welcome messages
* Automatic roles
* Custom welcome embeds

### Music

* Lavalink v4 support
* Queue and playback controls
* Interactive music buttons
* Multiple source/platform support
* 24/7 playback mode

## Game Server Monitor

The **Game Server Monitor** is a custom CSMatrix-zC feature for monitoring and displaying live game server information in Discord.

### Current Commands

```text
/gameserver add
/gameserver edit
```

### Supported Game Server Features

* Add game servers through a Discord modal
* Store server configuration in PostgreSQL
* Query live server information with Gamedig
* Display Online / Offline status
* Display current map
* Display player count
* Display bot count
* Display player names
* Display bot names
* Display live server hostname
* Generate a Discord invite for the configured server channel
* Automatically update the monitor message
* Online / Offline alert channel support
* Automatic periodic monitoring
* Move a Game Server monitor to another Discord channel
* Delete the old monitor message when moving a server

### Ownership Verification

CSMatrix-zC includes a built-in Game Server ownership verification system.

The verification flow works by generating a unique verification code for each Game Server:

```text
CS16 | GSM-2FDCRN
```

The server owner adds this verification text to the live game server hostname.

The bot then:

1. Checks the Discord user's permission.
2. Checks the submitted verification text.
3. Queries the live Game Server.
4. Confirms that the server is online.
5. Checks that the verification text exists in the live hostname.
6. Stores the verified Discord user in PostgreSQL.
7. Updates the public Game Server monitor.
8. Changes the Claim button to:

```text
✅ Verified
```

The verification system also includes protection against abuse:

* Unique verification code per Game Server
* Claim request cooldown
* Failed verification cooldown
* Maximum of 5 failed attempts
* Temporary lock after reaching the failure limit
* Persistent protection state in PostgreSQL
* Discord `Manage Server` permission requirement
* Online server requirement during hostname verification

### Server Manager

After successful ownership verification, the public Game Server monitor displays the verified Discord owner using a Discord mention.

Example:

```text
Server Manager: @anas.zc
```

The mention is based on the stored Discord user ID.

### GeoIP Country Detection

Game Server Monitor supports automatic country detection using **IPinfo Lite**.

The system sends the Game Server IP to IPinfo Lite and receives country-level information such as:

* Country code
* Country name

The country flag is generated locally from the ISO country code.

The Discord monitor displays only:

```text
🇲🇦 MA
```

The detected country is stored in PostgreSQL so the bot does not need to perform a GeoIP request during every monitoring cycle.

### Game Server Message

The monitor uses a multi-embed layout.

### Embed 1

* Live Server Hostname
* Server Manager
* Connect address
* Status
* Ownership
* Address
* Country
* Game
* Current Map
* Players
* Bots
* Discord invite
* Game Server Monitor version
* Server ID

### Embed 2

* Player List
* Visual separator
* Bot List

Player and bot names are displayed as normal lists rather than a table.

### Game Server Buttons

Each Game Server monitor can include:

* **Refresh** — refresh live server information
* **Show Players / Hide Players** — toggle both Player List and Bot List
* **Claim This Server** — start the ownership verification process
* **Verified** — displayed and disabled after successful ownership verification
* **Delete** — open the Game Server deletion confirmation flow

### Game Server Monitor Version

```text
3.2.4
```

The Game Server Monitor version is maintained independently from the main bot package version.

## Quick Setup

### Prerequisites

* Node.js 20.10.0 or higher
* Docker and Docker Compose for local development
* Discord Bot Application
* PostgreSQL
* A Discord application with the required intents and permissions
* IPinfo account and API Token when GeoIP is enabled

### Environment Configuration

Create your local environment file from `.env.example`:

```bash
cp .env.example .env
```

Configure the required values in `.env`.

At minimum:

```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
GUILD_ID=your_discord_guild_id
```

For Game Server Monitor GeoIP:

```env
IPINFO_TOKEN=your_ipinfo_token_here
```

The value shown in `.env.example` is only a placeholder.

Do not commit the real `.env` file or your real IPinfo token to GitHub.

### Docker Development

Docker is used for local development and testing.

Build the bot:

```bash
docker compose build bot
```

Start the bot:

```bash
docker compose up -d bot
```

View the bot logs:

```bash
docker compose logs -f bot
```

Check container status:

```bash
docker compose ps
```

Check the web health endpoint:

```bash
curl http://localhost:3000/health
```

### Production Deployment

The project source code is maintained in GitHub and can be connected to a supported production hosting platform such as Railway.

Production secrets should be configured using the hosting platform's environment-variable system rather than committed to Git.

## PostgreSQL

PostgreSQL is the primary persistent database.

The project supports persistent storage for features such as:

* Game Servers
* Ownership verification
* Game Server GeoIP information
* Tickets
* Economy
* Leveling
* Server configuration
* Other guild-scoped data

Do not expose PostgreSQL directly to the public Internet.

Use strong credentials and restrict database network access to trusted systems.

## Slash Commands

Slash commands are registered globally through the Discord API.

The project currently uses a command loader that:

* Discovers command files under `src/commands`
* Loads unique primary command names
* Supports nested subcommands
* Validates command definitions
* Registers commands globally
* Can clear previously registered global commands before registration when configured

### Command Limit

Discord has a limit of **100 global top-level application commands**.

Subcommands are contained within their parent command and do not consume additional top-level command slots in the same way.

## Required Bot Intents

The bot may require the following intents depending on the enabled features:

* Guilds
* Guild Messages
* Message Content
* Guild Members
* Guild Message Reactions
* Guild Voice States
* Direct Messages

The exact requirements may vary depending on the features enabled in your deployment.

## Required Permissions

Recommended permissions include only those required by the enabled features:

* View Channels
* Send Messages
* Embed Links
* Attach Files
* Read Message History
* Manage Messages
* Manage Channels
* Manage Roles
* Kick Members
* Ban Members
* Moderate Members
* Connect

The Game Server ownership verification feature requires:

```text
Manage Server
```

Do not grant permissions that your deployment does not require.

## Project Structure

```text
src/
├── commands/
│   ├── Core/
│   ├── Community/
│   ├── Economy/
│   ├── GameServers/
│   │   └── gameservers.js
│   ├── Giveaway/
│   ├── Leveling/
│   ├── Logging/
│   ├── Moderation/
│   ├── Music/
│   ├── Reaction_roles/
│   ├── ServerStats/
│   ├── Ticket/
│   ├── Utility/
│   ├── Verification/
│   ├── Welcome/
│   └── ...

├── config/
├── events/
├── handlers/

├── interactions/
│   ├── buttons/
│   │   └── gameServer/
│   │       ├── claim_server.js
│   │       ├── delete_server.js
│   │       ├── refresh_server.js
│   │       ├── toggle_players.js
│   │       └── verify_ownership.js
│   │
│   └── modals/
│       └── gameServer/
│           ├── claim_server_verify.js
│           ├── delete_server_confirm.js
│           └── gameServerAdd.js

├── services/
│   ├── discord/
│   │   └── discordInviteService.js
│   │
│   └── gameServers/
│       ├── gameServerDatabase.js
│       ├── gameQueryService.js
│       ├── geoIpService.js
│       ├── serverConfig.js
│       ├── serverEmbed.js
│       └── serverMonitorService.js

└── utils/
    └── database/
        └── schema.js
```

## Security

Security information and vulnerability reporting instructions are available in:

```text
SECURITY.md
```

Never commit:

* Discord bot tokens
* Database passwords
* API keys
* IPinfo API tokens
* Webhook secrets
* Private credentials
* Production `.env` files

For local development:

```text
.env
```

must remain private.

The repository should contain only:

```text
.env.example
```

with placeholder values.

Never replace placeholder values in `.env.example` with real production secrets.

## License

CSMatrix-zC is distributed under the **MIT License**.

See [LICENSE](LICENSE) for the complete license text and attribution information.

## Credits

CSMatrix-zC is derived from the **TitanBot** project.

Original project:

https://github.com/codebymitch/TitanBot

CSMatrix-zC project:

https://github.com/AnAszC/Street_ZM-CS_Matrix-zC_v2

Original and project-specific copyright and licensing information is maintained in `LICENSE`.

## Thank You

Thank you for using and contributing to **CSMatrix-zC - FuZZy ComManDer**.

The project is continuously evolving with new features, improvements, and integrations for the CSMatrix-zC ecosystem.

*Last updated: September 2026*
