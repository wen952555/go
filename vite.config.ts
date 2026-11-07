import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { loadDatabase, saveDatabase } from './src/serverStorage.ts';
import { handleApiRoute } from './src/serverApi.ts';
import { initTelegramBotService } from './src/telegramBotService.ts';
import { presenceTracker } from './src/presenceTracker.ts';
import { generateRoomDeal } from './src/gameDeckService.ts';
import { createDefaultBoardState, getSceneRequiredCoins } from './src/gameLogic/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env from project root, parent directory (Termux root ~/.env), or HOME
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  process.env.HOME ? path.resolve(process.env.HOME, '.env') : '',
].filter(Boolean);

for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: true });
  }
}

const BOOKING_FILE = path.resolve(process.cwd(), 'data', 'booking_carriages.json');

export interface ServerBookingTable {
  tableIndex: number;
  tableName: string;
  isSubmitted: boolean;
  playerSeat: string;
  playerId?: string;
  playerName?: string;
  playerHand?: {
    front: any[];
    mid: any[];
    back: any[];
    frontLabel: string;
    midLabel: string;
    backLabel: string;
    specialHand?: any;
  };
  submittedAt?: number;
  status: 'waiting' | 'submitted';
  seatCards: Record<string, any[]>;
  tableDeckSeed: string;
}

export interface ServerBookingCarriage {
  carriageNumber: number;
  sceneMode: 'four-booking' | 'eight-booking';
  createdAt: number;
  selectedSeat: string | null;
  unplayedTableIndices: number[];
  currentActiveTableIndex: number | null;
  isCompleted: boolean;
  tables: ServerBookingTable[];
}

const BOOKING_SUITS = [
  { suit: '♠', isRed: false },
  { suit: '♥', isRed: true },
  { suit: '♣', isRed: false },
  { suit: '♦', isRed: true },
];

const BOOKING_RANKS = [
  { rank: 2, label: '2' }, { rank: 3, label: '3' }, { rank: 4, label: '4' },
  { rank: 5, label: '5' }, { rank: 6, label: '6' }, { rank: 7, label: '7' },
  { rank: 8, label: '8' }, { rank: 9, label: '9' }, { rank: 10, label: '10' },
  { rank: 11, label: 'J' }, { rank: 12, label: 'Q' }, { rank: 13, label: 'K' },
  { rank: 14, label: 'A' },
];

function generateServerShuffledDeck(deckCount: number, seedStr: string): any[] {
  const pool: any[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const r of BOOKING_RANKS) {
      for (const s of BOOKING_SUITS) {
        pool.push({
          id: `${r.label}-${s.suit}-${d}-${seedStr}`,
          rank: r.rank,
          suit: s.suit,
          label: r.label,
          isRed: s.isRed,
        });
      }
    }
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function loadBookingCarriagesFromDisk(): Record<string, ServerBookingCarriage> {
  try {
    if (fs.existsSync(BOOKING_FILE)) {
      const raw = fs.readFileSync(BOOKING_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.carriages === 'object') {
        return parsed.carriages;
      }
    }
  } catch (err) {
    console.warn('[Booking Data] Read disk error:', err);
  }
  return {};
}

function saveBookingCarriagesToDisk(carriages: Record<string, ServerBookingCarriage>): void {
  try {
    const dataDir = path.dirname(BOOKING_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const tempFile = `${BOOKING_FILE}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    fs.writeFileSync(tempFile, JSON.stringify({ carriages, updatedAt: Date.now() }, null, 2), 'utf-8');
    fs.renameSync(tempFile, BOOKING_FILE);
  } catch (err) {
    console.error('[Booking Data] Save disk error:', err);
  }
}

/**
 * 第一个玩家入座后，为车厢生成包含10张牌桌的预发牌数组（13张手牌分配）与状态
 */
function initServerCarriageTables(carriageNumber: number, sceneMode: 'four-booking' | 'eight-booking'): ServerBookingCarriage {
  const isEight = sceneMode === 'eight-booking';
  const seats = isEight
    ? ['东', '东南', '南', '西南', '西', '西北', '北', '东北']
    : ['东', '南', '西', '北'];
  const deckCount = isEight ? 2 : 1;

  const tables: ServerBookingTable[] = [];
  for (let i = 1; i <= 10; i++) {
    const seedStr = `car${carriageNumber}-t${i}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const deck = generateServerShuffledDeck(deckCount, seedStr);
    const seatCards: Record<string, any[]> = {};
    seats.forEach((seat, idx) => {
      seatCards[seat] = deck.slice(idx * 13, (idx + 1) * 13);
    });

    tables.push({
      tableIndex: i,
      tableName: `第 ${i} 桌`,
      isSubmitted: false,
      playerSeat: '',
      status: 'waiting',
      seatCards,
      tableDeckSeed: seedStr,
    });
  }

  return {
    carriageNumber,
    sceneMode,
    createdAt: Date.now(),
    selectedSeat: null,
    unplayedTableIndices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    currentActiveTableIndex: null,
    isCompleted: false,
    tables,
  };
}

function getOrInitServerCarriage(sceneMode: 'four-booking' | 'eight-booking', carriageNumber: number = 1): ServerBookingCarriage {
  const carriages = loadBookingCarriagesFromDisk();
  const key = `${sceneMode}_car_${carriageNumber}`;

  if (!carriages[key] || !Array.isArray(carriages[key].tables) || carriages[key].tables.length === 0) {
    console.log(`🚂 [预约场预发牌] 首位玩家入座/加载，生成车厢 ${key} 内 10 张牌桌的 13 张扑克预发牌数组并序列化存储...`);
    const newCarriage = initServerCarriageTables(carriageNumber, sceneMode);
    carriages[key] = newCarriage;
    saveBookingCarriagesToDisk(carriages);
  }

  return carriages[key];
}

function chessWebSocketPlugin(): Plugin {
  return {
    name: 'chess-websocket-plugin',
    configureServer(server) {
      if (!server.httpServer) return;

      const wss = new WebSocketServer({ server: server.httpServer, path: '/ws' });

      wss.on('error', (err) => {
        console.warn('[Vite WS Server Warning]', err);
      });

      // Initial rooms with authoritative board state
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
            chat: [{ id: 'c2', sender: '快枪手张三', text: '方块四首出直接开顺子！', timestamp: '10:04' }],
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

      const sceneWaitingRooms = new Map<string, any>();
      const activeChallenges: any[] = [];

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
          // Client disconnected or dropped frame, silently catch
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
            // 局内断线快照保护：若对局已开局(starting或playing)，保留席位45秒宽限期，避免手机切后台或网络闪断被踢
            if (room.status === 'starting' || room.status === 'playing') {
              const pl = room.players.find((p: any) => p.id === pId);
              if (pl) {
                pl.isDisconnected = true;
                setTimeout(() => {
                  if (sceneWaitingRooms.has(sRoomId)) {
                    const currentRoom = sceneWaitingRooms.get(sRoomId)!;
                    const targetPlayer = currentRoom.players.find((p: any) => p.id === pId);
                    if (targetPlayer && targetPlayer.isDisconnected) {
                      currentRoom.players = currentRoom.players.filter((p: any) => p.id !== pId);
                      if (currentRoom.players.length === 0) {
                        sceneWaitingRooms.delete(sRoomId);
                      } else {
                        broadcast({
                          type: 'scene_room_update',
                          roomId: currentRoom.id,
                          gameType: currentRoom.gameType,
                          sceneMode: currentRoom.sceneMode,
                          players: currentRoom.players,
                          maxPlayers: currentRoom.maxPlayers,
                          status: currentRoom.status,
                        });
                      }
                    }
                  }
                }, 45000);
              }
            } else {
              // 未开局的普通等候室：直接移出并重排席位
              room.players = room.players.filter((pl: any) => pl.id !== pId);
              if (room.players.length === 0) {
                sceneWaitingRooms.delete(sRoomId);
              } else {
                room.players.forEach((pl: any, idx: number) => {
                  pl.seat = idx;
                });
                room.status = 'waiting';
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
          // 若断开连接的玩家有未被应战的战帖，自动清理移出，避免造成残留刷屏
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
          broadcast({
            type: 'presence_counts',
            counts: presenceTracker.getRealGamePresence(),
          });
        });

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'ping') {
              (ws as any).isAlive = true;
              (ws as any).lastHeartbeat = Date.now();
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
            // 十三张预约场火车专列服务器预发牌与状态序列化存储
            // ==========================================
            if (msg.type === 'booking_get_carriage') {
              const sceneMode = msg.sceneMode === 'eight-booking' ? 'eight-booking' : 'four-booking';
              const carriageNum = Number(msg.carriageNumber) || 1;
              const carriage = getOrInitServerCarriage(sceneMode, carriageNum);
              ws.send(
                JSON.stringify({
                  type: 'booking_carriage_state',
                  carriage,
                  serverTs: Date.now(),
                })
              );
              return;
            }

            if (msg.type === 'booking_select_seat') {
              const sceneMode = msg.sceneMode === 'eight-booking' ? 'eight-booking' : 'four-booking';
              const carriageNum = Number(msg.carriageNumber) || 1;
              const carriages = loadBookingCarriagesFromDisk();
              const key = `${sceneMode}_car_${carriageNum}`;
              let carriage = carriages[key] || initServerCarriageTables(carriageNum, sceneMode);

              carriage.selectedSeat = msg.seat || '东';
              if (carriage.unplayedTableIndices.length > 0 && !carriage.currentActiveTableIndex) {
                const randIdx = Math.floor(Math.random() * carriage.unplayedTableIndices.length);
                carriage.currentActiveTableIndex = carriage.unplayedTableIndices[randIdx];
              }
              carriages[key] = carriage;
              saveBookingCarriagesToDisk(carriages);

              ws.send(
                JSON.stringify({
                  type: 'booking_seat_selected',
                  carriage,
                  activeTableIndex: carriage.currentActiveTableIndex,
                  serverTs: Date.now(),
                })
              );
              return;
            }

            if (msg.type === 'booking_submit_hand' || msg.type === 'booking_submit') {
              const sceneMode = msg.sceneMode === 'eight-booking' ? 'eight-booking' : 'four-booking';
              const carriageNum = Number(msg.carriageNumber) || 1;
              const carriages = loadBookingCarriagesFromDisk();
              const key = `${sceneMode}_car_${carriageNum}`;
              const carriage = carriages[key] || initServerCarriageTables(carriageNum, sceneMode);

              const tIdx = Number(msg.tableIndex) || carriage.currentActiveTableIndex || 1;
              const table = carriage.tables.find((t) => t.tableIndex === tIdx);

              if (table) {
                table.isSubmitted = true;
                table.playerSeat = msg.playerSeat || carriage.selectedSeat || '东';
                table.playerId = msg.playerId;
                table.playerName = msg.playerName;
                table.playerHand = msg.playerHand;
                table.submittedAt = Date.now();
                table.status = 'submitted';

                carriage.unplayedTableIndices = carriage.unplayedTableIndices.filter((idx) => idx !== tIdx);
                if (carriage.unplayedTableIndices.length === 0) {
                  carriage.isCompleted = true;
                }
                carriage.currentActiveTableIndex = null;

                carriages[key] = carriage;
                saveBookingCarriagesToDisk(carriages);

                ws.send(
                  JSON.stringify({
                    type: 'booking_submit_ack',
                    success: true,
                    carriage,
                    submittedTable: table,
                    remainingCount: carriage.unplayedTableIndices.length,
                    isCarriageCompleted: carriage.isCompleted,
                    serverTs: Date.now(),
                  })
                );

                broadcast({
                  type: 'booking_table_updated',
                  sceneMode,
                  carriageNumber: carriageNum,
                  tableIndex: tIdx,
                  table,
                });
              }
              return;
            }

            // ==========================================
            // 局内断线快照恢复 (Reconnection State Hydration)
            // ==========================================
            if (msg.type === 'scene_reconnect') {
              const pId = msg.playerId;
              const targetRoomId = msg.roomId;
              let targetRoom: any;
              if (targetRoomId && sceneWaitingRooms.has(targetRoomId)) {
                targetRoom = sceneWaitingRooms.get(targetRoomId);
              } else if (pId) {
                for (const r of sceneWaitingRooms.values()) {
                  if (r.players.some((pl: any) => pl.id === pId)) {
                    targetRoom = r;
                    break;
                  }
                }
              }
              if (targetRoom) {
                const pl = targetRoom.players.find((p: any) => p.id === pId);
                if (pl) {
                  delete pl.isDisconnected;
                  (ws as any).sceneRoomId = targetRoom.id;
                  (ws as any).scenePlayerId = pl.id;
                  const authRoom = rooms.get(targetRoom.id);
                  ws.send(
                    JSON.stringify({
                      type: 'scene_reconnect_ack',
                      room: targetRoom,
                      boardState: authRoom ? authRoom.boardState : null,
                      players: targetRoom.players,
                      deal: targetRoom.deal || (authRoom ? authRoom.deal : null),
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
                const room = sceneWaitingRooms.get(targetRoomId);
                const pl = room.players.find((p: any) =>
                  (p.id && pId && (p.id === pId || p.originalId === pId)) ||
                  (typeof msg.seat === 'number' && p.seat === msg.seat) ||
                  p.socketId === (ws as any).socketId
                );
                if (pl) {
                  pl.isReady = Boolean(msg.isReady ?? true);
                }
                const authRoom = rooms.get(targetRoomId);
                if (authRoom && Array.isArray(authRoom.players)) {
                  const apl = authRoom.players.find((p: any) =>
                    (p.id && pId && (p.id === pId || p.originalId === pId)) ||
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
                const room = sceneWaitingRooms.get(roomId);
                startRoomGameIfFull(room);
              }
              return;
            }

            function startRoomGameIfFull(room: any) {
              if (!room) return false;

              // 1. 若玩家人数不足 maxPlayers，强制保持 waiting 状态，严禁被错误锁定为 playing/starting
              if (!Array.isArray(room.players) || room.players.length < room.maxPlayers) {
                if (room.status !== 'waiting') {
                  room.status = 'waiting';
                  delete room.deal;
                }
                return false;
              }

              // 2. 防重复开局保护：若房间已处于 starting 或 playing 且已有有效发牌切片，立刻锁定并返回
              if ((room.status === 'starting' || room.status === 'playing') && room.deal && room.deal.seatCards) {
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
                delete pl.isDisconnected;
                delete pl.isAutoManaged;
                if (!pl.id) pl.id = `P-usr-${idx}-${Date.now().toString(36)}`;
                if (!pl.name) pl.name = `茶客 #${idx + 1}`;
              });
              room.players = validPlayers;

              // 6. 强制锁定状态为 starting
              room.status = 'starting';

              // 5. 强制产生全新发牌切片（零残留）
              delete room.deal;
              const freshDeal = generateRoomDeal(room.gameType, room.sceneMode, room.maxPlayers);
              room.deal = freshDeal;

              const defaultBoard = createDefaultBoardState(room.id, room.gameType);

              if (!rooms.has(room.id)) {
                rooms.set(room.id, {
                  id: room.id,
                  title: `${room.sceneName} · 纯真人对决`,
                  gameType: room.gameType,
                  status: 'starting',
                  players: room.players.map((pl: any, idx: number) => ({ ...pl, seat: idx, rating: pl.rating || 1900 })),
                  spectators: 0,
                  turnSeat: freshDeal?.starterSeat ?? 0,
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
                  existingRoom.turnSeat = freshDeal?.starterSeat ?? 0;
                  existingRoom.lastTurnTs = Date.now();
                  existingRoom.boardState = defaultBoard;
                  existingRoom.players = room.players.map((pl: any, idx: number) => ({ ...pl, seat: idx, rating: pl.rating || 1900 }));
                }
              }

              console.log(`🚀 [满员自动发牌] 房间 ${room.id} (${room.gameType}-${room.sceneMode}) ${room.players.length}/${room.maxPlayers} 玩家席位校验完毕，广播 scene_room_full 锁定 UI！`);

              // 6. 广播满员进桌事件 (status: starting)，通知所有客户端 UI 平滑切换至竞技场并锁定 UI
              broadcast({
                type: 'scene_room_full',
                roomId: room.id,
                gameType: room.gameType,
                sceneMode: room.sceneMode,
                players: room.players,
                maxPlayers: room.maxPlayers,
                deal: freshDeal,
                turnSeat: freshDeal?.starterSeat ?? 0,
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
                    turnSeat: freshDeal?.starterSeat ?? 0,
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
              const p = msg.player || {
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
                p.originalId = rawId || 'P-me';
              }
              delete p.isSimulated;
              delete p.isAi;

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
                  (pl: any) => (pl.id && p.id && pl.id === p.id) || pl.socketId === currentSocketId
                );
                if (isPlayerInOther) {
                  if (otherRoom.gameType !== gType || otherRoom.sceneMode !== sMode) {
                    otherRoom.players = otherRoom.players.filter(
                      (pl: any) => pl.id !== p.id && pl.socketId !== currentSocketId
                    );
                    if (otherRoom.players.length === 0) {
                      sceneWaitingRooms.delete(otherId);
                    } else {
                      otherRoom.players.forEach((pl: any, idx: number) => { pl.seat = idx; });
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
              let room: any;
              for (const r of sceneWaitingRooms.values()) {
                if (r.gameType === gType && r.sceneMode === sMode) {
                  const hasSameSocket = r.players.some((pl: any) => pl.socketId === currentSocketId);
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
                    const matchedPlayer = r.players.find((pl: any) => pl.id === p.id);
                    if (matchedPlayer) {
                      let oldSocketAlive = false;
                      for (const client of wss.clients) {
                        if ((client as any).socketId === matchedPlayer.socketId && client.readyState === WebSocket.OPEN) {
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

              // 3. 若未在上述房间，寻找仍有空位且正在排队的房间（必须是 status === 'waiting' 且 players.length < maxPlayers）
              // 凡是已经满员 (>= maxPlayers) 或已经处于 playing/starting 游戏中的房间，严禁任何新玩家进入！
              if (!room) {
                for (const r of sceneWaitingRooms.values()) {
                  if (r.gameType === gType && r.sceneMode === sMode && r.status === 'waiting' && r.players.length < r.maxPlayers) {
                    room = r;
                    break;
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
              let existingIdx = room.players.findIndex((pl: any) => pl.socketId === currentSocketId);
              if (existingIdx === -1 && p.id) {
                const sameIdPlayer = room.players.find((pl: any) => pl.id === p.id);
                if (sameIdPlayer) {
                  let oldSocketAlive = false;
                  for (const client of wss.clients) {
                    if ((client as any).socketId === sameIdPlayer.socketId && client.readyState === WebSocket.OPEN) {
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
              // 必须为该玩家开辟全新房间等待其他玩家加入！
              if (existingIdx === -1 && (room.players.length >= room.maxPlayers || room.status === 'playing' || room.status === 'starting')) {
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
                room.players[existingIdx] = { ...room.players[existingIdx], ...p, socketId: currentSocketId, isReady: true };
              } else if (room.players.length < room.maxPlayers) {
                p.seat = room.players.length;
                p.socketId = currentSocketId;
                p.isReady = true;
                room.players.push(p);
              } else {
                console.warn(`⚠️ [安全防爆干预] 房间 ${room.id} 无法容纳第 ${room.players.length + 1} 位玩家，严禁注入满员房间！`);
              }

              (ws as any).sceneRoomId = room.id;
              (ws as any).scenePlayerId = p.id;

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
                  deal: room.deal,
                }));
              } catch {}

              if (!startRoomGameIfFull(room)) {
                room.status = 'waiting';
                delete room.deal;
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
              return;
            }

            if (msg.type === 'scene_leave') {
              for (const [id, room] of sceneWaitingRooms.entries()) {
                if ((msg.roomId && id === msg.roomId) || (room.gameType === msg.gameType && room.sceneMode === msg.sceneMode)) {
                  room.players = room.players.filter((pl: any) => pl.id !== msg.playerId && pl.name !== msg.playerName);
                  delete room.deal;
                  if (room.players.length === 0) {
                    sceneWaitingRooms.delete(id);
                    rooms.delete(id);
                  } else {
                    room.players.forEach((pl: any, idx: number) => {
                      pl.seat = idx;
                      pl.isReady = false;
                    });
                    room.status = 'waiting';
                    const authRoom = rooms.get(id);
                    if (authRoom) {
                      authRoom.players = room.players.map((pl: any, idx: number) => ({ ...pl, seat: idx }));
                      authRoom.status = 'waiting';
                      delete authRoom.deal;
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
                  r.players = r.players.filter((pl: any) => pl.id !== msg.playerId && pl.name !== msg.playerName);
                  if (r.players.length === 0) {
                    rooms.delete(msg.roomId);
                  } else {
                    r.status = 'waiting';
                    delete r.deal;
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
                  (c: any) => (c.senderId === senderId || c.senderName === senderName) &&
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
                    oldCh.acceptedBy = undefined;

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
                    const rmIdx = activeChallenges.findIndex((c: any) => c.id === oldCh.id);
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

                const newCh = {
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
                channel: targetChannel,
                sender: msg.sender || '牌友',
                senderId: msg.senderId || null,
                avatar: msg.avatar || '👑',
                text: msg.text ? String(msg.text || '').slice(0, 200) : '🎤 [大堂语音]',
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
                (c: any) => c.id === msg.challengeId || (c.senderName === msg.challengerName && c.sceneMode === msg.sceneMode && c.status === 'open')
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

            // Authoritative Reconnect with full boardState
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
              let r = sceneWaitingRooms.get(targetRoomId) || rooms.get(targetRoomId);
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
              let r = sceneWaitingRooms.get(targetRoomId) || rooms.get(targetRoomId);
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
                    (p.id && pId && (p.id === pId || p.originalId === pId)) ||
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
                    (p.id && pId && (p.id === pId || p.originalId === pId)) ||
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

            // Authoritative Game Move Handling
            if (msg.type === 'game_move') {
              const targetRoomId = msg.roomId;
              const room = rooms.get(targetRoomId) || sceneWaitingRooms.get(targetRoomId);
              if (room) {
                room.moveCount = (room.moveCount || 0) + 1;
                const evt = msg.event || {};
                const p = { ...evt, ...(msg.payload || {}) };
                const seat = typeof msg.seat === 'number' ? msg.seat : (typeof evt.seat === 'number' ? evt.seat : (typeof p.seat === 'number' ? p.seat : 0));
                const action = p.action || evt.action || 'play';
                const combo = p.combo || evt.combo || null;

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
                  delete room.deal;

                  const targetSceneRoom = sceneWaitingRooms.get(room.id);
                  if (targetSceneRoom) {
                    targetSceneRoom.status = 'finished';
                    delete targetSceneRoom.deal;
                    targetSceneRoom.players.forEach((pl: any) => {
                      pl.isReady = false;
                    });

                    const disconnectedList = targetSceneRoom.players.filter((pl: any) => pl.isDisconnected);
                    if (disconnectedList.length > 0) {
                      console.log(`🧹 [局末席位清理] 该局游戏已结算完成，自动移出 ${disconnectedList.length} 位未重连的托管玩家`);
                      targetSceneRoom.players = targetSceneRoom.players.filter((pl: any) => !pl.isDisconnected);
                      targetSceneRoom.players.forEach((pl: any, idx: number) => {
                        pl.seat = idx;
                        pl.isReady = false;
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

            if (msg.type === 'game_chat') {
              const room = rooms.get(msg.roomId);
              if (room && msg.text) {
                const chatMsg = {
                  id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  sender: msg.sender || '牌友',
                  avatar: msg.avatar || '👤',
                  text: String(msg.text).slice(0, 100),
                  prop: msg.prop || null,
                  targetSeat: msg.targetSeat !== undefined ? msg.targetSeat : null,
                  voice: Boolean(msg.voice),
                  timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
                };
                room.chat = [...room.chat.slice(-49), chatMsg];
                broadcast({ type: 'chat_broadcast', roomId: room.id, message: chatMsg });
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
          if (wsAny.isAlive === false || (wsAny.lastHeartbeat && now - wsAny.lastHeartbeat > 45000)) {
            client.terminate();
          } else {
            wsAny.isAlive = false;
            try {
              client.ping();
            } catch {}
          }
        }
      }, 30000);

      // Authoritative AFK Watchdog
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

      // REST API middlewares
      server.middlewares.use(async (req, res, next) => {
        // Universal CORS headers for Android Capacitor Native APK (https://localhost / capacitor://localhost) & Web Clients
        const origin = (req.headers && req.headers.origin) ? req.headers.origin : '*';
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Range, Accept, Origin, x-telegram-bot-api-secret-token');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '86400');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.url && (req.url.startsWith('/chess-game-release.apk') || req.url.startsWith('/app-latest.apk'))) {
          const fileName = 'chess-game-release.apk';
          const candidates = [
            path.join(__dirname, 'dist', fileName),
            path.join(__dirname, 'apk', fileName),
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
                  fs.createReadStream(c).pipe(res);
                  return;
                }
              } catch {}
            }
          }
        }

        if (req.url && req.url.startsWith('/api/booking/')) {
          try {
            const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const pathname = urlObj.pathname;

            if (pathname === '/api/booking/carriage' && req.method === 'GET') {
              const sceneMode = (urlObj.searchParams.get('sceneMode') === 'eight-booking') ? 'eight-booking' : 'four-booking';
              const carriageNumber = parseInt(urlObj.searchParams.get('carriageNumber') || '1', 10);
              const carriage = getOrInitServerCarriage(sceneMode, carriageNumber);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, carriage }));
              return;
            }

            if (pathname === '/api/booking/submit' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  const payload = JSON.parse(body || '{}');
                  const sceneMode = payload.sceneMode === 'eight-booking' ? 'eight-booking' : 'four-booking';
                  const carriageNum = Number(payload.carriageNumber) || 1;
                  const carriages = loadBookingCarriagesFromDisk();
                  const key = `${sceneMode}_car_${carriageNum}`;
                  const carriage = carriages[key] || initServerCarriageTables(carriageNum, sceneMode);

                  const tIdx = Number(payload.tableIndex) || 1;
                  const table = carriage.tables.find((t) => t.tableIndex === tIdx);
                  if (table) {
                    table.isSubmitted = true;
                    table.playerSeat = payload.playerSeat || carriage.selectedSeat || '东';
                    table.playerId = payload.playerId;
                    table.playerName = payload.playerName;
                    table.playerHand = payload.playerHand;
                    table.submittedAt = Date.now();
                    table.status = 'submitted';

                    carriage.unplayedTableIndices = carriage.unplayedTableIndices.filter((idx) => idx !== tIdx);
                    if (carriage.unplayedTableIndices.length === 0) {
                      carriage.isCompleted = true;
                    }
                    carriage.currentActiveTableIndex = null;

                    carriages[key] = carriage;
                    saveBookingCarriagesToDisk(carriages);

                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ success: true, carriage, submittedTable: table }));
                    return;
                  }
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: 'table_not_found' }));
                } catch (err) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: String(err) }));
                }
              });
              return;
            }
          } catch (e) {
            console.error('[Booking REST Error]', e);
          }
        }

        if (req.url && req.url.startsWith('/api/')) {
          try {
            const handled = await handleApiRoute(req, res, broadcast);
            if (handled) return;
          } catch (err) {
            console.error('[Vite API Error]', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: String(err) }));
            return;
          }
        }
        next();
      });

      // Auto-schedule Telegram Bot Service in Vite development server
      if (server.httpServer.listening) {
        initTelegramBotService(broadcast).catch((err) => {
          console.error('⚠️ [Vite Telegram Bot Init Error]', err);
        });
      } else {
        server.httpServer.once('listening', () => {
          initTelegramBotService(broadcast).catch((err) => {
            console.error('⚠️ [Vite Telegram Bot Init Error]', err);
          });
        });
      }
    },
  };
}

function getResolvedEnvUrl(): string {
  // 1. 最高优先级：专门用于随时更换隧道和域名的 server_url.txt 配置文件
  const serverFilePath = path.resolve(__dirname, 'server_url.txt');
  if (fs.existsSync(serverFilePath)) {
    try {
      const content = fs.readFileSync(serverFilePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
          return trimmed.replace(/\/+$/, '');
        }
      }
    } catch {}
  }

  // 2. 备用读取当前正在运行的环境变量 SERVER_URL / URL / APP_URL / WEBHOOK_URL
  const envUrl = (process.env.SERVER_URL || process.env.URL || process.env.APP_URL || process.env.WEBHOOK_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && (envUrl.startsWith('http://') || envUrl.startsWith('https://'))) {
    return envUrl;
  }

  return 'https://m.my66.cc.cd';
}


function appConfigPlugin(): Plugin {
  return {
    name: 'app-config-sync-plugin',
    buildStart() {
      const url = getResolvedEnvUrl();
      const cfg = {
        serverUrl: url,
        buildTime: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        description: 'Auto-generated from .env URL for Android APK and Web client',
      };
      const publicDir = path.resolve(__dirname, 'public');
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
      fs.writeFileSync(path.join(publicDir, 'app-config.json'), JSON.stringify(cfg, null, 2), 'utf-8');
    },
    transformIndexHtml(html) {
      const url = getResolvedEnvUrl();
      return html.replace(
        '</head>',
        `  <script>window.__APP_ENV_URL__ = ${JSON.stringify(url)};</script>\n  </head>`
      );
    },
  };
}

export default defineConfig(() => {
  const resolvedUrl = getResolvedEnvUrl();
  return {
    define: {
      __APP_ENV_URL__: JSON.stringify(resolvedUrl),
    },
    plugins: [vue(), tailwindcss(), chessWebSocketPlugin(), appConfigPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      allowedHosts: true,
    },
  };
});
