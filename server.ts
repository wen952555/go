import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadDatabase, saveDatabase } from './src/serverStorage.ts';
import { handleApiRoute } from './src/serverApi.ts';
import { initTelegramBotService } from './src/telegramBotService.ts';
import { presenceTracker } from './src/presenceTracker.ts';
import { generateRoomDeal } from './src/gameDeckService.ts';
import { createDefaultBoardState, getSceneRequiredCoins, type AuthoritativeBoardState } from './src/gameLogic/index.ts';
import { isEightRealtimeMode, isBookingMode, isFourRealtimeMode, createShisanshuiDeal } from './src/games/shisanshui/index.ts';

// Auto-detect and load .env from project directory, parent directory (~/.env), or HOME
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  process.env.HOME ? path.resolve(process.env.HOME, '.env') : '',
].filter(Boolean);

for (const p of possibleEnvPaths) {
  if (fs.existsSync(p)) {
    try {
      const content = fs.readFileSync(p, 'utf-8');
      const parsed = dotenv.parse(content);
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.trim() !== '') {
          process.env[k] = v.trim();
        }
      }
    } catch {}
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Purge only stale/corrupted python-repackaged 4.09 MB APK files (< 4.2MB), preserving genuine >= 4.2 MB official release APKs
try {
  const candidateFiles = [
    path.resolve(process.cwd(), 'apk', 'chess-game-release.apk'),
    path.resolve(process.cwd(), 'apk', 'chess-game-debug.apk'),
    path.resolve(process.cwd(), 'apk', 'app-latest.apk'),
    path.resolve(process.cwd(), 'public', 'chess-game-release.apk'),
  ];
  for (const cf of candidateFiles) {
    if (fs.existsSync(cf)) {
      try {
        const stats = fs.statSync(cf);
        // Stale python-repackaged file is ~4,093,258 bytes. Authentic Gradle release APK is > 4.4 MB (4,600,000+ bytes)
        if (stats.size < 4200000) {
          fs.unlinkSync(cf);
          console.log(`🧹 [Server] 已自动清理旧版未签名的损坏安装包: ${path.basename(cf)} (${(stats.size / 1048576).toFixed(2)} MB)`);
        }
      } catch {}
    }
  }

  // Purge obsolete 4.09MB build info json
  const infoCandidates = [
    path.resolve(process.cwd(), 'apk', 'apk-build-info.json'),
    path.resolve(process.cwd(), 'public', 'apk-build-info.json'),
  ];
  for (const ic of infoCandidates) {
    if (fs.existsSync(ic)) {
      try {
        const raw = fs.readFileSync(ic, 'utf-8');
        if (raw.includes('4093258') || raw.includes('3.90 MB') || raw.includes('4.09')) {
          fs.unlinkSync(ic);
        }
      } catch {}
    }
  }
} catch {}

export type GameType = 'yansan' | 'shisanshui' | 'mahjong';

const app = express();

// Universal CORS Middleware for Android Capacitor Native App (https://localhost / capacitor://localhost) & Web Clients
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Range, Accept, Origin, x-telegram-bot-api-secret-token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('error', (err) => {
  console.warn('[WS Server Warning]', err);
});

export type { AuthoritativeBoardState };

const rooms = new Map<string, any>([
  [
    'RM-202',
    {
      id: 'RM-202',
      title: '风雷堂 · 经典烟三四人赛',
      gameType: 'yansan',
      status: 'playing',
      players: [
        { id: 'P-4', name: '快枪手张三', rating: 2010, seat: 0 },
        { id: 'P-5', name: '关门客李四', rating: 1940, seat: 1 },
        { id: 'P-6', name: '岭南少侠', rating: 1870, seat: 2 },
      ],
      spectators: 9,
      turnSeat: 0,
      moveCount: 6,
      modeLabel: '方块四首出 · 四人争锋',
      chat: [{ id: 'c2', sender: '快枪手张三', text: '方块四直接开顺子！', timestamp: '10:04' }],
      boardState: createDefaultBoardState('RM-202', 'yansan'),
    },
  ],
  [
    'RM-204',
    {
      id: 'RM-204',
      title: '水镜阁 · 经典十三水',
      gameType: 'shisanshui',
      status: 'playing',
      players: [
        { id: 'P-11', name: '罗宋巧手', rating: 2060, seat: 0 },
        { id: 'P-12', name: '倒水掌门', rating: 1850, seat: 1 },
        { id: 'P-13', name: '十三飞龙', rating: 2200, seat: 2 },
        { id: 'P-14', name: '七星居士', rating: 1970, seat: 3 },
      ],
      spectators: 18,
      turnSeat: 0,
      moveCount: 1,
      modeLabel: '头中尾三道 · 智能理牌',
      chat: [{ id: 'c4', sender: '十三飞龙', text: '尾道葫芦中道同花，防倒水稳如磐石。', timestamp: '10:06' }],
      boardState: createDefaultBoardState('RM-204', 'shisanshui'),
    },
  ],
  [
    'RM-205',
    {
      id: 'RM-205',
      title: '雀神楼 · 经典国标麻将',
      gameType: 'mahjong',
      status: 'playing',
      players: [
        { id: 'P-15', name: '天和雀圣', rating: 2240, seat: 0 },
        { id: 'P-16', name: '清一色老叟', rating: 2110, seat: 1 },
        { id: 'P-17', name: '大三元道长', rating: 2180, seat: 2 },
        { id: 'P-18', name: '十三幺隐士', rating: 2290, seat: 3 },
      ],
      spectators: 31,
      turnSeat: 0,
      moveCount: 12,
      modeLabel: '万条筒字 · 碰杠听胡',
      chat: [{ id: 'c5', sender: '天和雀圣', text: '自摸万字清一色，听牌在手！', timestamp: '10:07' }],
      boardState: createDefaultBoardState('RM-205', 'mahjong'),
    },
  ],
]);

interface ScenePlayer {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  coins: number;
  seat: number;
  isSimulated?: boolean;
  isReady?: boolean;
}

interface SceneWaitingRoom {
  id: string;
  gameType: string;
  sceneMode: string;
  sceneName: string;
  maxPlayers: number;
  players: ScenePlayer[];
  status: 'waiting' | 'starting' | 'playing' | 'finished';
  createdAt: number;
  lastTurnTs?: number;
  deal?: any;
}

export interface ActiveChallengeRecord {
  id: string;
  senderId: string;
  senderName: string;
  avatar: string;
  gameType: string;
  sceneMode: string;
  sceneName: string;
  text: string;
  status: 'open' | 'accepted' | 'overwritten' | 'transferred' | 'cancelled' | 'removed';
  acceptedBy?: { id: string; name: string };
  timestamp: string;
  createdAt: number;
}

const sceneWaitingRooms = new Map<string, SceneWaitingRoom>();
const activeChallenges: ActiveChallengeRecord[] = [];

// Set authoritative presence references
presenceTracker.setReferences({ rooms, sceneWaitingRooms, wss });

function broadcast(payload: unknown) {
  try {
    const raw = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(raw);
        } catch {}
      }
    }
  } catch {}
}

function broadcastTeahousePlayers() {
  try {
    const db = loadDatabase();
    const players = presenceTracker.getAllPlayers(db.profiles || {});
    broadcast({
      type: 'teahouse_players_update',
      count: players.length,
      onlineCount: players.filter((p: any) => p.isOnline).length,
      players,
    });
  } catch {}
}

wss.on('connection', (ws) => {
  const socketId = Math.random().toString(36).slice(2, 10);
  (ws as any).socketId = socketId;
  (ws as any).isAlive = true;
  (ws as any).lastHeartbeat = Date.now();
  presenceTracker.recordClient(socketId, { gameType: 'lobby' });

  ws.on('pong', () => {
    (ws as any).isAlive = true;
    (ws as any).lastHeartbeat = Date.now();
  });

  ws.on('error', () => {
    // Gracefully ignore client connection reset
  });

  try {
    const presenceCounts = presenceTracker.getRealGamePresence();
    const db = loadDatabase();
    const teahousePlayers = presenceTracker.getAllPlayers(db.profiles || {});
    ws.send(
      JSON.stringify({
        type: 'lobby_snapshot',
        rooms: Array.from(rooms.values()),
        onlineCount: wss.clients.size,
        counts: presenceCounts,
        players: teahousePlayers,
        serverTs: Date.now(),
      })
    );
    ws.send(
      JSON.stringify({
        type: 'teahouse_players_update',
        count: teahousePlayers.length,
        onlineCount: teahousePlayers.filter((p: any) => p.isOnline).length,
        players: teahousePlayers,
      })
    );
  } catch {}

  // Broadcast real presence counts on new client connection
  broadcast({
    type: 'presence_counts',
    counts: presenceTracker.getRealGamePresence(),
  });
  broadcastTeahousePlayers();

  ws.on('close', () => {
    presenceTracker.removeClient((ws as any).socketId);
    broadcastTeahousePlayers();
    const sRoomId = (ws as any).sceneRoomId;
    const pId = (ws as any).scenePlayerId;
    if (sRoomId && sceneWaitingRooms.has(sRoomId)) {
      const room = sceneWaitingRooms.get(sRoomId)!;
      const isShisanshuiReservation = room.gameType === 'shisanshui' && room.sceneMode === 'reservation';

      // 局内断线自动智能托管机制 (除十三水预约场外)：若普通对局进行中(starting或playing)，开启托管完成该局
      // 规则例外：十三水预约场设定为倒计时到时间自动结算，不触发断线自动托管功能
      if ((room.status === 'starting' || room.status === 'playing') && !isShisanshuiReservation) {
        const pl = room.players.find((p) => p.id === pId);
        if (pl) {
          (pl as any).isDisconnected = true;
          (pl as any).isAutoManaged = true; // 标记自动托管状态
          console.log(`🤖 [断线自动托管] 玩家 ${pl.name} (${pl.id}) 切后台/接电话掉线，已启用智能托管完成该局对局`);
          broadcast({
            type: 'scene_room_update',
            roomId: room.id,
            gameType: room.gameType,
            sceneMode: room.sceneMode,
            players: room.players,
            maxPlayers: room.maxPlayers,
            status: room.status,
          });
        }
      } else {
        // 未开局的普通等候室或十三水预约场：直接移出并重排席位方便其他玩家入座
        room.players = room.players.filter((pl) => pl.id !== pId);
        if (room.players.length === 0) {
          sceneWaitingRooms.delete(sRoomId);
        } else {
          room.players.forEach((pl, idx) => {
            pl.seat = idx;
          });
          if (room.status !== 'playing' && room.status !== 'starting') {
            room.status = 'waiting';
          }
          broadcast({
            type: 'scene_room_update',
            roomId: room.id,
            gameType: room.gameType,
            sceneMode: room.sceneMode,
            players: room.players,
            maxPlayers: room.maxPlayers,
            status: room.status,
          });
        }
      }
    }
    // 若断开连接的玩家有未被应战的战帖，自动清理移出，避免挂在擂台造成无效战帖残留刷屏
    for (let i = activeChallenges.length - 1; i >= 0; i--) {
      const ch = activeChallenges[i];
      if (ch.senderId === pId && !ch.acceptedBy) {
        const rmId = ch.id;
        activeChallenges.splice(i, 1);
        broadcast({
          type: 'challenge_status_update',
          challengeId: rmId,
          status: 'removed',
          senderId: pId,
          senderName: ch.senderName,
          gameType: ch.gameType,
          sceneMode: ch.sceneMode,
        });
      }
    }
    // Broadcast updated genuine player count across games
    broadcast({
      type: 'presence_counts',
      counts: presenceTracker.getRealGamePresence(),
    });
  });

  ws.on('message', (data) => {
    try {
      (ws as any).isAlive = true;
      (ws as any).lastHeartbeat = Date.now();
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        ws.send(
          JSON.stringify({
            type: 'pong',
            clientTs: msg.clientTs,
            serverTs: Date.now(),
            onlineCount: wss.clients.size,
          })
        );
        return;
      }

      if (msg.type === 'presence_update') {
        const targetGame = msg.gameType === 'yansan' || msg.gameType === 'shisanshui' || msg.gameType === 'mahjong' ? msg.gameType : 'lobby';
        presenceTracker.updateClientGame((ws as any).socketId, targetGame, msg.sceneMode);
        if (msg.playerId) {
          presenceTracker.recordClient((ws as any).socketId, {
            gameType: targetGame,
            playerId: msg.playerId,
            playerName: msg.playerName,
            avatar: msg.avatar,
            coins: typeof msg.coins === 'number' ? msg.coins : undefined,
            rating: typeof msg.rating === 'number' ? msg.rating : undefined,
            phone: msg.phone,
            sceneMode: msg.sceneMode,
          });
        }
        broadcast({
          type: 'presence_counts',
          counts: presenceTracker.getRealGamePresence(),
        });
        broadcastTeahousePlayers();
        return;
      }

      if (msg.type === 'request_teahouse_players') {
        const db = loadDatabase();
        const players = presenceTracker.getAllPlayers(db.profiles || {});
        ws.send(JSON.stringify({
          type: 'teahouse_players_update',
          count: players.length,
          onlineCount: players.filter((p: any) => p.isOnline).length,
          players,
        }));
        return;
      }

      // ==========================================
      // 局内断线快照恢复 (Reconnection State Hydration)
      // ==========================================
      if (msg.type === 'scene_reconnect') {
        const pId = msg.playerId;
        const targetRoomId = msg.roomId;
        let targetRoom: SceneWaitingRoom | undefined;
        if (targetRoomId && sceneWaitingRooms.has(targetRoomId)) {
          targetRoom = sceneWaitingRooms.get(targetRoomId);
        }
        if (!targetRoom && pId) {
          for (const r of sceneWaitingRooms.values()) {
            if (r.players.some((pl) => pl.id === pId || pl.name === msg.playerName)) {
              targetRoom = r;
              break;
            }
          }
        }
        if (targetRoom) {
          const pl = targetRoom.players.find((p) => p.id === pId || p.name === msg.playerName);
          if (pl) {
            delete (pl as any).isDisconnected;
            delete (pl as any).isAutoManaged; // 取消智能托管，恢复真人控制
            (pl as any).socketId = (ws as any).socketId;
            (ws as any).sceneRoomId = targetRoom.id;
            (ws as any).scenePlayerId = pl.id;
            const authRoom = rooms.get(targetRoom.id);
            ws.send(
              JSON.stringify({
                type: 'scene_reconnect_ack',
                room: targetRoom,
                boardState: authRoom ? authRoom.boardState : null,
                players: targetRoom.players,
                deal: (targetRoom as any).deal || (authRoom ? (authRoom as any).deal : null),
                serverTs: Date.now(),
              })
            );
            broadcast({
              type: 'scene_room_update',
              roomId: targetRoom.id,
              gameType: targetRoom.gameType,
              sceneMode: targetRoom.sceneMode,
              players: targetRoom.players,
              maxPlayers: targetRoom.maxPlayers,
              status: targetRoom.status,
            });
            return;
          }
        }
        ws.send(
          JSON.stringify({
            type: 'scene_reconnect_ack',
            failed: true,
            reason: 'room_not_found',
          })
        );
        return;
      }

      if (msg.type === 'scene_player_ready') {
        const targetRoomId = msg.roomId || (ws as any).sceneRoomId;
        const pId = msg.playerId || (ws as any).scenePlayerId;
        if (targetRoomId && sceneWaitingRooms.has(targetRoomId)) {
          const room = sceneWaitingRooms.get(targetRoomId)!;
          const pl = room.players.find((p) =>
            (p.id && pId && (p.id === pId || (p as any).originalId === pId)) ||
            (typeof msg.seat === 'number' && p.seat === msg.seat) ||
            (p as any).socketId === (ws as any).socketId
          );
          if (pl) {
            (pl as any).isReady = Boolean(msg.isReady ?? true);
          }
          const authRoom = rooms.get(targetRoomId);
          if (authRoom && Array.isArray(authRoom.players)) {
            const apl = authRoom.players.find((p: any) =>
              (p.id && pId && (p.id === pId || (p as any).originalId === pId)) ||
              (typeof msg.seat === 'number' && p.seat === msg.seat) ||
              p.socketId === (ws as any).socketId
            );
            if (apl) {
              apl.isReady = Boolean(msg.isReady ?? true);
            }
          }
          broadcast({
            type: 'scene_room_update',
            roomId: room.id,
            gameType: room.gameType,
            sceneMode: room.sceneMode,
            players: room.players,
            maxPlayers: room.maxPlayers,
            status: room.status,
          });
          startRoomGameIfFull(room);
        }
        return;
      }

      if (msg.type === 'scene_start_game') {
        const roomId = msg.roomId;
        if (roomId && sceneWaitingRooms.has(roomId)) {
          const room = sceneWaitingRooms.get(roomId)!;
          startRoomGameIfFull(room);
        }
        return;
      }

      function startRoomGameIfFull(room: SceneWaitingRoom) {
        if (!room) return false;

        // 水镜十三水 / 十三张 (Shisanshui) 模块化场景对局逻辑
        if (room.gameType === 'shisanshui') {
          if (isEightRealtimeMode(room.sceneMode)) {
            const currentCount = Array.isArray(room.players) ? room.players.length : 0;
            if (currentCount < 5) {
              if (room.status !== 'waiting') {
                room.status = 'waiting';
                delete (room as any).deal;
                delete (room as any).lastEightPlayerCount;
              }
              return false;
            }

            // 5 ~ 8 人开启 90 秒理牌比水倒计时；当第 6/7/8 位新玩家中途加入时重置倒计时为 90 秒
            const lastCount = (room as any).lastEightPlayerCount || 0;
            const isNewPlayerJoined = currentCount !== lastCount;

            if (isNewPlayerJoined || !(room as any).deal) {
              (room as any).lastEightPlayerCount = currentCount;
              const freshDeal = createShisanshuiDeal(room.sceneMode);
              (room as any).deal = freshDeal;
              (room as any).arrangeCountdown = 90;
              (room as any).arrangeDeadline = Date.now() + 90000;
              room.status = 'playing';

              const defaultBoard = createDefaultBoardState(room.id, room.gameType);
              const authRoom = rooms.get(room.id);
              if (!authRoom) {
                rooms.set(room.id, {
                  id: room.id,
                  title: `${room.sceneName} · 八人双副争霸`,
                  gameType: room.gameType,
                  status: 'playing',
                  players: room.players.map((pl, idx) => ({ ...pl, seat: idx, rating: pl.rating || 1900 })),
                  spectators: 0,
                  turnSeat: 0,
                  lastTurnTs: Date.now(),
                  moveCount: 0,
                  deal: freshDeal,
                  modeLabel: `${room.sceneName} · 实时8人比水`,
                  chat: [],
                  boardState: defaultBoard,
                });
              } else {
                authRoom.status = 'playing';
                authRoom.deal = freshDeal;
                authRoom.lastTurnTs = Date.now();
                authRoom.players = room.players.map((pl, idx) => ({ ...pl, seat: idx, rating: pl.rating || 1900 }));
              }

              const joinText = lastCount > 0
                ? `📢 第 ${currentCount} 位牌友加入！理牌比水倒计时重新重置为 90 秒！`
                : `📢 ${currentCount} 位牌友已就位，开启 90 秒理牌比水倒计时！`;

              console.log(`🚀 [8人实时场理牌倒计时] 房间 ${room.id} (${currentCount}/8人) ${joinText}`);

              broadcast({
                type: 'scene_room_started',
                roomId: room.id,
                gameType: room.gameType,
                sceneMode: room.sceneMode,
                players: room.players,
                maxPlayers: 8,
                deal: freshDeal,
                status: 'playing',
                arrangeCountdown: 90,
                timerReset: true,
                joinNotification: joinText,
                timestamp: Date.now(),
              });
              return true;
            }
            return true;
          }

          if (isBookingMode(room.sceneMode)) {
            return true;
          }
        }

        // 1. 若玩家人数不足 maxPlayers，强制保持 waiting 状态，严禁被错误锁定为 playing/starting
        if (!Array.isArray(room.players) || room.players.length < room.maxPlayers) {
          if (room.status !== 'waiting') {
            room.status = 'waiting';
            delete (room as any).deal;
          }
          return false;
        }

        // 2. 防重复开局保护：若房间已处于 starting 或 playing 且已有有效发牌切片，立刻锁定并返回
        if ((room.status === 'starting' || room.status === 'playing') && (room as any).deal && (room as any).deal.seatCards) {
          return true;
        }

        // 3. 深度席位校验与修正：过滤有效玩家，强制按 0..maxPlayers-1 顺序严格重置席位
        const validPlayers = room.players.filter((p: any) => p && (p.id || p.name)).slice(0, room.maxPlayers);
        if (validPlayers.length < room.maxPlayers) {
          room.status = 'waiting';
          return false;
        }

        // 4. 全员准备规则校验：必须所有玩家都点击准备/继续下一局 (pl.isReady === true) 才能开局！
        // 若有任意一位玩家未点击“继续下一局”，严禁提前开局，维持等待准备状态并实时向所有茶客广播进度
        const allReady = validPlayers.every((pl: any) => Boolean(pl.isReady));
        if (!allReady) {
          const readyCount = validPlayers.filter((p: any) => p.isReady).length;
          console.log(`⏳ [等待全员准备] 房间 ${room.id} (${room.gameType}-${room.sceneMode}) 准备进度: ${readyCount}/${room.maxPlayers}，必须 4 位玩家均点击“继续下一局”才可开局`);
          return false;
        }

        // 5. 校验通过（4人均已点击准备就绪）：规范席位与清理临时标记
        validPlayers.forEach((pl: any, idx: number) => {
          pl.seat = idx;
          pl.isReady = true;
          delete (pl as any).isDisconnected;
          delete (pl as any).isAutoManaged;
          if (!pl.id) pl.id = `P-usr-${idx}-${Date.now().toString(36)}`;
          if (!pl.name) pl.name = `茶客 #${idx + 1}`;
        });
        room.players = validPlayers;

        // 6. 强制锁定状态为 starting，防止并发指令冲突
        room.status = 'starting';

        // 5. 强制产生全新发牌切片（零残留）
        delete (room as any).deal;
        const freshDeal = generateRoomDeal(room.gameType, room.sceneMode, room.maxPlayers);
        (room as any).deal = freshDeal;

        const defaultBoard = createDefaultBoardState(room.id, room.gameType);

        if (!rooms.has(room.id)) {
          rooms.set(room.id, {
            id: room.id,
            title: `${room.sceneName} · 纯真人对决`,
            gameType: room.gameType,
            status: 'starting',
            players: room.players.map((pl, idx) => ({ ...pl, seat: idx, rating: pl.rating || 1900 })),
            spectators: 0,
            turnSeat: (freshDeal as any)?.starterSeat ?? 0,
            lastTurnTs: Date.now(),
            moveCount: 0,
            deal: freshDeal,
            modeLabel: `${room.sceneName} · 实时对决`,
            chat: [],
            boardState: defaultBoard,
          });
        } else {
          const existingRoom = rooms.get(room.id);
          if (existingRoom) {
            existingRoom.status = 'starting';
            existingRoom.deal = freshDeal;
            existingRoom.turnSeat = (freshDeal as any)?.starterSeat ?? 0;
            existingRoom.lastTurnTs = Date.now();
            existingRoom.boardState = defaultBoard;
            existingRoom.players = room.players.map((pl, idx) => ({ ...pl, seat: idx, rating: pl.rating || 1900 }));
          }
        }

        console.log(`🚀 [满员自动发牌] 房间 ${room.id} (${room.gameType}-${room.sceneMode}) ${room.players.length}/${room.maxPlayers} 玩家席位校验完毕，广播 scene_room_full 锁定 UI！`);

        // 6. 广播满员进桌事件 (status: starting)，通知所有客户端 UI 平滑切换至竞技场并明确锁定 UI
        broadcast({
          type: 'scene_room_full',
          roomId: room.id,
          gameType: room.gameType,
          sceneMode: room.sceneMode,
          players: room.players,
          maxPlayers: room.maxPlayers,
          deal: freshDeal,
          turnSeat: (freshDeal as any)?.starterSeat ?? 0,
          boardState: defaultBoard,
          status: 'starting',
          lockGameLaunch: true,
          forceReset: true,
          timestamp: Date.now(),
        });

        // 7. 1400ms 后顺畅广播 scene_room_started，正式将状态锁定为 playing
        setTimeout(() => {
          if (room && sceneWaitingRooms.has(room.id)) {
            room.status = 'playing';
            const authRoom = rooms.get(room.id);
            if (authRoom) {
              authRoom.status = 'playing';
              authRoom.lastTurnTs = Date.now();
            }
            broadcast({
              type: 'scene_room_started',
              roomId: room.id,
              gameType: room.gameType,
              sceneMode: room.sceneMode,
              players: room.players,
              maxPlayers: room.maxPlayers,
              deal: freshDeal,
              turnSeat: (freshDeal as any)?.starterSeat ?? 0,
              boardState: authRoom ? authRoom.boardState : defaultBoard,
              status: 'playing',
              lockGameLaunch: true,
              forceReset: true,
              timestamp: Date.now(),
            });
          }
        }, 1400);

        return true;
      }

      if (msg.type === 'scene_fill_bots' || msg.type === 'scene_quick_match') {
        // 核心规则梳理：只有试玩模式是人机补位，真实玩家进入游戏不允许人机补位！
        // 服务端管理的 sceneWaitingRooms 均为纯真人实时排队，严禁注入任何人机/假人席位！
        console.warn(`⛔ [纯真人防假人] 拦截人机补位请求 (${msg.type})，当前房间为真实玩家匹配房间，严禁人机补位！`);
        return;
      }

      if (msg.type === 'scene_join') {
        const gType = msg.gameType || 'yansan';
        const sMode = msg.sceneMode || 'standard';
        const sName = msg.sceneName || '经典场';
        const maxP = Number(msg.maxPlayers) || ((gType === 'shisanshui' && sMode.includes('eight')) ? 8 : 4);
        const p: ScenePlayer = msg.player || {
          id: `P-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: '牌友',
          avatar: '👑',
          rating: 1900,
          coins: 2000,
          seat: 0,
        };

        // Enforce unique player ID if default/generic
        const rawId = p.id;
        if (!p.id || p.id === 'P-me' || p.id === 'P-123') {
          p.id = `P-usr-${(ws as any).socketId || Date.now()}`;
          (p as any).originalId = rawId || 'P-me';
        }
        delete (p as any).isSimulated;
        delete (p as any).isAi;

        // 校验积分门槛，防止零积分或积分不足的玩家入座
        const reqCoins = getSceneRequiredCoins(gType, sMode);
        const currentCoins = typeof p.coins === 'number' && !isNaN(p.coins) ? p.coins : 0;
        if (currentCoins < reqCoins || currentCoins <= 0) {
          ws.send(
            JSON.stringify({
              type: 'scene_join_rejected',
              reason: 'insufficient_coins',
              requiredCoins: reqCoins,
              currentCoins,
              text: `您的积分不足 (${currentCoins}/${reqCoins} 分)，无法入座此分场！`,
            })
          );
          return;
        }

        // 0. 干净清理玩家此前可能沉淀在其他不同场次/房间的旧席位残留
        const currentSocketId = (ws as any).socketId;
        for (const [otherId, otherRoom] of sceneWaitingRooms.entries()) {
          const isPlayerInOther = otherRoom.players.some(
            (pl) => (pl.id && p.id && pl.id === p.id) || (pl as any).socketId === currentSocketId
          );
          if (isPlayerInOther) {
            if (otherRoom.gameType !== gType || otherRoom.sceneMode !== sMode) {
              otherRoom.players = otherRoom.players.filter(
                (pl) => pl.id !== p.id && (pl as any).socketId !== currentSocketId
              );
              if (otherRoom.players.length === 0) {
                sceneWaitingRooms.delete(otherId);
              } else {
                otherRoom.players.forEach((pl, idx) => { pl.seat = idx; });
                if (otherRoom.status === 'waiting') {
                  broadcast({
                    type: 'scene_room_update',
                    roomId: otherRoom.id,
                    gameType: otherRoom.gameType,
                    sceneMode: otherRoom.sceneMode,
                    players: otherRoom.players,
                    maxPlayers: otherRoom.maxPlayers,
                    status: otherRoom.status,
                  });
                }
              }
            }
          }
        }

        // 严格防超载与多房间独立分配逻辑：
        // 1. 若当前连接（同一 socketId）已在某个房间中，继续沿用该房间
        let room: SceneWaitingRoom | undefined;
        for (const r of sceneWaitingRooms.values()) {
          if (r.gameType === gType && r.sceneMode === sMode) {
            const hasSameSocket = r.players.some((pl) => (pl as any).socketId === currentSocketId);
            if (hasSameSocket) {
              room = r;
              break;
            }
          }
        }

        // 2. 若玩家此前掉线断开（相同 playerId 且原 socket 已死），且原房间仍有席位且未开局，才允许认领原房间
        if (!room && p.id) {
          for (const r of sceneWaitingRooms.values()) {
            if (r.gameType === gType && r.sceneMode === sMode && (r.status === 'waiting' || r.status === 'finished')) {
              const matchedPlayer = r.players.find((pl) => pl.id === p.id);
              if (matchedPlayer) {
                let oldSocketAlive = false;
                for (const client of wss.clients) {
                  if ((client as any).socketId === (matchedPlayer as any).socketId && client.readyState === WebSocket.OPEN) {
                    oldSocketAlive = true;
                    break;
                  }
                }
                if (!oldSocketAlive && r.players.length < r.maxPlayers) {
                  room = r;
                  break;
                }
              }
            }
          }
        }

        // 3. 若未在上述房间，寻找仍有空位且正在排队的房间
        const isShisanshuiEightJoin = gType === 'shisanshui' && isEightRealtimeMode(sMode);
        if (!room) {
          for (const r of sceneWaitingRooms.values()) {
            if (r.gameType === gType && r.sceneMode === sMode) {
              if (isShisanshuiEightJoin) {
                if (r.players.length < 8) {
                  room = r;
                  break;
                }
              } else if (r.status === 'waiting' && r.players.length < r.maxPlayers) {
                room = r;
                break;
              }
            }
          }
        }

        // 4. 若无未满员的等候房间，立即为第5个或新玩家另外创建新房间！
        if (!room) {
          const id = `SCENE-${gType}-${sMode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          room = {
            id,
            gameType: gType,
            sceneMode: sMode,
            sceneName: sName,
            maxPlayers: maxP,
            players: [],
            status: 'waiting',
            createdAt: Date.now(),
          };
          sceneWaitingRooms.set(id, room);
        }

        // 5. 严格多开查重与独立席位分配
        let existingIdx = room.players.findIndex((pl) => (pl as any).socketId === currentSocketId);
        if (existingIdx === -1 && p.id) {
          const sameIdPlayer = room.players.find((pl) => pl.id === p.id);
          if (sameIdPlayer) {
            let oldSocketAlive = false;
            for (const client of wss.clients) {
              if ((client as any).socketId === (sameIdPlayer as any).socketId && client.readyState === WebSocket.OPEN) {
                oldSocketAlive = true;
                break;
              }
            }
            if (oldSocketAlive) {
              // 同一设备多开测试标签页：分配独立测试身份，互不抢占席位
              p.id = `${p.id}_tab_${currentSocketId}`;
              p.name = `${p.name} #${room.players.length + 1}`;
            } else {
              // 旧连接已断开，重新认领该席位
              existingIdx = room.players.indexOf(sameIdPlayer);
            }
          }
        }

        // 6. 核心硬保障：若选中的房间已满员 (>= maxPlayers) 或已开局，且当前玩家不是该房间原有成员，绝对不能加入！
        // 八人实时场中途允许 5 ~ 7 人时加入，直到满 8 人才算满员隔离
        const isRoomClosedForNewPlayer = isShisanshuiEightJoin
          ? room.players.length >= 8
          : (room.players.length >= room.maxPlayers || room.status === 'playing' || room.status === 'starting');

        if (existingIdx === -1 && isRoomClosedForNewPlayer) {
          console.log(`🀄 [房间满员硬隔离] 房间 ${room.id} (${room.gameType}) 已有 ${room.players.length}/${room.maxPlayers} 人且在游戏中，为新茶客 ${p.name}(${p.id}) 独立创建新房间等待加入！`);
          const newRoomId = `SCENE-${gType}-${sMode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          room = {
            id: newRoomId,
            gameType: gType,
            sceneMode: sMode,
            sceneName: sName,
            maxPlayers: maxP,
            players: [],
            status: 'waiting',
            createdAt: Date.now(),
          };
          sceneWaitingRooms.set(newRoomId, room);
          existingIdx = -1;
        }

        if (existingIdx !== -1) {
          room.players[existingIdx] = { ...room.players[existingIdx], ...p, socketId: currentSocketId, isReady: true } as any;
        } else if (room.players.length < room.maxPlayers) {
          p.seat = room.players.length;
          (p as any).socketId = currentSocketId;
          (p as any).isReady = true;
          room.players.push(p);
        } else {
          console.warn(`⚠️ [安全防爆干预] 房间 ${room.id} 无法容纳第 ${room.players.length + 1} 位玩家，严禁注入满员房间！`);
        }

        (ws as any).sceneRoomId = room.id;
        (ws as any).scenePlayerId = p.id;

        presenceTracker.updateClientGame((ws as any).socketId, gType, sMode);
        presenceTracker.recordClient((ws as any).socketId, {
          gameType: gType,
          playerId: p.id,
          playerName: p.name,
          sceneMode: sMode,
        });

        // 立即向刚入座的客户端发送 scene_join_ack 确认消息，确保其 activeRoomId 与 currentRoomId 瞬间对齐
        try {
          ws.send(JSON.stringify({
            type: 'scene_join_ack',
            roomId: room.id,
            gameType: room.gameType,
            sceneMode: room.sceneMode,
            player: p,
            assignedPlayerId: p.id,
            assignedSeat: p.seat,
            players: room.players,
            maxPlayers: room.maxPlayers,
            status: room.status,
            deal: (room as any).deal,
          }));
        } catch {}

        broadcast({
          type: 'presence_counts',
          counts: presenceTracker.getRealGamePresence(),
        });
        broadcastTeahousePlayers();

        if (!startRoomGameIfFull(room)) {
          room.status = 'waiting';
          delete (room as any).deal;
          broadcast({
            type: 'scene_room_update',
            roomId: room.id,
            gameType: room.gameType,
            sceneMode: room.sceneMode,
            players: room.players,
            maxPlayers: room.maxPlayers,
            status: room.status,
          });
        }

        broadcast({
          type: 'presence_counts',
          counts: presenceTracker.getRealGamePresence(),
        });
        return;
      }

      if (msg.type === 'scene_leave') {
        presenceTracker.updateClientGame((ws as any).socketId, 'lobby');
        const currentSocketId = (ws as any).socketId;
        const leavePlayerId = msg.playerId || (ws as any).scenePlayerId;
        const leavePlayerName = msg.playerName;
        const targetRoomId = msg.roomId || (ws as any).sceneRoomId;

        for (const [id, room] of sceneWaitingRooms.entries()) {
          const isTargetRoom = targetRoomId ? id === targetRoomId : room.players.some((pl) => (pl.id && leavePlayerId && pl.id === leavePlayerId) || pl.name === leavePlayerName || (pl as any).socketId === currentSocketId);

          if (isTargetRoom) {
            room.players = room.players.filter(
              (pl) => pl.id !== leavePlayerId && pl.name !== leavePlayerName && (pl as any).socketId !== currentSocketId
            );

            if (room.players.length === 0) {
              sceneWaitingRooms.delete(id);
              rooms.delete(id);
            } else {
              room.players.forEach((pl, idx) => {
                pl.seat = idx;
              });
              if (room.players.length < room.maxPlayers) {
                room.status = 'waiting';
                delete (room as any).deal;
              }
              const authRoom = rooms.get(id);
              if (authRoom) {
                authRoom.players = room.players.map((pl, idx) => ({ ...pl, seat: idx }));
                authRoom.status = room.status;
                if (room.status === 'waiting') {
                  delete (authRoom as any).deal;
                }
              }
              broadcast({
                type: 'scene_room_update',
                roomId: room.id,
                gameType: room.gameType,
                sceneMode: room.sceneMode,
                players: room.players,
                maxPlayers: room.maxPlayers,
                status: room.status,
              });
            }
          }
        }
        if (msg.roomId && rooms.has(msg.roomId)) {
          const r = rooms.get(msg.roomId);
          if (r) {
            r.players = r.players.filter((pl) => pl.id !== msg.playerId && pl.name !== msg.playerName);
            if (r.players.length === 0) {
              rooms.delete(msg.roomId);
            } else {
              r.status = 'waiting';
              delete (r as any).deal;
            }
          }
        }
        // 清理离开场景的玩家此前所发且无人应战的旧战帖，防止残留刷屏
        for (let i = activeChallenges.length - 1; i >= 0; i--) {
          const ch = activeChallenges[i];
          if ((ch.senderId === msg.playerId || ch.senderName === msg.playerName) && (!msg.sceneMode || ch.sceneMode === msg.sceneMode) && !ch.acceptedBy) {
            const removedId = ch.id;
            activeChallenges.splice(i, 1);
            broadcast({
              type: 'challenge_status_update',
              challengeId: removedId,
              status: 'removed',
              senderId: msg.playerId,
              senderName: msg.playerName,
              gameType: ch.gameType,
              sceneMode: ch.sceneMode,
            });
          }
        }
        broadcast({
          type: 'presence_counts',
          counts: presenceTracker.getRealGamePresence(),
        });
        return;
      }

      if (msg.type === 'scene_chat') {
        const isChallenge = msg.action === 'challenge';
        const targetChannel = isChallenge ? 'hall' : (msg.channel || 'hall');

        if (isChallenge && msg.gameType && msg.sceneMode) {
          const senderId = msg.senderId || 'P-guest';
          const senderName = msg.sender || '牌友';

          // 寻找该玩家之前发过的未转移旧战帖
          const previousUserChallenges = activeChallenges.filter(
            (c) => (c.senderId === senderId || c.senderName === senderName) &&
                   c.status !== 'cancelled' && c.status !== 'removed'
          );

          for (const oldCh of previousUserChallenges) {
            if (oldCh.acceptedBy) {
              // 情况 1：旧战帖已有玩家应战 -> 转移战帖给应战牌友，由其继承守擂！
              const newHost = oldCh.acceptedBy;
              oldCh.senderId = newHost.id;
              oldCh.senderName = newHost.name;
              oldCh.status = 'transferred';
              oldCh.text = `⚔️ 在【${oldCh.sceneName}】由 [${newHost.name}] 继承守擂：“谁来与我一战到底！”`;
              const oldAcceptedHost = { ...newHost };
              oldCh.acceptedBy = undefined; // 重置，以便后续其他牌友加入 newHost 的桌台

              broadcast({
                type: 'challenge_status_update',
                challengeId: oldCh.id,
                status: 'transferred',
                newSenderId: oldAcceptedHost.id,
                newSenderName: oldAcceptedHost.name,
                gameType: oldCh.gameType,
                sceneMode: oldCh.sceneMode,
                sceneName: oldCh.sceneName,
                text: oldCh.text,
              });

              broadcast({
                type: 'scene_chat_broadcast',
                gameType: oldCh.gameType,
                sceneMode: oldCh.sceneMode,
                sceneName: oldCh.sceneName,
                channel: 'hall',
                sender: '🤖 牌楼官播 BOT',
                senderId: 'BOT-SYSTEM',
                avatar: '🤖',
                text: `⚔️【擂台过继】牌友 [${senderName}] 已移步至新场景，原【${oldCh.sceneName}】战帖已顺位过继由 [${oldAcceptedHost.name}] 继承守擂！`,
                action: 'notice',
                timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
              });
            } else {
              // 情况 2：旧战帖无玩家应战 -> 直接彻底清理删除该旧战帖，绝不标记覆盖作废，彻底避免刷屏满屏
              const rmIdx = activeChallenges.findIndex((c) => c.id === oldCh.id);
              if (rmIdx !== -1) {
                activeChallenges.splice(rmIdx, 1);
              }

              broadcast({
                type: 'challenge_status_update',
                challengeId: oldCh.id,
                status: 'removed',
                senderId: senderId,
                senderName: senderName,
                gameType: oldCh.gameType,
                sceneMode: oldCh.sceneMode,
              });
            }
          }

          const newCh: ActiveChallengeRecord = {
            id: msg.challengeId || `ch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            senderId,
            senderName,
            avatar: msg.avatar || '👑',
            gameType: msg.gameType,
            sceneMode: msg.sceneMode,
            sceneName: msg.sceneName || '经典分场',
            text: msg.text ? String(msg.text).slice(0, 200) : '摆下战帖，谁敢来与我一战到底！',
            status: 'open',
            timestamp: msg.timestamp || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            createdAt: Date.now(),
          };
          activeChallenges.unshift(newCh);
          if (activeChallenges.length > 30) activeChallenges.pop();

          msg.challengeId = newCh.id;
        }

        broadcast({
          type: 'scene_chat_broadcast',
          challengeId: msg.challengeId || null,
          gameType: msg.gameType,
          sceneMode: msg.sceneMode,
          sceneName: msg.sceneName || null,
          channel: targetChannel, // 强制将战帖广播至全楼大堂 hall 频道，确保在线所有玩家接收到！
          sender: msg.sender || '牌友',
          senderId: msg.senderId || null,
          avatar: msg.avatar || '👑',
          text: msg.text ? String(msg.text || '').slice(0, 200) : '🎤 [等候室实时语音]',
          voice: Boolean(msg.voice),
          phraseText: msg.phraseText ? String(msg.phraseText).slice(0, 200) : null,
          roleId: msg.roleId || null,
          roleName: msg.roleName || null,
          pitch: typeof msg.pitch === 'number' ? msg.pitch : 1.0,
          rate: typeof msg.rate === 'number' ? msg.rate : 1.0,
          isFemale: Boolean(msg.isFemale),
          audio: msg.audio || null,
          duration: Number(msg.duration) || 0,
          action: msg.action || null,
          targetPlayerId: msg.targetPlayerId || null,
          targetPlayerName: msg.targetPlayerName || null,
          giftAmount: Number(msg.giftAmount) || 0,
          timestamp: msg.timestamp || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          activeChallenges: activeChallenges.slice(0, 10),
        });
        return;
      }

      if (msg.type === 'scene_accept_challenge') {
        const found = activeChallenges.find(
          (c) => c.id === msg.challengeId || (c.senderName === msg.challengerName && c.sceneMode === msg.sceneMode && c.status === 'open')
        );
        if (found) {
          found.status = 'accepted';
          found.acceptedBy = { id: msg.acceptorId || 'guest', name: msg.acceptorName || '热血牌友' };

          broadcast({
            type: 'challenge_status_update',
            challengeId: found.id,
            status: 'accepted',
            acceptedBy: found.acceptedBy,
          });
        }

        if (msg.gameType && msg.sceneMode) {
          presenceTracker.updateClientGame((ws as any).socketId, msg.gameType, msg.sceneMode);
          if (msg.acceptorId) {
            presenceTracker.recordClient((ws as any).socketId, {
              gameType: msg.gameType,
              playerId: msg.acceptorId,
              playerName: msg.acceptorName,
              sceneMode: msg.sceneMode,
            });
          }
          broadcast({
            type: 'presence_counts',
            counts: presenceTracker.getRealGamePresence(),
          });
          broadcastTeahousePlayers();
        }

        // 全服大堂广播应战捷报
        broadcast({
          type: 'scene_chat_broadcast',
          gameType: msg.gameType,
          sceneMode: msg.sceneMode,
          sceneName: msg.sceneName,
          channel: 'hall',
          sender: '🤖 牌楼官播 BOT',
          senderId: 'BOT-SYSTEM',
          avatar: '🤖',
          text: `⚔️【应战捷报】牌友 [${msg.acceptorName || '热血牌友'}] 已成功响应 [${msg.challengerName || '牌友'}] 在【${msg.sceneName || '经典分场'}】的擂台战帖，已切入相同桌台！`,
          action: 'notice',
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          activeChallenges: activeChallenges.slice(0, 10),
        });
        return;
      }

      if (msg.type === 'room_create') {
        const id = `RM-${Math.floor(207 + Math.random() * 800)}`;
        const gType = msg.gameType || 'yansan';
        const newRoom = {
          id,
          title: msg.title || `${msg.playerName || '茗局雅客'}的牌局`,
          gameType: gType,
          status: 'playing',
          players: [{ id: `P-${Date.now()}`, name: msg.playerName || '茗局雅客', rating: 1900, seat: 0 }],
          spectators: 1,
          turnSeat: 0,
          moveCount: 0,
          modeLabel: '实时 WebSocket 牌桌',
          chat: [
            {
              id: `c-${Date.now()}`,
              sender: '系统司仪',
              text: `房间 ${id} 已建立，欢迎各路牌友入席！`,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            },
          ],
          boardState: createDefaultBoardState(id, gType),
        };
        rooms.set(id, newRoom);
        broadcast({ type: 'room_created', room: newRoom, rooms: Array.from(rooms.values()) });
        return;
      }

      if (msg.type === 'room_join') {
        const room = rooms.get(msg.roomId);
        if (room) {
          const playerName = msg.playerName || '牌友';
          const existingPlayer = room.players.find((p: any) => p.name === playerName);
          if (!existingPlayer && room.players.length < 4) {
            room.players.push({
              id: `P-${Date.now()}`,
              name: playerName,
              rating: msg.rating || 1900,
              seat: room.players.length,
            });
          } else {
            room.spectators += 1;
          }
          broadcast({ type: 'room_updated', room, rooms: Array.from(rooms.values()) });
        }
        return;
      }

      if (msg.type === 'room_leave') {
        const room = rooms.get(msg.roomId);
        if (room) {
          room.spectators = Math.max(0, room.spectators - 1);
          broadcast({ type: 'room_updated', room, rooms: Array.from(rooms.values()) });
        }
        return;
      }

      // Authoritative Reconnect Handler
      if (msg.type === 'room_reconnect') {
        const room = rooms.get(msg.roomId);
        if (room) {
          try {
            ws.send(
              JSON.stringify({
                type: 'reconnect_ack',
                room,
                boardState: room.boardState,
                serverTs: Date.now(),
              })
            );
          } catch {}
        }
        return;
      }

      // Authoritative Game Deal Request (客户端主动拉取权威牌组/牌墙)
      if (msg.type === 'request_game_deal') {
        const targetRoomId = msg.roomId;
        let r = (sceneWaitingRooms.get(targetRoomId) as any) || rooms.get(targetRoomId);
        if (r) {
          if (!r.deal) {
            r.deal = generateRoomDeal(r.gameType, r.sceneMode, r.maxPlayers);
          }
          ws.send(JSON.stringify({
            type: 'game_deal',
            roomId: targetRoomId,
            gameType: r.gameType,
            sceneMode: r.sceneMode,
            deal: r.deal,
          }));
        }
        return;
      }

      // Authoritative Room Restart (同桌再战全员准备就绪才洗牌开局)
      if (msg.type === 'room_restart') {
        const targetRoomId = msg.roomId;
        let r = (sceneWaitingRooms.get(targetRoomId) as any) || rooms.get(targetRoomId);
        if (r) {
          const pId = msg.playerId || (ws as any).scenePlayerId;
          const pl = r.players?.find((p: any) =>
            (p.id && pId && (p.id === pId || p.originalId === pId)) ||
            (typeof msg.seat === 'number' && p.seat === msg.seat) ||
            (p as any).socketId === (ws as any).socketId
          );
          if (pl) {
            pl.isReady = true;
          }
          const waitingRoom = sceneWaitingRooms.get(targetRoomId);
          if (waitingRoom && Array.isArray(waitingRoom.players)) {
            const wpl = waitingRoom.players.find((p: any) =>
              (p.id && pId && (p.id === pId || (p as any).originalId === pId)) ||
              (typeof msg.seat === 'number' && p.seat === msg.seat) ||
              p.socketId === (ws as any).socketId
            );
            if (wpl) {
              wpl.isReady = true;
            }
          }
          const authRoom = rooms.get(targetRoomId);
          if (authRoom && Array.isArray(authRoom.players)) {
            const apl = authRoom.players.find((p: any) =>
              (p.id && pId && (p.id === pId || (p as any).originalId === pId)) ||
              (typeof msg.seat === 'number' && p.seat === msg.seat) ||
              p.socketId === (ws as any).socketId
            );
            if (apl) {
              apl.isReady = true;
            }
          }
          broadcast({
            type: 'scene_room_update',
            roomId: r.id,
            gameType: r.gameType,
            sceneMode: r.sceneMode,
            players: (waitingRoom || r).players,
            maxPlayers: r.maxPlayers,
            status: r.status,
          });
          startRoomGameIfFull(waitingRoom || r);
        }
        return;
      }

      // Authoritative Move & Event Processing
      if (msg.type === 'game_move') {
        const targetRoomId = msg.roomId;
        const room = rooms.get(targetRoomId) || (sceneWaitingRooms.get(targetRoomId) as any);
        if (room) {
          room.moveCount = (room.moveCount || 0) + 1;
          const evt = msg.event || {};
          const p = { ...evt, ...(msg.payload || {}) };
          const seat = typeof msg.seat === 'number' ? msg.seat : (typeof evt.seat === 'number' ? evt.seat : (typeof p.seat === 'number' ? p.seat : 0));
          const action = p.action || evt.action || 'play';
          const combo = p.combo || evt.combo || null;

          // Update authoritative board state
          if (!room.boardState) {
            room.boardState = createDefaultBoardState(room.id, room.gameType);
          }
          const bs = room.boardState;

          bs.actionSeq = (bs.actionSeq || 0) + 1;
          bs.moveCount = room.moveCount;
          bs.updatedAt = Date.now();
          room.lastTurnTs = Date.now();

          if (p.multiplier) bs.multiplier = Number(p.multiplier);
          if (p.nextTurn !== undefined) {
            bs.turnSeat = Number(p.nextTurn);
            room.turnSeat = bs.turnSeat;
          }
          if (combo) {
            bs.lastCombo = combo;
            if (!bs.discardsHistory) bs.discardsHistory = [];
            bs.discardsHistory.push(combo);
            if (bs.discardsHistory.length > 100) {
              bs.discardsHistory = bs.discardsHistory.slice(-100);
            }
          }
          if (p.handsCount && Array.isArray(p.handsCount)) {
            bs.handsCount = p.handsCount;
          } else if (seat < bs.handsCount.length && p.cardsCount) {
            bs.handsCount[seat] = Math.max(0, bs.handsCount[seat] - Number(p.cardsCount));
          } else if (combo?.cards?.length && seat < bs.handsCount.length) {
            bs.handsCount[seat] = Math.max(0, bs.handsCount[seat] - combo.cards.length);
          }
          if (action === 'shisanshui_submit_hand') {
            if (!bs.shisanshuiSubmissions) {
              bs.shisanshuiSubmissions = {};
            }
            bs.shisanshuiSubmissions[seat] = {
              seat,
              tiers: p.tiers,
              rawTiers: p.rawTiers,
              isSpecial: p.isSpecial,
              submittedAt: Date.now(),
            };
            const submittedCount = Object.keys(bs.shisanshuiSubmissions).length;
            const targetCount = room.players?.length || (room.sceneMode?.includes('eight') ? 8 : 4);

            broadcast({
              type: 'game_event',
              roomId: room.id,
              seat,
              event: {
                action: 'shisanshui_submit_hand',
                seat,
                submittedCount,
                targetCount,
                rawTiers: p.rawTiers,
                tiers: p.tiers,
                isSpecial: p.isSpecial,
              },
              payload: {
                action: 'shisanshui_submit_hand',
                seat,
                submittedCount,
                targetCount,
                rawTiers: p.rawTiers,
                tiers: p.tiers,
                isSpecial: p.isSpecial,
              },
              boardState: bs,
            });

            if (submittedCount >= targetCount) {
              broadcast({
                type: 'game_event',
                roomId: room.id,
                event: {
                  action: 'shisanshui_all_submitted',
                  submissions: bs.shisanshuiSubmissions,
                },
                payload: {
                  action: 'shisanshui_all_submitted',
                  submissions: bs.shisanshuiSubmissions,
                },
                boardState: bs,
              });
            }
            return;
          }

          if (p.winner !== undefined && p.winner !== null) {
            bs.winnerSeat = Number(p.winner);
            bs.phase = 'ended';
            room.status = 'finished';
            delete (room as any).deal;

            const targetSceneRoom = sceneWaitingRooms.get(room.id);
            if (targetSceneRoom) {
              targetSceneRoom.status = 'finished';
              delete (targetSceneRoom as any).deal;
              targetSceneRoom.players.forEach((pl) => {
                (pl as any).isReady = false;
              });

              const disconnectedList = targetSceneRoom.players.filter((pl) => (pl as any).isDisconnected);
              if (disconnectedList.length > 0) {
                console.log(`🧹 [局末席位清理] 该局游戏已结算完成，自动移出 ${disconnectedList.length} 位未重连的托管玩家`);
                targetSceneRoom.players = targetSceneRoom.players.filter((pl) => !(pl as any).isDisconnected);
                targetSceneRoom.players.forEach((pl, idx) => {
                  pl.seat = idx;
                  (pl as any).isReady = false;
                });
                targetSceneRoom.status = 'waiting';
              }

              broadcast({
                type: 'scene_room_update',
                roomId: targetSceneRoom.id,
                gameType: targetSceneRoom.gameType,
                sceneMode: targetSceneRoom.sceneMode,
                players: targetSceneRoom.players,
                maxPlayers: targetSceneRoom.maxPlayers,
                status: targetSceneRoom.status,
              });
            }

            if (Array.isArray(room.players)) {
              room.players.forEach((pl: any) => {
                pl.isReady = false;
              });
            }
          }

          broadcast({
            type: 'game_event',
            roomId: room.id,
            seat,
            event: {
              action,
              seat,
              combo,
              nextTurn: p.nextTurn,
              winner: p.winner,
            },
            payload: {
              action,
              seat,
              combo,
              nextTurn: p.nextTurn,
              winner: p.winner,
              ...p,
            },
            moveCount: room.moveCount,
            boardState: bs,
          });
        }
        return;
      }

      if (msg.type === 'game_chat' || msg.type === 'room_voice') {
        const targetRoomId = msg.roomId || 'RM-202';
        const room = rooms.get(targetRoomId);
        if (msg.text || msg.audio) {
          const chatMsg = {
            id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sender: msg.sender || '牌友',
            senderId: msg.senderId || null,
            avatar: msg.avatar || '👤',
            text: msg.text ? String(msg.text).slice(0, 100) : (msg.audio ? '🎤 [牌桌实时语音]' : ''),
            prop: msg.prop || null,
            targetSeat: msg.targetSeat !== undefined ? msg.targetSeat : null,
            voice: Boolean(msg.voice),
            audio: msg.audio || null,
            duration: Number(msg.duration) || 0,
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          };
          if (room) {
            room.chat = [...room.chat.slice(-49), chatMsg];
          }
          broadcast({ type: 'chat_broadcast', roomId: targetRoomId, message: chatMsg });
        }
        return;
      }
    } catch {}
  });
});

// Periodic WebSocket zombie client heartbeat sweep (terminates stalled half-open TCP connections)
setInterval(() => {
  const now = Date.now();
  for (const client of wss.clients) {
    const wsAny = client as any;
    if (wsAny.lastHeartbeat && now - wsAny.lastHeartbeat > 60000) {
      client.terminate();
    } else {
      wsAny.isAlive = false;
      try {
        client.ping();
      } catch {}
    }
  }
}, 25000);

// Authoritative AFK Watchdog: auto-advance turn if player is disconnected/stalled > 20s in playing phase
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status === 'playing' && room.boardState && room.boardState.phase === 'playing') {
      // 1. 十三张/十三水：比水前超时保障 (45秒未全员开牌比水则自动保底交牌比水)
      if (room.gameType === 'shisanshui') {
        if (room.lastTurnTs && now - room.lastTurnTs > 45000) {
          room.lastTurnTs = now;
          const bs = room.boardState;
          if (!bs.shisanshuiSubmissions) bs.shisanshuiSubmissions = {};
          const totalSeats = room.sceneMode?.includes('eight') ? 8 : 4;
          for (let s = 0; s < totalSeats; s++) {
            if (!bs.shisanshuiSubmissions[s]) {
              bs.shisanshuiSubmissions[s] = {
                seat: s,
                autoSubmitted: true,
                submittedAt: now,
              };
            }
          }
          broadcast({
            type: 'game_event',
            roomId: room.id,
            event: {
              action: 'shisanshui_all_submitted',
              submissions: bs.shisanshuiSubmissions,
              timeout: true,
            },
            payload: {
              action: 'shisanshui_all_submitted',
              submissions: bs.shisanshuiSubmissions,
              timeout: true,
            },
            boardState: bs,
          });
        }
        continue;
      }

      // 2. 烟三及其他出牌类游戏超时保障
      if (room.lastTurnTs && now - room.lastTurnTs > 20000) {
        room.lastTurnTs = now;
        const currentSeat = room.turnSeat || 0;
        const totalSeats = room.boardState.handsCount?.length || 4;
        // 烟三规则：出牌严格逆时针旋转：(currentSeat - 1 + totalSeats) % totalSeats
        const nextSeat = room.gameType === 'yansan'
          ? (currentSeat - 1 + totalSeats) % totalSeats
          : (currentSeat + 1) % totalSeats;

        room.turnSeat = nextSeat;
        room.boardState.turnSeat = nextSeat;
        room.boardState.updatedAt = now;

        // Special rule guard for Yansan: first move MUST include Diamond 4 (♦4).
        const isYansanFirstMove = room.gameType === 'yansan' && (room.moveCount === 0 || !room.boardState.lastCombo);
        if (isYansanFirstMove) {
          room.moveCount += 1;
          room.boardState.moveCount = room.moveCount;
          room.boardState.actionSeq = (room.boardState.actionSeq || 0) + 1;
          const d4Combo = {
            type: 'single',
            rank: 4,
            suitVal: 1,
            cards: [{ id: 'd-4', rank: 4, suitVal: 1, label: '4', suit: '♦', isRed: true }],
            label: '单张 ♦4',
            primaryRank: 4,
            primarySuitVal: 1,
            seat: currentSeat,
          };
          room.boardState.lastCombo = d4Combo;
          if (room.boardState.handsCount && room.boardState.handsCount[currentSeat] > 0) {
            room.boardState.handsCount[currentSeat] = Math.max(0, room.boardState.handsCount[currentSeat] - 1);
          }
          broadcast({
            type: 'game_event',
            roomId: room.id,
            seat: currentSeat,
            event: {
              action: 'play',
              seat: currentSeat,
              autoPlay: true,
              combo: d4Combo,
              cardsCount: 1,
              nextTurn: nextSeat,
              reason: 'timeout_first_move_diamond4',
            },
            payload: {
              action: 'play',
              seat: currentSeat,
              autoPlay: true,
              combo: d4Combo,
              cardsCount: 1,
              nextTurn: nextSeat,
              reason: 'timeout_first_move_diamond4',
            },
            moveCount: room.moveCount,
            boardState: room.boardState,
          });
        } else {
          broadcast({
            type: 'game_event',
            roomId: room.id,
            seat: currentSeat,
            event: {
              action: 'pass',
              seat: currentSeat,
              autoPass: true,
              nextTurn: nextSeat,
              reason: 'timeout_pass',
            },
            payload: {
              action: 'pass',
              seat: currentSeat,
              autoPass: true,
              nextTurn: nextSeat,
              reason: 'timeout_pass',
            },
            moveCount: room.moveCount,
            boardState: room.boardState,
          });
        }
      }
    }
  }
}, 3000);

// Periodic room garbage collection: clean stale user-created rooms and empty scene waiting rooms older than 1 hour
setInterval(() => {
  const now = Date.now();
  const defaultRoomIds = new Set(['RM-202', 'RM-204', 'RM-205']);
  for (const [id, room] of rooms.entries()) {
    if (!defaultRoomIds.has(id) && room.createdAt && now - room.createdAt > 3600000 && (room.spectators <= 1 || (!room.players || room.players.length === 0))) {
      rooms.delete(id);
    }
  }
  for (const [id, sRoom] of sceneWaitingRooms.entries()) {
    if (sRoom.createdAt && now - sRoom.createdAt > 3600000 && (!sRoom.players || sRoom.players.length === 0)) {
      sceneWaitingRooms.delete(id);
    }
  }
}, 600000);

// Unified API Route Dispatcher
app.use(async (req, res, next) => {
  if (req.url && req.url.startsWith('/api/')) {
    try {
      const handled = await handleApiRoute(req, res, broadcast);
      if (handled) return;
    } catch (err) {
      console.error('[API Error]', err);
      return res.status(500).json({ error: String(err) });
    }
  }
  next();
});

// Explicit APK Direct Download Route (Ensures correct MIME, attachment filename & CORS headers)
app.get(['/chess-game-release.apk', '/app-latest.apk', '/*.apk'], (req, res, next) => {
  const reqPath = req.path;
  const fileName = path.basename(reqPath) || 'chess-game-release.apk';
  const candidates = [
    path.join(__dirname, 'dist', fileName),
    path.join(__dirname, 'dist', 'chess-game-release.apk'),
    path.join(__dirname, 'apk', fileName),
    path.join(__dirname, 'apk', 'chess-game-release.apk'),
    path.join(__dirname, 'public', fileName),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const st = fs.statSync(c);
        if (st.size >= 4200000) {
          res.writeHead(200, {
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Length': st.size,
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Disposition',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          });
          return fs.createReadStream(c).pipe(res);
        }
      } catch {}
    }
  }
  next();
});

// Static file serving or automated Vite dev middleware fallback
const distHtml = path.join(__dirname, 'dist', 'index.html');

if (fs.existsSync(distHtml)) {
  // Production mode: high-performance static caching headers for SVG assets
  app.use(
    express.static(path.join(__dirname, 'dist'), {
      maxAge: '1y',
      immutable: true,
    })
  );
  app.get('*', (_req, res) => {
    res.sendFile(distHtml);
  });
} else {
  // Guidance fallback when dist has not been cloned or built
  console.warn('⚠️ [Server] 未在项目根目录检测到 dist/index.html 生产静态资源。');
  console.warn('💡 [提示] 请确保已将包含 dist 文件夹的仓库完整推送并在 Termux 中 pull。');

  app.get('*', (_req, res) => {
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>国粹棋牌 · 提示</title>
        <style>
          body { background: #12100E; color: #F5EFE6; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; }
          .box { background: #1C1815; border: 1px solid #D97706; border-radius: 20px; padding: 28px; max-width: 520px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); }
          h2 { color: #FBBF24; margin-top: 0; }
          p { font-size: 14px; line-height: 1.6; color: #D6C7B2; }
          code { background: #26201B; padding: 4px 10px; border-radius: 6px; color: #34D399; font-family: monospace; font-size: 14px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2>⚠️ 尚未检测到前端 dist 静态包</h2>
          <p>若在手机 Termux 环境运行，推荐使用 <code>bash termux_install_ubuntu.sh</code> 在 Ubuntu 容器中执行 <code>npm run build</code>；或从 GitHub Releases 下载最新的 <code>dist.tar.gz</code> 解压即可畅玩！</p>
        </div>
      </body>
      </html>
    `);
  });
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌【端口冲突】端口 ${PORT} 已被后台旧服务占用！`);
    console.error('👉 解决办法：在 Termux 终端执行以下命令释放端口后再启动：');
    console.error('   pkill -9 -f "node|tsx|server"\n');
    process.exit(1);
  } else {
    console.error('[Server Error]', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  // 自动调度 Telegram Bot (根据 .env 的 URL 配置智能选择 Webhook 或轮询启动)
  initTelegramBotService(broadcast).catch((err) => {
    console.error('⚠️ [Telegram Bot Init Error]', err);
  });
});
