# PROJECT KNOWLEDGE GRAPH & ARCHITECTURAL SCHEMA
> **Machine-Readable & Agent-Optimized Context Graph for LLMs**  
> *Target Project:* **SyncBot / Discord Custom Logging Bot**  
> *Language & Runtime:* TypeScript 5.7+ (Node.js ESM, `tsx`)  
> *Core Frameworks:* `discord.js` v14, `express` v5, `@napi-rs/canvas`

---

## 1. Quick Ingestion Card (LLM Context Summary)

```yaml
project: SyncBot (Discord Bot & Web Management Dashboard)
architecture_pattern: Modular Layered Architecture (DDD/Clean-Lite) + SOLID Principles
entrypoint: src/index.ts
core_subsystems:
  - discord_gateway_client: src/client.ts (RAM-optimized Discord Client with custom sweepers & partial caches)
  - event_bus_registry: src/events/index.ts (Open/Closed Registry mapping Discord.js ClientEvents)
  - logging_subsystem: src/services/logging/* & src/repositories/logRepository.ts
  - welcome_canvas_engine: src/welcome/* (Lazy-loaded @napi-rs/canvas for member welcome banners)
  - feed_service: src/services/feed/* (Cross-channel message & forum announcement aggregator)
  - steam_watcher: src/services/steam/* & src/services/steamWatcher.ts (Game update polling & notify)
  - web_dashboard: src/dashboard/server.ts (Express 5 REST API + Static Single Page Application in public/)
persistence_layer:
  storage_type: JSON Flat-File Storage with In-Memory Caching and Debounced Writes
  data_directory: data/ (settings.json, logs.json, activity.json, uploads/)
```

---

## 2. High-Level Architecture Topology (Mermaid Graph)

```mermaid
graph TD
    %% Entrypoint
    subgraph Core [Bootstrap Layer]
        ENTRY[src/index.ts] --> CONFIG[src/config.ts]
        ENTRY --> CLIENT[src/client.ts: createBotClient]
        ENTRY --> REGISTRY[src/events/index.ts: registerBotEvents]
        ENTRY --> DASH_SRV[src/dashboard/server.ts: startDashboard]
        ENTRY --> STEAM_WATCHER[src/services/steamWatcher.ts: startSteamWatcher]
    end

    %% Gateway & Events
    subgraph GatewayEvents [Event Handling Layer - OCP]
        REGISTRY --> EV_READY[events/ready.ts]
        REGISTRY --> EV_MSG[events/messageCreate.ts]
        REGISTRY --> EV_MSG_DEL[events/messageDelete.ts]
        REGISTRY --> EV_MSG_UPD[events/messageUpdate.ts]
        REGISTRY --> EV_THREAD[events/threadCreate.ts]
        REGISTRY --> EV_MEM_ADD[events/guildMemberAdd.ts]
        REGISTRY --> EV_MEM_REM[events/guildMemberRemove.ts]
        REGISTRY --> EV_MEM_UPD[events/guildMemberUpdate.ts]
        REGISTRY --> EV_VOICE[events/voiceStateUpdate.ts]
        REGISTRY --> EV_BAN_ADD[events/guildBanAdd.ts]
        REGISTRY --> EV_BAN_REM[events/guildBanRemove.ts]
        REGISTRY --> WELCOME_EV[welcome/sendWelcome.ts: handleWelcome]
    end

    %% Services Layer
    subgraph DomainServices [Domain Services Layer - SRP & DIP]
        AUDIT_LOGGER[services/logging/AuditLoggerService.ts]
        FEED_SVC[services/feed/FeedService.ts]
        STEAM_NOTIFIER[services/steam/SteamDiscordNotifier.ts]
        CARD_RENDERER[welcome/cardRenderer.ts]
        STEAM_BBCODE[services/steam/SteamBbcodeFormatter.ts]
        
        LOG_ROUTER[services/logging/LogChannelRouter.ts]
        LOG_FORMATTER[services/logging/LogEmbedFormatter.ts]
        LOG_FILTER[services/logging/LogFilterPolicy.ts]
        FEED_DEDUP[services/feed/FeedDeduplicator.ts]
        
        AUDIT_LOGGER --> LOG_ROUTER
        AUDIT_LOGGER --> LOG_FORMATTER
        AUDIT_LOGGER --> LOG_FILTER
        FEED_SVC --> FEED_DEDUP
        STEAM_NOTIFIER --> STEAM_BBCODE
    end

    %% Connections from Events to Services
    EV_MSG --> FEED_SVC
    EV_MSG --> AUDIT_LOGGER
    EV_MSG_DEL --> AUDIT_LOGGER
    EV_MSG_UPD --> AUDIT_LOGGER
    EV_THREAD --> FEED_SVC
    EV_MEM_ADD --> AUDIT_LOGGER
    EV_MEM_REM --> AUDIT_LOGGER
    EV_MEM_UPD --> AUDIT_LOGGER
    EV_VOICE --> AUDIT_LOGGER
    EV_BAN_ADD --> AUDIT_LOGGER
    EV_BAN_REM --> AUDIT_LOGGER
    WELCOME_EV --> CARD_RENDERER

    %% Web Dashboard API
    subgraph DashboardLayer [Web Dashboard & REST API]
        DASH_SRV --> AUTH_MD[dashboard/middleware/basicAuth.ts]
        DASH_SRV --> R_GUILD[routes/guildRoutes.ts]
        DASH_SRV --> R_SETTINGS[routes/settingsRoutes.ts]
        DASH_SRV --> R_WELCOME[routes/welcomeRoutes.ts]
        DASH_SRV --> R_MESSAGE[routes/messageRoutes.ts]
        DASH_SRV --> R_LOG[routes/logRoutes.ts]
        DASH_SRV --> R_STEAM[routes/steamRoutes.ts]
        DASH_SRV --> R_MEMBER[routes/memberRoutes.ts]
        
        R_WELCOME --> CARD_RENDERER
        R_MESSAGE --> FEED_SVC
        R_MEMBER --> MEM_CACHE[services/memberCacheService.ts]
        R_MEMBER --> MEM_QUERY[services/memberQueryService.ts]
        R_MEMBER --> MOD_STRAT[services/moderationStrategies.ts]
        R_GUILD --> STATS_SVC[services/statsService.ts]
    end

    %% Persistence & Storage
    subgraph DataPersistence [Repositories & Data Access Layer]
        SETTINGS_REPO[settings/repository.ts: settingsRepository]
        LOG_REPO[repositories/logRepository.ts: logRepository]
        ACT_REPO[repositories/activityRepository.ts: activityRepository]
        JSON_WRITER[utils/jsonFile.ts: createDebouncedJsonWriter]
        
        SETTINGS_REPO --> JSON_WRITER
        LOG_REPO --> JSON_WRITER
        ACT_REPO --> JSON_WRITER
    end

    %% Domain Services to Persistence
    AUDIT_LOGGER --> LOG_REPO
    AUDIT_LOGGER --> SETTINGS_REPO
    FEED_SVC --> SETTINGS_REPO
    FEED_SVC --> ACT_REPO
    STEAM_WATCHER --> SETTINGS_REPO
    STEAM_NOTIFIER --> SETTINGS_REPO
    R_SETTINGS --> SETTINGS_REPO
    R_LOG --> LOG_REPO
    STATS_SVC --> ACT_REPO
    STATS_SVC --> LOG_REPO

    %% Frontend Assets
    subgraph WebUI [Dashboard Single Page UI]
        PUBLIC_HTML[public/index.html]
        PUBLIC_JS[public/app.js]
        PUBLIC_CSS[public/css/ (base.css, layout.css, components.css)]
    end
    DASH_SRV -. serves .-> WebUI
```

---

## 3. Directory & Module Reference Map

| Directory / File | Architectural Role | Key Responsibilities & Invariants |
| :--- | :--- | :--- |
| `src/index.ts` | **Application Entrypoint** | Bootstraps client, checks `.env`, registers events, starts dashboard & Steam watcher, handles `SIGINT`/`SIGTERM` graceful flush. |
| `src/client.ts` | **Client Factory (SRP)** | Instantiates `Client` with minimal intents, partial caches, and a 30-min message sweeper for RAM reduction. |
| `src/config.ts` | **Environment Config** | Loads `.env`, validates bot token, client ID, dashboard credentials, cache limits. |
| `src/settings/` | **Settings Management** | Guild-scoped configurations (`logging`, `welcome`, `feed`, `steam`). Validated & sanitized with debounced disk persistence. |
| `src/events/` | **Gateway Event Handlers (OCP)** | Decoupled event registry (`botEventRegistry`). Each Discord event has an isolated handler file. |
| `src/services/logging/` | **Audit Logging Engine** | Handles formatters, routers (single vs. multi-channel), filters (bots, ignored channels), and persistent record dispatch. |
| `src/services/feed/` | **Announcement / Feed Engine** | Aggregates messages and forum threads into formatted rich embeds with jump links, media resolver (images, videos, OpenGraph link embeds), and rate-limit deduplication. |
| `src/services/steam/` | **Steam Watcher & Notifier** | Polls Steam RSS/API for game updates, parses BBCode to Discord Markdown, broadcasts to configured channel. |
| `src/welcome/` | **Welcome Card & Canvas** | Lazy-loads `@napi-rs/canvas` to render custom text/avatar cards. Sends greeting with card attachment. |
| `src/dashboard/` | **Express 5 API Server** | BasicAuth protected REST API providing settings mutations, stats, logs, member queries, and moderation actions. |
| `src/repositories/` | **Persistence Layer (DIP)** | Thread-safe / debounced disk writes (`logs.json`, `activity.json`, `settings.json`) with in-memory caching. |
| `src/utils/videoThumbnail.ts` | **FFmpeg Media Extractor** | Uses `ffmpeg-static` stream extraction to capture video preview frames into JPEG buffers for inline embed display. |
| `public/` | **Front-End SPA** | Vanilla JS (`app.js`) + Custom CSS component architecture (buttons, switches, dropdowns, tables). |

---

## 4. Key Data Models & Contracts

### 4.1 Guild Settings (`src/settings/types.ts`)
```typescript
interface GuildSettings {
  logging: {
    enabled: boolean;
    channelId: string;
    channels: {
      mode: "single" | "multi";
      default: string;
      messages: string;
      members: string;
      voice: string;
      moderation: string;
    };
    events: {
      messageDelete: boolean;
      messageUpdate: boolean;
      memberJoin: boolean;
      memberLeave: boolean;
      memberUpdate: boolean;
      voiceJoinLeave: boolean;
      voiceMuteDeafen: boolean;
      guildBan: boolean;
    };
    filters: {
      ignoreBots: boolean;
      ignoredChannels: string[];
    };
    appearance: {
      detailLevel: "rich" | "compact";
      embedColor: string;
      eventColors?: Record<string, string>;
    };
  };
  welcome: {
    enabled: boolean;
    channelId: string;
    message: string;
    card: CardSettings; // background, avatar geometry, multi-text layers with placeholder tags
  };
  feed: {
    enabled: boolean;
    targetChannelId: string;
    sourceChannelIds: string[];
    previewLength: number;
    minContentLength: number;
    ignoreBots: boolean;
    includeImages: boolean;
    embedColor: string;
  };
  steam: {
    enabled: boolean;
    appId: string;
    channelId: string;
    mentionRoleId: string;
    checkIntervalMinutes: number;
    embedColor: string;
    lastGid: string;
  };
}
```

### 4.2 Audit Log Record (`src/repositories/logRepository.ts`)
```typescript
interface LogRecord {
  id: string;
  guildId: string;
  category: "messages" | "members" | "voice" | "moderation";
  eventType: string;
  title: string;
  description: string;
  user?: { id: string; tag: string; avatarUrl?: string; isBot?: boolean };
  channel?: { id: string; name: string };
  details?: Record<string, string | number | boolean>;
  timestamp: string; // ISO 8601
  color: string;
}
```

---

## 5. End-to-End Execution Lifecycles

### Lifecycle A: Gateway Event -> Log Routing Flow
```
Discord Gateway Event (e.g. MessageDelete)
  │
  ▼
src/events/index.ts (botEventRegistry)
  │
  ▼
src/events/messageDelete.ts
  │
  ▼
src/services/logging/AuditLoggerService.ts::sendLog()
  ├── 1. LogFilterPolicy.shouldProcess() (checks enabled, ignoreBots, ignoredChannels)
  ├── 2. LogEmbedFormatter.resolveEventColor() (custom hex / default)
  ├── 3. LogChannelRouter.resolveTargetChannel() (single default channel or category channel)
  ├── 4. Discord API: channel.send({ embeds: [formattedEmbed] })
  └── 5. logRepository.add() -> Debounced write to data/logs.json
```

### Lifecycle B: Dashboard Request -> Settings Update Flow
```
Browser / HTTP Client (PUT /api/settings/:guildId)
  │
  ▼
src/dashboard/middleware/basicAuth.ts (HTTP Basic Authentication verification)
  │
  ▼
src/dashboard/routes/settingsRoutes.ts
  │
  ▼
src/settings/sanitizer.ts::sanitizeGuildSettings() (Payload sanitization & type enforcement)
  │
  ▼
src/settings/repository.ts::saveGuildSettings()
  ├── In-Memory cache update
  └── src/utils/jsonFile.ts::createDebouncedJsonWriter() -> data/settings.json
```

---

## 6. System Invariants & Design Principles

1. **Memory & Performance Optimizations**:
   - `discord.js` cache limiters: Only essential guild structures, roles, and minimal message histories are retained.
   - Canvas: `@napi-rs/canvas` is loaded dynamically (`import(...)`) only upon the first card generation request to avoid startup RAM spike.
   - Disk I/O: Log, activity, and settings writes use debounced async flushes to prevent blocking the Node.js event loop during high-throughput logging.
2. **Security & Sandboxing**:
   - Uploaded assets for card backgrounds (`/uploads/...`) are strictly sanitized via `path.basename` to prevent path traversal attacks.
   - Dashboard endpoints are protected by HTTP Basic Auth middleware.
3. **Modularity & Open/Closed Principle (OCP)**:
   - Adding a new bot event listener requires zero modification to `src/index.ts`; new handlers are simply registered in `src/events/index.ts`.
   - Moderation actions follow the Strategy Pattern in `src/dashboard/services/moderationStrategies.ts`.
