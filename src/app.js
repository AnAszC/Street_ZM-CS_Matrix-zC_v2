import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import {
  Client,
  Collection,
  GatewayIntentBits
} from 'discord.js';

import { REST } from '@discordjs/rest';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getGuildConfig } from './services/config/guildConfig.js';

import {
  getServerCounters,
  saveServerCounters,
  updateCounter
} from './services/serverstatsService.js';

import {
  logger,
  startupLog,
  shutdownLog
} from './utils/logger.js';

import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';

import {
  loadCommands,
  registerCommands as registerSlashCommands
} from './handlers/loaders/commandLoader.js';

import {
  runSafeTask,
  handleTaskError,
  ErrorCodes
} from './utils/errorHandler.js';

import { initializeMusic } from './services/music/riffySetup.js';
import { shutdownMusic } from './services/music/playerHandler.js';

import {
  EXPECTED_SCHEMA_VERSION,
  EXPECTED_SCHEMA_LABEL
} from './config/database/schemaVersion.js';

import ServerMonitorService from './services/gameServers/serverMonitorService.js';
import {
  registerDashboardRoutes
} from './dashboard/dashboardServer.js';


class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildBans
      ]
    });

    this.config = config;

    this.commands = new Collection();
    this.events = new Collection();
    this.buttons = new Collection();
    this.selectMenus = new Collection();
    this.modals = new Collection();
    this.cooldowns = new Collection();

    this.db = null;

    this.rest =
      new REST({
        version: '10'
      }).setToken(
        config.bot.token
      );

    this.serverMonitor = null;
  }


  async start() {
    try {
      startupLog(
        'Starting TitanBot...'
      );

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            1000
          )
      );

      startupLog(
        'Initializing database...'
      );

      const dbInstance =
        await initializeDatabase();

      this.db =
        dbInstance.db;

      const dbStatus =
        this.db.getStatus();

      if (dbStatus.isDegraded) {
        logger.warn('');

        logger.warn(
          '╔═══════════════════════════════════════════════════════╗'
        );

        logger.warn(
          '║ ⚠️  DATABASE RUNNING IN DEGRADED MODE                 ║'
        );

        logger.warn(
          '║                                                       ║'
        );

        logger.warn(
          '║ Connection: In-Memory Storage (PostgreSQL unavailable)║'
        );

        logger.warn(
          '║ Data Persistence: DISABLED - data lost on restart    ║'
        );

        logger.warn(
          '║ Action Required: Fix PostgreSQL and restart bot      ║'
        );

        logger.warn(
          '╚═══════════════════════════════════════════════════════╝'
        );

        logger.warn('');

      } else {
        startupLog(
          `✅ Database Status: ${dbStatus.connectionType} (fully operational)`
        );
      }

      startupLog(
        'Starting web server...'
      );

      this.startWebServer();

      startupLog(
        'Loading commands...'
      );

      await loadCommands(
        this
      );

      startupLog(
        `Commands loaded: ${this.commands.size}`
      );

      startupLog(
        'Loading handlers...'
      );

      await this.loadHandlers();

      startupLog(
        'Handlers loaded'
      );

      initializeMusic(
        this
      );

      startupLog(
        'Logging into Discord...'
      );

      await this.login(
        this.config.bot.token
      );

      startupLog(
        'Discord login successful'
      );


      this.once(
        'ready',
        () => {
          try {
            logger.info(
              '[GameServer Monitor] Starting automatic game server monitoring...'
            );

            if (!this.serverMonitor) {
              this.serverMonitor =
                new ServerMonitorService(
                  this
                );
            }

            logger.info(
              '[GameServer Monitor] Automatic game server monitoring started successfully.'
            );

          } catch (error) {
            logger.error(
              '[GameServer Monitor] Failed to start automatic monitoring:',
              error
            );
          }
        }
      );


      startupLog(
        'Registering slash commands globally...'
      );

      await this.registerCommands();

      startupLog(
        'Slash commands registration complete'
      );


      const databaseMode =
        dbStatus.isDegraded
          ? 'Optional in-memory mode (data resets after restart)'
          : 'Connected (persistent data enabled)';

      const handlerSummary =
        `${this.buttons.size} buttons, ${this.selectMenus.size} menus, ${this.modals.size} modals`;

      startupLog(
        `ONLINE ✅ | ${this.commands.size} commands loaded | ${handlerSummary} | Database: ${databaseMode}`
      );

      this.setupCronJobs();

    } catch (error) {
      logger.error(
        'Failed to start bot:',
        error
      );

      process.exit(
        1
      );
    }
  }


  startWebServer() {
    const app =
      express();


    /*
     * Trust the reverse proxy layer so Express can
     * resolve the original visitor IP correctly.
     */
    app.set(
      'trust proxy',
      true
    );


    const configuredPort =
      Number(
        this.config.api?.port ||
        process.env.PORT ||
        3000
      );


    const maxPortRetryAttempts =
      Number(
        process.env.PORT_RETRY_ATTEMPTS ||
        5
      );


    const host =
      process.env.WEB_HOST ||
      '0.0.0.0';


    const corsOrigin =
      this.config.api?.cors?.origin ||
      '*';


    /* ========================================
       Express / CORS
    ======================================== */

    app.use(
      (
        req,
        res,
        next
      ) => {
        const allowedOrigins =
          Array.isArray(
            corsOrigin
          )
            ? corsOrigin
            : [corsOrigin];


        const origin =
          req.headers.origin;


        if (
          allowedOrigins.includes('*') ||
          allowedOrigins.includes(origin)
        ) {
          res.header(
            'Access-Control-Allow-Origin',
            origin || '*'
          );
        }


        res.header(
          'Access-Control-Allow-Methods',
          'GET, POST, OPTIONS'
        );


        res.header(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization'
        );


        if (
          req.method ===
          'OPTIONS'
        ) {
          return res.sendStatus(
            200
          );
        }


        next();
      }
    );


    /* ========================================
       Generic API Rate Limiter
    ======================================== */

    const requestCounts =
      new Map();


    const windowMs =
      this.config.api?.rateLimit?.windowMs ||
      60000;


    const maxRequests =
      this.config.api?.rateLimit?.max ||
      100;


    function normalizeClientIp(value) {
      let ip =
        String(
          value || ''
        ).trim();


      if (!ip) {
        return 'unknown';
      }


      /*
       * Normalize IPv4-mapped IPv6 addresses.
       */
      if (
        ip.startsWith(
          '::ffff:'
        )
      ) {
        ip =
          ip.slice(
            7
          );
      }


      /*
       * Normalize localhost IPv6.
       */
      if (
        ip ===
        '::1'
      ) {
        return '127.0.0.1';
      }


      return ip;
    }


    function getClientIp(req) {
      return normalizeClientIp(
        req.ip ||
        req.socket?.remoteAddress ||
        'unknown'
      );
    }


    /*
     * Dashboard pages, static assets and
     * Dashboard API routes use the dedicated
     * Dashboard protection below.
     */
    function isDashboardRequest(req) {
      return (
        req.path === '/' ||
        req.path === '/api/servers' ||
        req.path.startsWith('/api/servers/') ||
        req.path.startsWith('/servers/') ||
        req.path.startsWith('/js/') ||
        req.path.startsWith('/css/') ||
        req.path.startsWith('/images/') ||
        req.path.startsWith('/assets/') ||
        req.path === '/favicon.ico' ||
        req.path.endsWith('.ico') ||
        req.path.endsWith('.png') ||
        req.path.endsWith('.jpg') ||
        req.path.endsWith('.jpeg') ||
        req.path.endsWith('.gif') ||
        req.path.endsWith('.svg') ||
        req.path.endsWith('.webp')
      );
    }


    /*
     * Global protection for non-Dashboard
     * routes.
     */
    app.use(
      (
        req,
        res,
        next
      ) => {
        if (
          isDashboardRequest(
            req
          )
        ) {
          return next();
        }


        const ip =
          getClientIp(req);


        const now =
          Date.now();


        const windowStart =
          now -
          windowMs;


        if (
          !requestCounts.has(
            ip
          )
        ) {
          requestCounts.set(
            ip,
            []
          );
        }


        const times =
          requestCounts
            .get(ip)
            .filter(
              timestamp =>
                timestamp >
                windowStart
            );


        if (
          times.length >=
          maxRequests
        ) {
          return res
            .status(429)
            .json({
              success: false,
              error:
                'Too many requests'
            });
        }


        times.push(
          now
        );


        requestCounts.set(
          ip,
          times
        );


        next();
      }
    );


    /* ========================================
       Dashboard Abuse Protection
    ======================================== */

    const dashboardIpState =
      new Map();


    const dashboardSessionState =
      new Map();


    const temporaryBlockedIps =
      new Map();


    /*
     * Per-IP protection.
     */
    const DASHBOARD_IP_WINDOW_MS =
      60 * 1000;


    const DASHBOARD_IP_MAX_REQUESTS =
      120;


    /*
     * Per-session protection.
     */
    const DASHBOARD_SESSION_WINDOW_MS =
      60 * 1000;


    const DASHBOARD_SESSION_MAX_REQUESTS =
      60;


    /*
     * Burst protection.
     */
    const DASHBOARD_BURST_WINDOW_MS =
      1000;


    const DASHBOARD_BURST_MAX_REQUESTS =
      20;


    /*
     * Temporary IP block after burst abuse.
     */
    const DASHBOARD_BLOCK_MS =
      60 * 1000;


    /*
     * Dashboard session cookie.
     */
    const DASHBOARD_SESSION_COOKIE =
      'csmatrix_dashboard_session';


    function parseCookies(req) {
      const header =
        req.headers.cookie;


      if (!header) {
        return {};
      }


      const cookies = {};


      for (
        const part
        of header.split(';')
      ) {
        const separator =
          part.indexOf('=');


        if (
          separator ===
          -1
        ) {
          continue;
        }


        const name =
          part
            .slice(
              0,
              separator
            )
            .trim();


        const value =
          part
            .slice(
              separator + 1
            )
            .trim();


        if (!name) {
          continue;
        }


        try {
          cookies[name] =
            decodeURIComponent(
              value
            );
        } catch {
          cookies[name] =
            value;
        }
      }


      return cookies;
    }


    function getDashboardSessionId(
      req,
      res
    ) {
      const cookies =
        parseCookies(
          req
        );


      let sessionId =
        cookies[
          DASHBOARD_SESSION_COOKIE
        ];


      if (
        !sessionId ||
        sessionId.length <
          20 ||
        sessionId.length >
          100
      ) {
        sessionId =
          randomUUID();


        /*
         * Only send Secure when the current
         * request is actually using HTTPS.
         *
         * This keeps local HTTP testing functional
         * even when NODE_ENV is production.
         */
        const secureFlag =
          req.secure
            ? '; Secure'
            : '';


        res.setHeader(
          'Set-Cookie',
          `${DASHBOARD_SESSION_COOKIE}=${encodeURIComponent(
            sessionId
          )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureFlag}`
        );
      }


      return sessionId;
    }


    function sendDashboardRateLimit(
      res,
      retryAfter,
      reason
    ) {
      const normalizedRetryAfter =
        Math.max(
          1,
          Math.ceil(
            Number(
              retryAfter
            ) || 1
          )
        );


      res.setHeader(
        'Retry-After',
        String(
          normalizedRetryAfter
        )
      );


      res.setHeader(
        'Cache-Control',
        'no-store'
      );


      return res
        .status(429)
        .json({
          success: false,
          error:
            'Too many requests',
          reason,
          retryAfter:
            normalizedRetryAfter
        });
    }


    /*
     * Dashboard API protection.
     *
     * The protected endpoints are:
     *
     * /api/servers
     * /api/servers/:id
     * /api/servers/:id/statistics
     */
    app.use(
      (
        req,
        res,
        next
      ) => {
        const isDashboardApi =
          req.path ===
            '/api/servers' ||
          req.path.startsWith(
            '/api/servers/'
          );


        if (!isDashboardApi) {
          return next();
        }


        const now =
          Date.now();


        const ip =
          getClientIp(req);


        const sessionId =
          getDashboardSessionId(
            req,
            res
          );


        /* ==================================
           Temporary IP block
        ================================== */

        const blockedUntil =
          temporaryBlockedIps.get(
            ip
          );


        if (
          blockedUntil &&
          blockedUntil > now
        ) {
          const retryAfter =
            Math.ceil(
              (
                blockedUntil -
                now
              ) / 1000
            );


          return sendDashboardRateLimit(
            res,
            retryAfter,
            'temporary_block'
          );
        }


        if (
          blockedUntil &&
          blockedUntil <= now
        ) {
          temporaryBlockedIps.delete(
            ip
          );
        }


        /* ==================================
           IP state
        ================================== */

        let ipState =
          dashboardIpState.get(
            ip
          );


        if (!ipState) {
          ipState = {
            count: 0,
            resetAt:
              now +
              DASHBOARD_IP_WINDOW_MS,
            burstRequests: []
          };


          dashboardIpState.set(
            ip,
            ipState
          );
        }


        if (
          ipState.resetAt <=
          now
        ) {
          ipState.count =
            0;


          ipState.resetAt =
            now +
            DASHBOARD_IP_WINDOW_MS;


          ipState.burstRequests =
            [];
        }


        /* ==================================
           Burst protection
        ================================== */

        ipState.burstRequests =
          ipState.burstRequests.filter(
            timestamp =>
              timestamp >
              now -
              DASHBOARD_BURST_WINDOW_MS
          );


        if (
          ipState.burstRequests.length >=
          DASHBOARD_BURST_MAX_REQUESTS
        ) {
          const blockedUntilTime =
            now +
            DASHBOARD_BLOCK_MS;


          temporaryBlockedIps.set(
            ip,
            blockedUntilTime
          );


          return sendDashboardRateLimit(
            res,
            DASHBOARD_BLOCK_MS /
              1000,
            'burst_limit'
          );
        }


        ipState.burstRequests.push(
          now
        );


        /* ==================================
           Per-IP rate limit
        ================================== */

        ipState.count += 1;


        if (
          ipState.count >
          DASHBOARD_IP_MAX_REQUESTS
        ) {
          const retryAfter =
            Math.max(
              1,
              Math.ceil(
                (
                  ipState.resetAt -
                  now
                ) / 1000
              )
            );


          return sendDashboardRateLimit(
            res,
            retryAfter,
            'ip_rate_limit'
          );
        }


        /* ==================================
           Per-session rate limit
        ================================== */

        let sessionState =
          dashboardSessionState.get(
            sessionId
          );


        if (
          !sessionState ||
          sessionState.resetAt <=
            now
        ) {
          sessionState = {
            count: 0,
            resetAt:
              now +
              DASHBOARD_SESSION_WINDOW_MS
          };


          dashboardSessionState.set(
            sessionId,
            sessionState
          );
        }


        sessionState.count += 1;


        if (
          sessionState.count >
          DASHBOARD_SESSION_MAX_REQUESTS
        ) {
          const retryAfter =
            Math.max(
              1,
              Math.ceil(
                (
                  sessionState.resetAt -
                  now
                ) / 1000
              )
            );


          return sendDashboardRateLimit(
            res,
            retryAfter,
            'session_rate_limit'
          );
        }


        res.setHeader(
          'Cache-Control',
          'no-store'
        );


        next();
      }
    );


    /* ========================================
       Rate State Cleanup
    ======================================== */

    const protectionCleanup =
      setInterval(
        () => {
          const now =
            Date.now();


          /*
           * Clean generic global limiter.
           */
          for (
            const [
              ip,
              timestamps
            ]
            of requestCounts.entries()
          ) {
            const filtered =
              timestamps.filter(
                timestamp =>
                  timestamp >
                  now -
                  windowMs
              );


            if (
              filtered.length ===
              0
            ) {
              requestCounts.delete(
                ip
              );
            } else {
              requestCounts.set(
                ip,
                filtered
              );
            }
          }


          /*
           * Clean Dashboard IP states.
           */
          for (
            const [
              ip,
              state
            ]
            of dashboardIpState.entries()
          ) {
            state.burstRequests =
              state.burstRequests.filter(
                timestamp =>
                  timestamp >
                  now -
                  DASHBOARD_BURST_WINDOW_MS
              );


            const blockedUntil =
              temporaryBlockedIps.get(
                ip
              );


            if (
              state.resetAt <=
                now &&
              !blockedUntil
            ) {
              dashboardIpState.delete(
                ip
              );
            }
          }


          /*
           * Clean Dashboard session states.
           */
          for (
            const [
              sessionId,
              state
            ]
            of dashboardSessionState.entries()
          ) {
            if (
              state.resetAt <=
              now
            ) {
              dashboardSessionState.delete(
                sessionId
              );
            }
          }


          /*
           * Clean expired temporary blocks.
           */
          for (
            const [
              ip,
              blockedUntil
            ]
            of temporaryBlockedIps.entries()
          ) {
            if (
              blockedUntil <=
              now
            ) {
              temporaryBlockedIps.delete(
                ip
              );
            }
          }
        },
        5 * 60 * 1000
      );


    protectionCleanup.unref?.();


    /* ========================================
       Health Endpoint
    ======================================== */

    app.get(
      '/health',
      (
        req,
        res
      ) => {
        const dbStatus =
          this.db?.getStatus?.() ||
          {
            isDegraded:
              'unknown'
          };


        const status = {
          status:
            'healthy',

          timestamp:
            new Date().toISOString(),

          uptime:
            process.uptime(),

          database: {
            connected:
              dbStatus.connectionType !==
              'none',

            degraded:
              dbStatus.isDegraded,

            type:
              dbStatus.connectionType
          }
        };


        res
          .status(200)
          .json(
            status
          );
      }
    );


    /* ========================================
       Ready Endpoint
    ======================================== */

    app.get(
      '/ready',
      (
        req,
        res
      ) => {
        const dbStatus =
          this.db?.getStatus?.() ||
          {
            isDegraded:
              true,

            connectionType:
              'none'
          };


        const isReady =
          this.isReady() &&
          !dbStatus.isDegraded;


        const metrics = {
          guildCount:
            this.guilds?.cache?.size ??
            0,

          commandCount:
            this.commands?.size ??
            0,

          database: {
            mode:
              dbStatus.connectionType,

            degraded:
              dbStatus.isDegraded,

            degradedReason:
              dbStatus.degradedReason ??
              null
          },

          schemaVersion:
            EXPECTED_SCHEMA_VERSION,

          schemaLabel:
            EXPECTED_SCHEMA_LABEL
        };


        if (isReady) {
          return res
            .status(200)
            .json({
              ready:
                true,

              message:
                'Bot is ready',

              metrics
            });
        }


        return res
          .status(503)
          .json({
            ready:
              false,

            reason:
              !this.isReady()
                ? 'Bot not Ready'
                : 'Database degraded',

            metrics
          });
      }
    );


    /* ========================================
       Dashboard Routes
    ======================================== */

    registerDashboardRoutes(
      app
    );


    /* ========================================
       Web Server
    ======================================== */

    const startServer =
      (
        port,
        attempt = 0
      ) => {
        let hasStartedListening =
          false;


        const server =
          app.listen(
            port,
            host,
            () => {
              hasStartedListening =
                true;


              this.webServer =
                server;


              startupLog(
                `✅ Web Server running on ${host}:${port}`
              );


              startupLog(
                `Health endpoint: http://${host}:${port}/health`
              );


              startupLog(
                `Ready endpoint: http://${host}:${port}/ready`
              );
            }
          );


        server.on(
          'error',
          error => {
            const errorCode =
              error?.code ||
              'UNKNOWN_ERROR';


            const errorMessage =
              error?.message ||
              'Unknown server error';


            if (
              !hasStartedListening &&
              errorCode ===
                'EADDRINUSE' &&
              attempt <
                maxPortRetryAttempts
            ) {
              const nextPort =
                port +
                1;


              startupLog(
                `Port ${port} is already in use. Trying port ${nextPort}...`
              );


              setTimeout(
                () =>
                  startServer(
                    nextPort,
                    attempt + 1
                  ),
                250
              );


              return;
            }


            if (
              hasStartedListening &&
              errorCode ===
                'EADDRINUSE'
            ) {
              logger.warn(
                `Web server reported a duplicate bind warning on ${host}:${port}, but the bot remains online.`
              );


              return;
            }


            logger.error(
              `❌ Web server error on port ${port} (${errorCode}): ${errorMessage}`
            );


            if (
              !hasStartedListening
            ) {
              process.exit(
                1
              );
            }
          }
        );
      };


    startServer(
      configuredPort,
      0
    );
  }


  setupCronJobs() {
    cron.schedule(
      '0 6 * * *',
      runSafeTask(
        'birthday_check',
        () =>
          checkBirthdays(
            this
          )
      )
    );


    cron.schedule(
      '* * * * *',
      runSafeTask(
        'giveaway_check',
        () =>
          checkGiveaways(
            this
          )
      )
    );


    cron.schedule(
      '*/15 * * * *',
      runSafeTask(
        'counter_update',
        () =>
          this.updateAllCounters()
      )
    );
  }


  async updateAllCounters() {
    if (!this.db) {
      logger.warn(
        'Database not available for counter updates'
      );

      return;
    }


    for (
      const [
        guildId,
        guild
      ]
      of this.guilds.cache
    ) {
      try {
        const counters =
          await getServerCounters(
            this,
            guildId
          );


        const validCounters = [];
        const orphanedCounters = [];


        for (
          const counter
          of counters
        ) {
          if (
            counter &&
            counter.type &&
            counter.channelId &&
            counter.enabled !== false
          ) {
            const channel =
              guild.channels.cache.get(
                counter.channelId
              );


            if (channel) {
              validCounters.push(
                counter
              );


              await updateCounter(
                this,
                guild,
                counter
              );

            } else {
              orphanedCounters.push(
                counter
              );


              logger.info(
                `Removing orphaned counter ${counter.id} (type: ${counter.type}, deleted channel: ${counter.channelId}) from guild ${guildId}`
              );
            }
          }
        }


        if (
          orphanedCounters.length >
          0
        ) {
          await saveServerCounters(
            this,
            guildId,
            validCounters
          );


          logger.info(
            `Cleaned up ${orphanedCounters.length} orphaned counter(s) from guild ${guildId} during scheduled update`
          );
        }

      } catch (error) {
        logger.error(
          `Error updating counters for guild ${guildId}:`,
          error
        );
      }
    }
  }


  async loadHandlers() {
    startupLog(
      'Loading handlers...'
    );


    const handlers = [
      {
        path: 'events',
        type: 'default',
        required: true
      },
      {
        path: 'interactions',
        type: 'default',
        required: true
      }
    ];


    for (
      const handler
      of handlers
    ) {
      try {
        startupLog(
          `Loading handler: ${handler.path}`
        );


        const module =
          await import(
            `./handlers/loaders/${handler.path}.js`
          );


        const loaderFn =
          handler.type.startsWith(
            'named:'
          )
            ? module[
                handler.type.split(':')[1]
              ]
            : module.default;


        if (
          typeof loaderFn ===
          'function'
        ) {
          await loaderFn(
            this
          );


          startupLog(
            `✅ Loaded ${handler.path}`
          );

        } else {
          throw new Error(
            `Invalid loader export from ${handler.path}`
          );
        }

      } catch (error) {
        if (handler.required) {
          logger.error(
            `❌ Failed to load required handler ${handler.path}:`,
            error.message
          );

          throw error;

        } else if (
          error.code !==
          'MODULE_NOT_FOUND'
        ) {
          logger.warn(
            `⚠️ Failed to load optional handler ${handler.path}:`,
            error.message
          );
        }
      }
    }
  }


  async registerCommands() {
    try {
      await registerSlashCommands(
        this,
        {
          clientId:
            this.config.bot.clientId
        }
      );

    } catch (error) {
      logger.error(
        'Error registering commands:',
        error
      );
    }
  }


  async shutdown(
    reason = 'UNKNOWN'
  ) {
    shutdownLog(
      `Bot is shutting down (${reason})...`
    );


    logger.info(
      `\n${'='.repeat(60)}`
    );


    logger.info(
      `🛑 Graceful Shutdown Initiated (${reason})`
    );


    logger.info(
      `${'='.repeat(60)}`
    );


    try {
      logger.info(
        'Stopping cron jobs...'
      );


      cron
        .getTasks()
        .forEach(
          task =>
            task.stop()
        );


      logger.info(
        '✅ Cron jobs stopped'
      );


      logger.info(
        'Stopping music players...'
      );


      await shutdownMusic(
        this
      );


      logger.info(
        '✅ Music players stopped'
      );


      if (
        this.serverMonitor
      ) {
        logger.info(
          'Stopping server monitor...'
        );


        this.serverMonitor.stopMonitoring();


        logger.info(
          '✅ Server monitor stopped'
        );
      }


      if (
        this.webServer
      ) {
        logger.info(
          'Closing web server...'
        );


        await new Promise(
          resolve =>
            this.webServer.close(
              resolve
            )
        );


        logger.info(
          '✅ Web server closed'
        );
      }


      if (
        this.db &&
        this.db.db
      ) {
        logger.info(
          'Closing database connection...'
        );


        try {
          if (
            this.db.db.pool
          ) {
            await this.db.db.pool.end();


            logger.info(
              '✅ Database connection closed'
            );
          }

        } catch (error) {
          logger.warn(
            'Error closing database pool:',
            error.message
          );
        }
      }


      logger.info(
        'Destroying Discord client...'
      );


      if (
        this.isReady()
      ) {
        try {
          this.destroy();


          logger.info(
            '✅ Discord client destroyed'
          );

        } catch (error) {
          logger.warn(
            'Discord client destroy warning (non-critical):',
            error.message
          );
        }
      }


      logger.info(
        '✅ Graceful shutdown complete'
      );


      shutdownLog(
        'Bot stopped successfully.'
      );


      process.exit(
        0
      );

    } catch (error) {
      logger.error(
        'Error during graceful shutdown:',
        error
      );


      process.exit(
        1
      );
    }
  }
}


/* ========================================
   Process Startup
======================================== */

try {
  const bot =
    new TitanBot();


  const setupShutdown =
    () => {
      process.on(
        'SIGTERM',
        () =>
          bot.shutdown(
            'SIGTERM'
          )
      );


      process.on(
        'SIGINT',
        () =>
          bot.shutdown(
            'SIGINT'
          )
      );


      process.on(
        'uncaughtException',
        error => {
          handleTaskError(
            'uncaught_exception',
            error,
            {
              fatal: true
            }
          );


          bot.shutdown(
            'UNCAUGHT_EXCEPTION'
          );
        }
      );


      process.on(
        'unhandledRejection',
        reason => {
          const code =
            reason?.code;


          if (
            code === 10062 ||
            code === 40060 ||
            code === 50027
          ) {
            logger.warn(
              'Recoverable Discord interaction rejection:',
              reason?.message ||
                reason
            );


            return;
          }


          if (
            reason?.message?.includes(
              'Queue is empty'
            )
          ) {
            return;
          }


          handleTaskError(
            'unhandled_rejection',
            reason instanceof Error
              ? reason
              : new Error(
                  String(
                    reason
                  )
                ),
            {
              errorCode:
                ErrorCodes.UNHANDLED_REJECTION
            }
          );
        }
      );
    };


  setupShutdown();


  bot
    .start()
    .catch(
      error => {
        logger.error(
          'Fatal error during bot startup:',
          error
        );


        bot.shutdown(
          'STARTUP_ERROR'
        );
      }
    );

} catch (error) {
  logger.error(
    'Fatal error during bot startup:',
    error
  );


  process.exit(
    1
  );
}


export default TitanBot;