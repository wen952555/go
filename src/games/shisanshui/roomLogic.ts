/**
 * 水镜十三水 / 十三张 (Shisanshui) 独立房间规则、实时对局与预约场逻辑管理
 * 
 * 核心规约：
 * 1. 四人实时场 (four-realtime, shisanshui-10-20, shisanshui-20-40)：必须满 4 人且全员准备才开局。
 * 2. 八人实时场 (eight-realtime)：
 *    - 满足至少 5 人（5 ~ 8 人）即可开启游戏理牌阶段；
 *    - 开启后触发 90 秒倒计时自动提交开牌比水；
 *    - 倒计时进行中，未满 8 人时允许第 6、7、8 位新玩家中途加入；
 *    - 每次有新玩家加入，全场所有参与者（含已加入的玩家）的 90 秒理牌倒计时重新重置为 90 秒；
 *    - 刷新全场发牌切片，确保新入场玩家与原有玩家均在同一天梯对局中倒计时理牌。
 * 3. 预约/车厢场 (four-booking, eight-booking)：
 *    - 无强制满员要求，亦无 90 秒倒计时强制比水限制，保持自由理牌与车厢轮动对局。
 */

export const SHISANSHUI_EIGHT_REALTIME_MIN_PLAYERS = 5;
export const SHISANSHUI_EIGHT_REALTIME_MAX_PLAYERS = 8;
export const SHISANSHUI_EIGHT_ARRANGE_SECONDS = 90; // 8人实时场 90秒倒计时
export const SHISANSHUI_FOUR_ARRANGE_SECONDS = 45;  // 4人实时场 45秒倒计时

/**
 * 判断是否为 8人实时场 (eight-realtime)
 */
export function isEightRealtimeMode(sceneMode?: string): boolean {
  return sceneMode === 'eight-realtime';
}

/**
 * 判断是否为 4人实时场
 */
export function isFourRealtimeMode(sceneMode?: string): boolean {
  return (
    sceneMode === 'four-realtime' ||
    sceneMode === 'shisanshui-10-20' ||
    sceneMode === 'shisanshui-20-40'
  );
}

/**
 * 判断是否为 预约/车厢场 (four-booking, eight-booking)
 */
export function isBookingMode(sceneMode?: string): boolean {
  return sceneMode === 'four-booking' || sceneMode === 'eight-booking';
}

/**
 * 获取场景理牌倒计时时长（秒）
 * - 8人实时场：90 秒
 * - 4人实时场：45 秒
 * - 预约场：0 秒（无限制）
 */
export function getShisanshuiArrangeSeconds(sceneMode?: string): number {
  if (isEightRealtimeMode(sceneMode)) {
    return SHISANSHUI_EIGHT_ARRANGE_SECONDS;
  }
  if (isBookingMode(sceneMode)) {
    return 0; // 预约场不设倒计时
  }
  return SHISANSHUI_FOUR_ARRANGE_SECONDS; // 4人场默认 45 秒
}

/**
 * 判断房间是否满足开局或理牌启动条件
 */
export function checkShisanshuiRoomStartCondition(
  sceneMode: string,
  playersCount: number,
  allReady: boolean
): {
  canStart: boolean;
  minPlayers: number;
  maxPlayers: number;
  isEightRealtime: boolean;
  isBooking: boolean;
  arrangeSeconds: number;
} {
  if (isEightRealtimeMode(sceneMode)) {
    return {
      canStart: playersCount >= SHISANSHUI_EIGHT_REALTIME_MIN_PLAYERS,
      minPlayers: SHISANSHUI_EIGHT_REALTIME_MIN_PLAYERS,
      maxPlayers: SHISANSHUI_EIGHT_REALTIME_MAX_PLAYERS,
      isEightRealtime: true,
      isBooking: false,
      arrangeSeconds: SHISANSHUI_EIGHT_ARRANGE_SECONDS,
    };
  }

  if (isBookingMode(sceneMode)) {
    return {
      canStart: playersCount > 0,
      minPlayers: 1,
      maxPlayers: sceneMode === 'eight-booking' ? 8 : 4,
      isEightRealtime: false,
      isBooking: true,
      arrangeSeconds: 0,
    };
  }

  // 四人实时场：必须满 4 人且全员就绪
  return {
    canStart: playersCount >= 4 && allReady,
    minPlayers: 4,
    maxPlayers: 4,
    isEightRealtime: false,
    isBooking: false,
    arrangeSeconds: SHISANSHUI_FOUR_ARRANGE_SECONDS,
  };
}

/**
 * 当新玩家加入时，评估 8人实时场是否允许加入及是否重置 90 秒理牌倒计时
 */
export function evaluateEightRealtimeJoin(
  sceneMode: string,
  currentStatus: string,
  currentPlayerCount: number
): {
  allowJoin: boolean;
  shouldResetCountdown: boolean;
  notificationText?: string;
} {
  if (!isEightRealtimeMode(sceneMode)) {
    return { allowJoin: false, shouldResetCountdown: false };
  }

  // 8人实时场最高上限 8 人
  if (currentPlayerCount >= SHISANSHUI_EIGHT_REALTIME_MAX_PLAYERS) {
    return { allowJoin: false, shouldResetCountdown: false };
  }

  // 只要人数小于 8 人，即使处于 waiting / starting / arranging / playing 阶段，均允许加入
  const allowJoin = true;

  // 当加入后总人数达到 >= 5 人时，触发或重置 90 秒倒计时
  const newCount = currentPlayerCount + 1;
  const shouldResetCountdown = newCount >= SHISANSHUI_EIGHT_REALTIME_MIN_PLAYERS;
  const notificationText = shouldResetCountdown
    ? `📢 第 ${newCount} 位牌友加入，90秒理牌比水倒计时重新重置！`
    : `📢 牌友加入 (${newCount}/${SHISANSHUI_EIGHT_REALTIME_MIN_PLAYERS}人)，满5人开启90秒理牌！`;

  return {
    allowJoin,
    shouldResetCountdown,
    notificationText,
  };
}
