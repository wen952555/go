<template>
  <div
    ref="containerRef"
    class="w-full h-full select-none absolute inset-0 overflow-hidden flex items-center justify-center"
    :style="{
      backgroundColor: props.tableTheme?.feltColor || '#E8DCC0',
      background: `radial-gradient(ellipse at 50% 45%, ${props.tableTheme?.highlightColor || '#FAF4E8'} 0%, ${props.tableTheme?.feltColor || '#E8DCC0'} 60%, ${props.tableTheme?.edgeColor || '#D2C4A6'} 100%)`
    }"
  >
    <!-- Fullscreen Card Table Surface with In-Table Action Overlay -->
    <div class="w-full h-full absolute inset-0 overflow-hidden flex items-center justify-center">
      <canvas
        ref="canvasRef"
        @click="onCanvasClick"
        @pointerdown="onCanvasClick"
        class="w-full h-full absolute inset-0 block cursor-pointer"
      ></canvas>

      <!-- Realistic 3D Mahjong Dice Cup Overlay (打色子定庄动效) -->
      <div
        v-if="dealingPhase === 'rolling_dice' && !hasWon && !isDrawStalemate"
        class="absolute inset-0 z-30 flex flex-col items-center justify-center p-3 select-none pointer-events-auto bg-black/65 backdrop-blur-xs"
      >
        <MahjongDiceCup
          :d1="dealerDice?.d1 || 1"
          :d2="dealerDice?.d2 || 1"
          :dealer-seat="dealerSeat"
          :is-dealer-continuing="isDealerContinuing"
          :title="isDealerContinuing ? `【${SEAT_NAMES[dealerSeat]}】连庄掷骰 · 确定起牌开门` : '打色子定庄 · 开门取牌'"
          :room-players="props.roomPlayers"
          @roll-finished="startDealingTilesAnimation"
          @skip="skipDealingAnimation"
        />
      </div>

      <!-- Dealing & Sorting Stage Overlay (抓牌理牌动效) -->
      <div
        v-else-if="dealingPhase !== 'playing' && !hasWon && !isDrawStalemate"
        class="absolute inset-0 pointer-events-none z-25 flex flex-col items-center justify-center select-none backdrop-blur-xs bg-black/55"
      >
        <div
          class="flex flex-col items-center justify-center p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#1C120C]/95 border-2 border-amber-400/80 backdrop-blur-md shadow-[0_16px_40px_rgba(0,0,0,0.9),0_0_30px_rgba(245,158,11,0.3)] pointer-events-auto transition-all transform scale-100 max-w-sm sm:max-w-md w-full mx-4"
        >
          <!-- Top Header Tag & Skip Button -->
          <div class="w-full flex items-center justify-between pb-2 mb-2 border-b border-amber-500/20 text-xs">
            <span class="text-amber-300 font-serif-title font-bold flex items-center gap-1.5">
              <span class="text-base animate-pulse">🀄</span>
              <span v-if="dealingPhase === 'dealing_tiles'">四道抓牌 · 牌背朝上发牌</span>
              <span v-else>整牌理牌 · 翻面亮牌</span>
            </span>
            <button
              type="button"
              @click="skipDealingAnimation"
              class="px-2.5 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/40 text-[11px] font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1 shadow-sm"
              title="跳过发牌动画，直接进入对局"
            >
              <span>跳过</span>
              <span>⏩</span>
            </button>
          </div>

          <div class="text-center w-full py-1">
            <div class="text-sm sm:text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 font-serif-title drop-shadow mb-1">
              🎯 【{{ SEAT_NAMES[dealerSeat] }}】坐庄起手率先出牌
            </div>
            <div class="text-[11px] text-[#D4C3B3] font-mono">
              {{ dealingPhase === 'dealing_tiles' ? '四方茶客依序抓牌中...' : '整牌排理完毕，翻面开局！' }}
            </div>

            <!-- Dealing 4-Wave Progress Indicator -->
            <div class="mt-3 pt-2.5 border-t border-amber-500/20 flex items-center justify-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] font-mono">
              <span
                class="px-2 py-0.5 rounded-lg border transition-all"
                :class="myHandDealtCount >= 4 ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/60 font-bold' : 'bg-white/5 text-white/35 border-white/10'"
              >1巡4张</span>
              <span class="text-white/30">→</span>
              <span
                class="px-2 py-0.5 rounded-lg border transition-all"
                :class="myHandDealtCount >= 8 ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/60 font-bold' : 'bg-white/5 text-white/35 border-white/10'"
              >2巡8张</span>
              <span class="text-white/30">→</span>
              <span
                class="px-2 py-0.5 rounded-lg border transition-all"
                :class="myHandDealtCount >= 12 ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/60 font-bold' : 'bg-white/5 text-white/35 border-white/10'"
              >3巡12张</span>
              <span class="text-white/30">→</span>
              <span
                class="px-2 py-0.5 rounded-lg border transition-all"
                :class="myHandDealtCount >= 13 ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/60 font-bold' : 'bg-white/5 text-white/35 border-white/10'"
              >4巡13张</span>
              <span class="text-white/30">→</span>
              <span
                class="px-2 py-0.5 rounded-lg border transition-all"
                :class="(dealerSeat === 0 ? myHandDealtCount >= 14 : oppHandsDealtCount[dealerSeat - 1] >= 14) ? 'bg-amber-500/35 text-amber-300 border-amber-500/60 font-black' : 'bg-white/5 text-white/35 border-white/10'"
              >跳牌14张</span>
            </div>
          </div>
        </div>
      </div>

      <!-- In-Table Integrated Action Buttons (Centered under player's hand) -->
      <div
        v-if="!hasWon && dealingPhase === 'playing' && (canPeng || canGang || canHu || myHand.length % 3 === 1 || selectedIndex !== null || isClaiming)"
        class="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 sm:gap-2.5 pointer-events-auto justify-center flex-wrap"
      >
        <!-- Draw Tile Button -->
        <button
          v-if="myHand.length % 3 === 1 && wallCount > 0"
          key="draw-btn"
          type="button"
          @click="handleDraw"
          class="px-3.5 sm:px-5 py-1.5 text-xs sm:text-sm font-bold rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white shadow-xl hover:scale-105 active:scale-95 transition-all ring-1 ring-amber-400 cursor-pointer"
        >
          摸牌 🀄
        </button>

        <!-- Peng (Allowed) with tile name -->
        <button
          v-if="canPeng"
          key="peng-btn"
          type="button"
          @click="handlePeng"
          class="px-4 sm:px-5 py-2 text-xs sm:text-sm font-extrabold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-2 border-emerald-300 shadow-[0_4px_16px_rgba(16,185,129,0.5)] hover:scale-105 active:scale-95 transition-all animate-bounce cursor-pointer flex items-center gap-1.5"
        >
          <span>碰牌</span>
          <span v-if="lastDiscarded" class="text-amber-200 text-xs font-mono font-bold">【{{ lastDiscarded.text }}】</span>
        </button>

        <!-- Gang (Allowed) with tile name -->
        <button
          v-if="canGang"
          key="gang-btn"
          type="button"
          @click="handleGang"
          class="px-4 sm:px-5 py-2 text-xs sm:text-sm font-extrabold rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white border-2 border-amber-300 shadow-[0_4px_16px_rgba(245,158,11,0.5)] hover:scale-105 active:scale-95 transition-all animate-bounce cursor-pointer flex items-center gap-1.5"
        >
          <span>杠牌</span>
          <span v-if="lastDiscarded && turnPlayer !== 0" class="text-amber-200 text-xs font-mono font-bold">【{{ lastDiscarded.text }}】</span>
        </button>

        <!-- Pass Claim Button (过) -->
        <button
          v-if="isClaiming && (canPeng || canGang)"
          key="pass-btn"
          type="button"
          @click="handlePassClaim"
          class="px-3.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold rounded-xl bg-gray-800/90 hover:bg-gray-700 text-gray-200 border border-white/20 shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
          title="放弃碰杠，继续对局"
        >
          <span>过</span>
          <span class="text-amber-300 font-mono font-bold text-xs tabular-nums">({{ claimCountdown }}s)</span>
        </button>

        <!-- Hu (Strictly Self-Draw 自摸 only, no Pao Hu) -->
        <button
          v-if="canHu"
          key="hu-btn"
          type="button"
          @click="handleHu"
          class="px-4 sm:px-6 py-1.5 text-xs sm:text-sm font-extrabold rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white shadow-[0_4px_20px_rgba(239,68,68,0.7)] hover:scale-110 active:scale-95 transition-all ring-2 ring-red-300 animate-pulse cursor-pointer"
        >
          自摸胡牌！🀄
        </button>

        <!-- Discard Selected Tile Button -->
        <button
          v-if="selectedIndex !== null && myHand.length % 3 === 2"
          key="discard-btn"
          type="button"
          @click="handleDiscardSelected"
          class="px-3.5 sm:px-4 py-1.5 text-xs sm:text-sm font-extrabold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-xl hover:scale-105 active:scale-95 transition-all ring-1 ring-purple-300 cursor-pointer"
        >
          打出【{{ myHand[selectedIndex]?.text }}】
        </button>
      </div>

      <!-- Bottom Cancel Auto-Host Button -->
      <div
        v-if="isAutoHost && !hasWon && !isDrawStalemate"
        class="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto"
      >
        <button
          type="button"
          @click="cancelAutoHost"
          class="px-5 py-2 text-xs sm:text-sm font-extrabold rounded-full bg-gradient-to-r from-red-600 via-amber-600 to-orange-500 hover:from-red-500 hover:to-amber-400 text-white border-2 border-amber-300 shadow-[0_4px_20px_rgba(239,68,68,0.7)] active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
        >
          <span>⚡ 自动托管中...</span>
          <span class="px-2 py-0.5 rounded-lg bg-black/40 text-amber-200 border border-white/20 font-bold hover:bg-black/70">取消托管</span>
        </button>
      </div>



      <!-- Victory Overlay with Real SVG Reward Ma Tiles (Widescreen Landscape Adapted, Extra Large & Ultra Intuitive, Zero Scroll) -->
      <div
        v-if="hasWon"
        class="absolute inset-0 backdrop-blur-md flex items-center justify-center p-2 sm:p-3 text-center z-30 overflow-hidden select-none"
        :style="{
          backgroundColor: props.tableTheme?.feltColor || '#7E22CE',
          background: `radial-gradient(ellipse at 50% 45%, ${props.tableTheme?.highlightColor || '#A855F7'}dd 0%, ${props.tableTheme?.feltColor || '#7E22CE'}f2 60%, ${props.tableTheme?.edgeColor || '#581C87'}fb 100%)`
        }"
      >
        <div
          class="w-full h-full max-w-[1400px] rounded-2xl sm:rounded-3xl border-2 p-2 sm:p-3 shadow-[0_0_60px_rgba(0,0,0,0.9),0_0_35px_rgba(245,158,11,0.35)] flex flex-col items-stretch justify-between overflow-hidden"
          :style="{
            backgroundColor: props.tableTheme?.feltColor || '#047857',
            backgroundImage: `linear-gradient(to bottom, ${props.tableTheme?.edgeColor || '#065F46'}f5 0%, ${props.tableTheme?.feltColor || '#047857'}e6 50%, ${props.tableTheme?.edgeColor || '#065F46'}f9 100%)`,
            borderColor: `${props.tableTheme?.highlightColor || '#10B981'}88`
          }"
        >
          
          <!-- Landscape Top Header -->
          <div
            class="flex items-center justify-between px-2.5 sm:px-4 py-1.5 rounded-xl border shrink-0 shadow-inner"
            :style="{
              backgroundColor: `${props.tableTheme?.edgeColor || '#065F46'}99`,
              borderColor: `${props.tableTheme?.highlightColor || '#10B981'}44`
            }"
          >
            <!-- Left: Win Title & Mode -->
            <div class="flex items-center gap-2 sm:gap-3 text-left">
              <span class="text-2xl sm:text-3xl filter drop-shadow">{{ winningBreakdown.rewardCoins > 0 ? '🏆' : '🍂' }}</span>
              <div>
                <h3 class="text-sm sm:text-base md:text-lg font-black text-amber-300 font-serif-title drop-shadow leading-tight">
                  {{ winningBreakdown.isFourHongzhong ? '四张红中天降大满贯！' : (winningBreakdown.rewardCoins > 0 ? '胡牌大捷！自摸和牌！' : '惜败！对手率先自摸和出！') }}
                </h3>
                <p class="text-[9px] sm:text-[10px] text-amber-100/80 font-mono">
                  底分 10 分 · 自摸奖码（一五九码及红中东风每中1码+10分）· 继续游戏由上局自摸者【{{ SEAT_NAMES[winningBreakdown.winnerSeat ?? (lastWinnerSeat ?? dealerSeat)] }}】坐庄率先出牌
                </p>
              </div>
            </div>

            <!-- Right: Hit Ma & Reward Coins Pills -->
            <div class="flex items-center gap-2 sm:gap-3">
              <div class="px-3 sm:px-4 py-1 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 text-xs sm:text-sm font-black flex items-center gap-1.5 shadow-sm">
                <span>🎯 斩获中码:</span>
                <span class="text-sm sm:text-base font-mono font-black text-white">{{ winningBreakdown.hitMaCount }} / {{ winningBreakdown.maCount }} 码</span>
              </div>
              <div
                class="px-3 sm:px-4 py-1 rounded-full text-xs sm:text-sm font-black flex items-center gap-1.5 shadow-sm"
                :class="winningBreakdown.rewardCoins >= 0 ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50' : 'bg-rose-500/25 text-rose-300 border border-rose-500/50'"
              >
                <span>🪙 {{ winningBreakdown.rewardCoins >= 0 ? '赢得筹码:' : '扣除筹码:' }}</span>
                <span class="text-sm sm:text-base font-mono font-black" :class="winningBreakdown.rewardCoins >= 0 ? 'text-amber-200' : 'text-rose-200'">
                  {{ winningBreakdown.rewardCoins >= 0 ? `+${winningBreakdown.rewardCoins}` : `${winningBreakdown.rewardCoins}` }} 分
                </span>
                <span class="text-[10px] opacity-80 font-normal">({{ winningBreakdown.payoutPerOpponent }}分/家)</span>
              </div>
            </div>
          </div>

          <!-- Winner Complete Hand & Melds Display Integrated into Settlement Modal -->
          <div
            class="my-1 sm:my-1.5 p-2 sm:p-2.5 rounded-2xl border shadow-lg flex flex-col items-center justify-center gap-1.5 w-full shrink-0"
            :style="{
              backgroundColor: `${props.tableTheme?.edgeColor || '#065F46'}aa`,
              borderColor: `${props.tableTheme?.highlightColor || '#10B981'}55`
            }"
          >
            <div class="text-[11px] sm:text-xs font-serif-title font-bold text-amber-300 flex items-center gap-2">
              <span>🏆 【{{ ['您 (本席)', '东席 (南洋商贾)', '北席 (九龙棋杰)', '西席 (濠江赌客)'][winningBreakdown.winnerSeat ?? 0] }}】自摸胡牌手牌全貌与亮副</span>
            </div>

            <!-- Melds (碰/杠亮副) if any -->
            <div v-if="(winningBreakdown.winnerSeat === 0 ? meldedTiles : (oppMelds[(winningBreakdown.winnerSeat ?? 1) - 1] || [])).length > 0" class="flex items-center gap-2 pb-1 border-b border-white/10 w-full justify-center flex-wrap">
              <span class="text-[9px] sm:text-[10px] font-mono font-bold text-amber-300">亮副:</span>
              <div class="flex items-center gap-1">
                <template v-for="(set, sIdx) in (winningBreakdown.winnerSeat === 0 ? meldedTiles : (oppMelds[(winningBreakdown.winnerSeat ?? 1) - 1] || []))" :key="sIdx">
                  <div class="flex items-center gap-0.5 bg-black/50 p-0.5 rounded-lg border border-white/20">
                    <template v-for="(tile, tIdx) in set" :key="tIdx">
                      <div class="relative h-[35px] sm:h-[45px] w-[24px] sm:w-[32px] rounded-lg bg-gradient-to-b from-[#FFFDF7] to-[#FFE394] border border-amber-400 flex flex-col items-center justify-center p-0.5 shadow">
                        <img :src="getMahjongImagePath(tile)" :alt="tile.text" class="w-full h-full object-contain" />
                      </div>
                    </template>
                  </div>
                </template>
              </div>
            </div>

            <!-- Hand Tiles Single Horizontal Row (Flat display, no wrapping, pure Mahjong tile image style without text labels) -->
            <div class="flex items-center justify-start sm:justify-center gap-1 sm:gap-1.5 flex-nowrap w-full py-0.5 overflow-x-auto max-w-full">
              <template v-for="(tile, tIdx) in ((winningBreakdown.winnerSeat ?? 0) === 0 ? myHand : (oppHands[(winningBreakdown.winnerSeat ?? 1) - 1] || []))" :key="tile.id || tIdx">
                <div class="relative h-[52px] sm:h-[68px] w-[32px] sm:w-[42px] shrink-0 rounded-xl bg-gradient-to-b from-[#FFFDF7] via-[#FFF3D6] to-[#FFE394] border border-amber-400 shadow-md flex items-center justify-center p-1">
                  <img :src="getMahjongImagePath(tile)" :alt="tile.text" class="w-full h-full object-contain drop-shadow" />
                </div>
              </template>
            </div>
          </div>

          <!-- Extended Wide Reward Ma Tiles Display with 12-Slot Card Tray (Landscape Responsive, Reserved Empty Slots) -->
          <div
            class="my-1 sm:my-1.5 p-2 sm:p-2.5 rounded-2xl border-2 w-full shadow-2xl flex-1 flex flex-col justify-between min-h-0 overflow-hidden"
            :style="{
              backgroundColor: `${props.tableTheme?.edgeColor || '#065F46'}aa`,
              borderColor: `${props.tableTheme?.highlightColor || '#10B981'}66`
            }"
          >
            <!-- Tray Header Bar -->
            <div class="text-xs sm:text-sm text-amber-300 font-mono font-bold flex items-center justify-between px-2 shrink-0 pb-1 border-b border-white/10">
              <span class="flex items-center gap-1.5">
                <span class="text-base sm:text-lg">🀄</span>
                <span class="font-serif-title font-bold text-amber-300">
                  雀神十二位开码置牌台
                </span>
                <span class="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                  最多支持12码 · 本局已开 {{ winningBreakdown.maCount }} 码 · 保留 {{ Math.max(0, 12 - winningBreakdown.maCount) }} 空位
                </span>
              </span>
              <span class="text-[10px] sm:text-xs text-amber-200/90 font-mono">
                {{ winningBreakdown.isFourHongzhong ? '🌟 四张红中：所有开码全中满贯！' : '命中【一、五、九、东风、红中】即为中码 (+10分/码)' }}
              </span>
            </div>

            <!-- Big Horizontal Responsive 12-Slot Tray Grid (Full 12 Slots, Clear distinction between Revealed Tiles & Reserved Empty Slots) -->
            <div class="grid grid-cols-12 gap-1 sm:gap-1.5 md:gap-2 py-0.5 sm:py-1 flex-1 min-h-0 w-full items-center justify-center">
              <template v-for="(slotNum, idx) in 12" :key="slotNum">
                <!-- Revealed Tile Card -->
                <div
                  v-if="idx < (winningBreakdown.rewardMaTiles?.length || 0)"
                  class="relative h-[85%] max-h-[105px] min-h-[50px] w-full rounded-xl sm:rounded-2xl border-2 sm:border-3 flex flex-col items-center justify-between p-0.5 sm:p-1 transition-all shadow-xl select-none"
                  :class="isYiWuJiuMa(winningBreakdown.rewardMaTiles[idx])
                    ? 'bg-gradient-to-b from-[#FFFDF7] via-[#FFF3D6] to-[#FFE394] border-amber-400 ring-2 sm:ring-4 ring-amber-400/90 shadow-[0_0_20px_rgba(245,158,11,0.85)] scale-102 sm:scale-106 -translate-y-1 z-10'
                    : 'bg-gradient-to-b from-[#FAF8F5] via-[#EFECE6] to-[#D5CDC0] border-gray-400/60 opacity-60 scale-95'"
                >
                  <!-- Prominent Hit / Miss Badge -->
                  <div
                    v-if="isYiWuJiuMa(winningBreakdown.rewardMaTiles[idx])"
                    class="absolute -top-2.5 sm:-top-3 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white font-black text-[8px] sm:text-[10px] md:text-xs px-1 sm:px-1.5 py-0.5 rounded-full shadow-lg border border-amber-200 animate-pulse whitespace-nowrap z-10"
                  >
                    🔥 中码
                  </div>
                  <div
                    v-else
                    class="absolute -top-2 text-[7px] sm:text-[8px] text-gray-500 font-bold px-1 py-0.2 rounded-full bg-black/50 border border-gray-600/30 whitespace-nowrap"
                  >
                    未中
                  </div>

                  <!-- Authentic SVG Mahjong Image -->
                  <div class="w-full flex-1 flex items-center justify-center min-h-0 py-1">
                    <img
                      :src="getMahjongImagePath(winningBreakdown.rewardMaTiles[idx])"
                      :alt="winningBreakdown.rewardMaTiles[idx]?.text"
                      class="w-full h-full max-h-[42px] sm:max-h-[64px] object-contain drop-shadow pointer-events-none transition-transform"
                      :class="isYiWuJiuMa(winningBreakdown.rewardMaTiles[idx]) ? 'scale-110 drop-shadow-[0_2px_8px_rgba(245,158,11,0.6)]' : 'opacity-85'"
                    />
                  </div>
                </div>

                <!-- Reserved Empty Slot (保留空位) -->
                <div
                  v-else
                  class="relative h-[85%] max-h-[105px] min-h-[50px] w-full rounded-xl sm:rounded-2xl border-2 border-dashed border-amber-500/30 bg-black/45 backdrop-blur-xs flex flex-col items-center justify-between p-0.5 sm:p-1 transition-all select-none opacity-45 hover:opacity-75"
                >
                  <div class="text-[7px] sm:text-[8px] font-mono font-bold text-amber-500/80 pt-0.5 truncate">
                    第{{ slotNum }}码
                  </div>
                  <div class="flex-1 flex flex-col items-center justify-center min-h-0 text-[#A89887]/60">
                    <span class="text-xs sm:text-base opacity-40">🀄</span>
                    <span class="text-[7px] sm:text-[8px] font-mono font-bold text-amber-400/60 mt-0.2">空位</span>
                  </div>
                  <div class="text-[6px] sm:text-[7px] font-mono text-[#8C7A6B]/80 pb-0.5 truncate">
                    保留位
                  </div>
                </div>
              </template>
            </div>

            <!-- Formula Banner -->
            <div class="text-xs sm:text-sm md:text-base text-amber-200/95 font-mono bg-black/70 px-3 py-1.5 sm:py-2 rounded-xl border border-white/10 flex items-center justify-between shrink-0 shadow-inner">
              <span class="flex items-center gap-1.5">
                <span class="text-amber-400 font-bold">📐 结算公式：</span>
                <span>
                  底分10 + 命中 {{ winningBreakdown.hitMaCount }} 码 × 10
                  <template v-if="winningBreakdown.kongBonusTotal && winningBreakdown.kongBonusTotal > 0">
                    <strong class="text-orange-400 font-bold"> + 杠牌得分 ({{ winningBreakdown.kongBonusTotal }}分)</strong>
                  </template>
                </span>
              </span>
              <span class="text-amber-300 font-bold hidden sm:inline">
                {{ winningBreakdown.isFourHongzhong ? '🎉 四张红中天降大满贯全中结算！' : `东席:${winningBreakdown.opponentPayouts?.[0]}分 · 北席:${winningBreakdown.opponentPayouts?.[1]}分 · 西席:${winningBreakdown.opponentPayouts?.[2]}分` }}
              </span>
            </div>
          </div>

          <!-- Extended Settlement Summary & Actions (Compact Widescreen) -->
          <div
            class="flex items-center justify-between gap-3 px-4 py-2 sm:py-2.5 text-xs sm:text-sm md:text-base text-[#E6DEC8] font-mono rounded-xl border w-full shrink-0 shadow-lg"
            :style="{
              backgroundColor: `${props.tableTheme?.edgeColor || '#065F46'}dd`,
              borderColor: `${props.tableTheme?.highlightColor || '#10B981'}55`
            }"
          >
            <div class="text-left truncate flex items-center gap-2">
              <span class="text-purple-300 font-bold shrink-0">牌型明细：</span>
              <span class="truncate text-amber-200 font-bold">{{ winningBreakdown.fans.join(' + ') }}</span>
            </div>
            <div class="flex items-center gap-2 sm:gap-3 shrink-0">
              <div class="text-[11px] sm:text-xs text-amber-300 font-mono bg-black/50 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border border-amber-500/40 inline-flex items-center gap-1.5 shadow-md shrink-0">
                <span>⚡ 全员准备:</span>
                <span class="font-bold text-amber-200">{{ readyPlayersCount }} / 4</span>
              </div>
              <button
                type="button"
                @click="handleLeaveToLobby"
                class="px-4 sm:px-6 py-2 sm:py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs sm:text-sm font-bold rounded-xl border border-white/20 shadow-lg transition-all active:scale-95 cursor-pointer whitespace-nowrap"
              >
                结束游戏返回大厅 🚪
              </button>
              <button
                type="button"
                @click="onRestartGame"
                :disabled="hasClickedReady"
                class="px-6 sm:px-10 py-2 sm:py-2.5 text-xs sm:text-base font-black rounded-xl shadow-xl ring-1 transition-all active:scale-95 cursor-pointer whitespace-nowrap flex items-center gap-2"
                :class="hasClickedReady ? 'bg-emerald-600/80 text-emerald-100 ring-emerald-400 opacity-90' : 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white shadow-amber-600/40 ring-amber-300'"
              >
                <span>{{ hasClickedReady ? `✅ 已准备 · 等待牌友 (${readyPlayersCount}/4)...` : '继续下一局 🀄 ➔' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Stalemate Overlay (when wall runs out) -->
      <div
        v-if="isDrawStalemate"
        class="absolute inset-0 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-30 overflow-hidden select-none"
        :style="{
          backgroundColor: props.tableTheme?.feltColor || '#7E22CE',
          background: `radial-gradient(ellipse at 50% 45%, ${props.tableTheme?.highlightColor || '#A855F7'}dd 0%, ${props.tableTheme?.feltColor || '#7E22CE'}f2 60%, ${props.tableTheme?.edgeColor || '#581C87'}fb 100%)`
        }"
      >
        <div class="text-3xl mb-1.5">🀄 🌪️</div>
        <h3 class="text-lg sm:text-xl font-bold text-amber-300 mb-1 font-serif-title">
          荒牌流局
        </h3>
        <p class="text-xs text-amber-200/80 mb-3">
          牌墙已摸空，无人自摸，本局平手！
        </p>
        <button
          type="button"
          @click="onRestartGame"
          :disabled="hasClickedReady"
          class="px-6 py-2 text-xs sm:text-sm font-black rounded-xl shadow-lg ring-1 active:scale-95 cursor-pointer"
          :class="hasClickedReady ? 'bg-emerald-600/80 text-emerald-100 ring-emerald-400 opacity-90' : 'bg-gradient-to-r from-purple-600 to-amber-600 hover:from-purple-500 hover:to-amber-500 text-white ring-amber-300'"
        >
          {{ hasClickedReady ? `✅ 已准备 · 等待牌友 (${readyPlayersCount}/4)...` : '继续游戏 🀄 ➔' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { soundFX } from '../../utils/sound';
import { haptics } from '../../utils/haptics';
import { TableTheme } from '../../utils/theme';
import { getCanvasEventCoords } from '../../utils/canvasCoords';
import {
  renderMahjongTile,
  renderMahjongTileBack,
  preloadMahjongAssets,
  onMahjongAssetsLoaded,
  getMahjongImagePath,
} from '../../utils/mahjongAssets';
import MahjongDiceCup from '../effects/MahjongDiceCup.vue';

interface MahjongTile {
  id: string;
  type: 'wan' | 'tiao' | 'tong' | 'zi';
  value: number; // 1..9 (zi: 1..7 for 东南西北中发白)
  text: string;
  color: string;
  discardBy?: number; // 0=Player(South), 1=East(Right/Green), 2=North(Top/Blue), 3=West(Left/Red)
}

const props = defineProps<{
  tableTheme?: TableTheme;
  isRotated90?: boolean;
  sceneMode?: string;
  roomPlayers?: any[];
  currentUser?: any;
  roomId?: string;
  initialDeal?: any;
  ws?: WebSocket | null;
  isPracticeMode?: boolean;
}>();

const mySeat = computed(() => {
  if (props.isPracticeMode || !props.currentUser || !props.roomPlayers || props.roomPlayers.length === 0) return 0;
  const myId = props.currentUser?.id;
  const myName = props.currentUser?.name;

  if (myId) {
    const idx = props.roomPlayers.findIndex((p: any) => {
      if (!p) return false;
      if (p.id === myId || p.originalId === myId) return true;
      if (typeof p.id === 'string' && (p.id.startsWith(myId) || (typeof myId === 'string' && myId.startsWith(p.id)))) return true;
      return false;
    });
    if (idx !== -1) return idx;
  }

  if (myName) {
    const idx = props.roomPlayers.findIndex((p: any) => {
      if (!p) return false;
      if (p.name === myName) return true;
      if (typeof p.name === 'string' && (p.name.startsWith(myName) || (typeof myName === 'string' && myName.startsWith(p.name)))) return true;
      return false;
    });
    if (idx !== -1) return idx;
  }

  if (typeof props.currentUser?.seat === 'number' && props.currentUser.seat >= 0 && props.currentUser.seat < props.roomPlayers.length) {
    const pAtSeat = props.roomPlayers[props.currentUser.seat];
    if (pAtSeat && ((myId && (pAtSeat.id === myId || pAtSeat.originalId === myId)) || (myName && pAtSeat.name === myName))) {
      return props.currentUser.seat;
    }
  }

  return 0;
});

const getSeatName = (seat: number) => {
  if (props.roomPlayers && props.roomPlayers.length > 0) {
    const absSeat = (mySeat.value + seat) % 4;
    const p = props.roomPlayers[absSeat];
    if (p) {
      const prefix = seat === 0 ? '本家' : seat === 1 ? '东席' : seat === 2 ? '北席' : '西席';
      return `${prefix} (${p.name})`;
    }
  }
  return ['您 (本席)', '东席 (牌友)', '北席 (牌友)', '西席 (牌友)'][seat] || '牌友席位';
};

const SEAT_NAMES = new Proxy([], {
  get(_target, prop) {
    const idx = Number(prop);
    if (!isNaN(idx)) {
      return getSeatName(idx);
    }
    return ['本家', '东席', '北席', '西席'][prop as any];
  }
}) as unknown as string[];

const emit = defineEmits<{
  (e: 'move', payload: any): void;
  (e: 'restart'): void;
  (e: 'fx', payload: any): void;
  (e: 'exit'): void;
}>();

watch(() => props.tableTheme, () => {
  drawTable();
});

watch(() => props.sceneMode, () => {
  dealNewMatch();
});

watch([() => props.initialDeal, () => props.roomPlayers], ([deal]) => {
  if (deal && deal.seatCards) {
    dealNewMatch(undefined, false);
  }
}, { immediate: true, deep: true });

const containerRef = ref<HTMLDivElement | null>(null);
const tableWidthPx = ref(680);
const tableHeightPx = ref(430);
let resizeObserver: ResizeObserver | null = null;

function updateDimensions() {
  if (!containerRef.value) return;
  const availW = containerRef.value.clientWidth || 680;
  const availH = containerRef.value.clientHeight || 430;
  const targetAspect = 680 / 430;

  let w = availW;
  let h = w / targetAspect;

  if (h > availH) {
    h = availH;
    w = h * targetAspect;
  }

  tableWidthPx.value = Math.max(280, Math.floor(w));
  tableHeightPx.value = Math.max(180, Math.floor(h));
  drawTable();
}

const canvasRef = ref<HTMLCanvasElement | null>(null);
const myHand = ref<MahjongTile[]>([]);
const meldedTiles = ref<MahjongTile[][]>([]);
const discards = ref<MahjongTile[]>([]);
const wallCount = ref(83);
const selectedIndex = ref<number | null>(null);
const hasWon = ref(false);
const announcingWinnerSeat = ref<number | null>(null);
let announceTimer: any = null;
const tipMessage = ref('手牌理顺就绪，轮到您出牌');

// Opponents Hands (East: 0, North: 1, West: 2)
const oppHands = ref<MahjongTile[][]>([[], [], []]);
const oppMelds = ref<MahjongTile[][][]>([[], [], []]);
const oppCounts = computed(() => [
  oppHands.value[0]?.length || 0,
  oppHands.value[1]?.length || 0,
  oppHands.value[2]?.length || 0,
]);
const turnPlayer = ref<number>(0); // 0=South(player), 1=East, 2=North, 3=West
const lastDiscarded = ref<MahjongTile | null>(null);

// 庄家与打色子定庄状态 (0=您/本席, 1=东席, 2=北席, 3=西席)
const dealerSeat = ref<number>(0);
const lastWinnerSeat = ref<number | null>(null); // 上局自摸胜者，继续游戏时由其继续坐庄率先出牌
const isDealerContinuing = ref<boolean>(false);
const dealerDice = ref<{ d1: number; d2: number; sum: number } | null>(null);
const dealingPhase = ref<'rolling_dice' | 'dealing_tiles' | 'sorting_tiles' | 'playing'>('rolling_dice');
const isRollingDice = ref(false);
const currentDiceDisplay = ref({ d1: 1, d2: 1 });
const myHandDealtCount = ref(0);
const oppHandsDealtCount = ref<number[]>([0, 0, 0]);
const handFlipProgress = ref(0); // 0 to 1
let diceRollInterval: any = null;
let dealingAnimTimers: any[] = [];
let flipRafId: any = null;

function getDicePipGrid(val: number): { visible: boolean; color: 'red' | 'black' }[] {
  const res: { visible: boolean; color: 'red' | 'black' }[] = Array.from({ length: 9 }, () => ({
    visible: false,
    color: 'black',
  }));

  const safeVal = Math.max(1, Math.min(6, val || 1));
  switch (safeVal) {
    case 1:
      res[4] = { visible: true, color: 'red' };
      break;
    case 2:
      res[0] = { visible: true, color: 'black' };
      res[8] = { visible: true, color: 'black' };
      break;
    case 3:
      res[0] = { visible: true, color: 'black' };
      res[4] = { visible: true, color: 'black' };
      res[8] = { visible: true, color: 'black' };
      break;
    case 4:
      res[0] = { visible: true, color: 'red' };
      res[2] = { visible: true, color: 'red' };
      res[6] = { visible: true, color: 'red' };
      res[8] = { visible: true, color: 'red' };
      break;
    case 5:
      res[0] = { visible: true, color: 'black' };
      res[2] = { visible: true, color: 'black' };
      res[4] = { visible: true, color: 'red' };
      res[6] = { visible: true, color: 'black' };
      res[8] = { visible: true, color: 'black' };
      break;
    case 6:
      res[0] = { visible: true, color: 'black' };
      res[3] = { visible: true, color: 'black' };
      res[6] = { visible: true, color: 'black' };
      res[2] = { visible: true, color: 'black' };
      res[5] = { visible: true, color: 'black' };
      res[8] = { visible: true, color: 'black' };
      break;
  }
  return res;
}

function cleanDealingTimers() {
  if (diceRollInterval) {
    clearInterval(diceRollInterval);
    diceRollInterval = null;
  }
  dealingAnimTimers.forEach((t) => clearTimeout(t));
  dealingAnimTimers = [];
  if (flipRafId) {
    cancelAnimationFrame(flipRafId);
    flipRafId = null;
  }
}

const hasClickedReady = ref(false);

function isPlayerReadyAtSeat(seat: number): boolean {
  if (seat === mySeat.value && hasClickedReady.value) return true;
  const p = (props.roomPlayers || []).find((pl: any) => pl && pl.seat === seat);
  return Boolean(p?.isReady);
}

const readyPlayersCount = computed(() => {
  if (!props.roomPlayers || props.roomPlayers.length === 0) {
    return hasClickedReady.value ? 1 : 0;
  }
  const readySeats = new Set<number>();
  props.roomPlayers.forEach((p: any) => {
    if (p && p.isReady && typeof p.seat === 'number') {
      readySeats.add(p.seat);
    }
  });
  if (hasClickedReady.value && typeof mySeat.value === 'number') {
    readySeats.add(mySeat.value);
  }
  return Math.min(4, readySeats.size);
});

const isAutoHost = ref(false);
const isDrawStalemate = ref(false);
const turnCountdown = ref(30);
let countdownInterval: any = null;
let autoHostTimer: any = null;

function startTurnCountdown() {
  stopTurnCountdown();
  if (isAutoHost.value || turnPlayer.value !== 0 || hasWon.value || isDrawStalemate.value) return;
  turnCountdown.value = 30;
  drawTable();
  countdownInterval = setInterval(() => {
    if (isAutoHost.value || turnPlayer.value !== 0 || hasWon.value || isDrawStalemate.value) {
      stopTurnCountdown();
      return;
    }
    turnCountdown.value--;
    drawTable();
    if (turnCountdown.value <= 0) {
      stopTurnCountdown();
      // 超时30秒自动托管
      isAutoHost.value = true;
      checkAutoHostTurn();
      drawTable();
    }
  }, 1000);
}

function stopTurnCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
    drawTable();
  }
}

function cancelAutoHost() {
  isAutoHost.value = false;
  if (autoHostTimer) {
    clearTimeout(autoHostTimer);
    autoHostTimer = null;
  }
  soundFX.playTap();
  if (turnPlayer.value === 0 && !hasWon.value && !isDrawStalemate.value) {
    startTurnCountdown();
  }
  drawTable();
}

// Claim Window (碰 / 杠思考窗口，时长 10 秒，支持点击【过】提前跳过)
const isClaiming = ref(false);
const claimCountdown = ref(10);
let claimInterval: any = null;
let pendingClaimNext: (() => void) | null = null;

function stopClaimCountdown() {
  isClaiming.value = false;
  pendingClaimNext = null;
  if (claimInterval) {
    clearInterval(claimInterval);
    claimInterval = null;
  }
}

function handlePassClaim() {
  soundFX.playTap();
  const next = pendingClaimNext;
  stopClaimCountdown();
  if (next) {
    next();
  }
}

function waitForPlayerClaim(next: () => void) {
  stopClaimCountdown();
  // 检查玩家是否有碰或杠的机会 (并且当前不在自动托管状态)
  if ((canPeng.value || canGang.value) && !isAutoHost.value && !hasWon.value && !isDrawStalemate.value) {
    isClaiming.value = true;
    claimCountdown.value = 10;
    pendingClaimNext = next;

    claimInterval = setInterval(() => {
      claimCountdown.value--;
      if (claimCountdown.value <= 0) {
        // 10秒超时自动过
        const cb = pendingClaimNext;
        stopClaimCountdown();
        if (cb) cb();
      }
    }, 1000);
  } else {
    // 无碰杠机会，或托管状态：正常平缓节奏推进
    botTimer = setTimeout(() => {
      next();
    }, 550);
  }
}

const TILE_CHARS: Record<string, string[]> = {
  wan: ['一万', '二万', '三万', '四万', '五万', '六万', '七万', '八万', '九万'],
  tiao: ['一条', '二条', '三条', '四条', '五条', '六条', '七条', '八条', '九条'],
  tong: ['一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒'],
  zi: ['东风', '南风', '西风', '北风', '红中', '发财', '白板'],
};

const ALL_TILE_KINDS = [
  ...Array.from({length: 9}, (_, i) => ({ type: 'wan' as const, value: i + 1, text: TILE_CHARS.wan[i] })),
  ...Array.from({length: 9}, (_, i) => ({ type: 'tiao' as const, value: i + 1, text: TILE_CHARS.tiao[i] })),
  ...Array.from({length: 9}, (_, i) => ({ type: 'tong' as const, value: i + 1, text: TILE_CHARS.tong[i] })),
  ...Array.from({length: 7}, (_, i) => ({ type: 'zi' as const, value: i + 1, text: TILE_CHARS.zi[i] })),
];

function scoreHand(tiles: MahjongTile[]): number {
  const groups: Record<string, number[]> = { wan: [], tiao: [], tong: [], zi: [] };
  tiles.forEach(t => groups[t.type].push(t.value));

  let score = 0;
  for (const type in groups) {
    const vals = groups[type].sort((a, b) => a - b);
    const counts: Record<number, number> = {};
    vals.forEach(v => counts[v] = (counts[v] || 0) + 1);

    for (const vStr in counts) {
      const v = Number(vStr);
      const c = counts[v];
      if (c >= 3) {
        score += 30;
        counts[v] -= 3;
      }
      if (counts[v] >= 2) {
        score += 15;
        counts[v] -= 2;
      }
    }

    if (type !== 'zi') {
      for (let v = 1; v <= 7; v++) {
        while ((counts[v] || 0) > 0 && (counts[v+1] || 0) > 0 && (counts[v+2] || 0) > 0) {
          score += 35;
          counts[v]--;
          counts[v+1]--;
          counts[v+2]--;
        }
      }
      for (let v = 1; v <= 8; v++) {
        while ((counts[v] || 0) > 0 && (counts[v+1] || 0) > 0) {
          score += 12;
          counts[v]--;
          counts[v+1]--;
        }
      }
      for (let v = 1; v <= 7; v++) {
        while ((counts[v] || 0) > 0 && (counts[v+2] || 0) > 0) {
          score += 8;
          counts[v]--;
          counts[v+2]--;
        }
      }
    }

    for (const vStr in counts) {
      const c = counts[vStr];
      score -= c * 6;
    }
  }
  return score;
}

function findSmartBestDiscard(hand: MahjongTile[]): number {
  if (hand.length <= 1) return 0;

  let bestIndex = 0;
  let maxEffectiveCount = -999999;
  let maxBaseScore = -999999;

  const visibleCounts: Record<string, number> = {};
  discards.value.forEach(t => {
    const key = `${t.type}-${t.value}`;
    visibleCounts[key] = (visibleCounts[key] || 0) + 1;
  });
  meldedTiles.value.forEach(meld => {
    meld.forEach(t => {
      const key = `${t.type}-${t.value}`;
      visibleCounts[key] = (visibleCounts[key] || 0) + 1;
    });
  });

  for (let i = 0; i < hand.length; i++) {
    const tile = hand[i];
    // In Hongzhong mode, never discard Hongzhong if there are other tiles
    if (isHongzhongMode.value && isHongzhong(tile) && hand.some((t) => !isHongzhong(t))) {
      continue;
    }

    const hand13 = hand.filter((_, idx) => idx !== i);
    const base13Score = scoreHand(hand13);

    let effectiveScoreSum = 0;
    for (const kind of ALL_TILE_KINDS) {
      const kindKey = `${kind.type}-${kind.value}`;
      const usedCount = visibleCounts[kindKey] || 0;
      const inHand13Count = hand13.filter(t => t.type === kind.type && t.value === kind.value).length;
      const availableInWall = Math.max(0, 4 - usedCount - inHand13Count);

      if (availableInWall === 0) continue;

      const testHand14 = [...hand13, { id: 'test', type: kind.type, value: kind.value, text: kind.text }];
      const testScore = scoreHand(testHand14);

      if (testScore > base13Score) {
        effectiveScoreSum += (testScore - base13Score) * availableInWall;
      }
    }

    // Expert Mahjong AI Heuristics:
    // 1. Isolate and discard singleton Honor tiles (zi) and Terminal tiles (1, 9) early on!
    let discardUrgencyBonus = 0;
    const sameTileCountInHand = hand.filter(t => t.type === tile.type && t.value === tile.value).length;
    
    if (tile.type === 'zi') {
      if (sameTileCountInHand === 1) {
        // Isolated honor tile: highest priority to discard!
        discardUrgencyBonus += 800;
      } else if (sameTileCountInHand === 2) {
        // Honor pair: valuable as potential pair (雀头)
        discardUrgencyBonus -= 200;
      }
    } else {
      // Suit tiles (wan, tiao, tong)
      if (sameTileCountInHand === 1 && (tile.value === 1 || tile.value === 9)) {
        // Check if there are adjacent tiles (e.g. 2 for 1, or 8 for 9)
        const hasAdjacent = hand.some(t => t.type === tile.type && Math.abs(t.value - tile.value) === 1);
        if (!hasAdjacent) {
          // Isolated terminal 1 or 9: high priority to discard
          discardUrgencyBonus += 450;
        }
      } else if (sameTileCountInHand === 1) {
        // Check if central tile is completely isolated (no neighbors within distance 2)
        const hasCloseNeighbor = hand.some(t => t.type === tile.type && Math.abs(t.value - tile.value) <= 2 && t !== tile);
        if (!hasCloseNeighbor) {
          discardUrgencyBonus += 250;
        }
      }
    }

    // Defensive consideration: In mid-to-late game (wall < 35), prefer safe tiles that already exist in discards
    let defenseBonus = 0;
    if (wallCount.value < 35) {
      const isAlreadyInDiscards = discards.value.some((d) => d.type === tile.type && d.value === tile.value);
      if (isAlreadyInDiscards) {
        defenseBonus += 40; // Safe tile (现物)
      } else if (tile.value >= 4 && tile.value <= 6 && tile.type !== 'zi') {
        defenseBonus -= 25; // Dangerous central tiles in late game
      }
    }

    // Total evaluation: We want to MINIMIZE evaluation for keeping, so the tile with highest discard urgency / lowest effective score is chosen to be discarded.
    // Wait, maxEffectiveCount selects the tile where discarding it yields the best balance or highest discard urgency for useless tiles.
    const totalEvaluation = discardUrgencyBonus - effectiveScoreSum + defenseBonus;

    if (totalEvaluation > maxEffectiveCount || (totalEvaluation === maxEffectiveCount && base13Score > maxBaseScore)) {
      maxEffectiveCount = totalEvaluation;
      maxBaseScore = base13Score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function checkAutoHostTurn() {
  stopTurnCountdown();
  if (!isAutoHost.value || turnPlayer.value !== 0 || hasWon.value || isDrawStalemate.value) return;
  if (autoHostTimer) clearTimeout(autoHostTimer);
  autoHostTimer = setTimeout(() => {
    if (!isAutoHost.value || turnPlayer.value !== 0 || hasWon.value || isDrawStalemate.value) return;
    if (canHu.value) {
      handleHu();
      return;
    }
    if (myHand.value.length % 3 === 2) {
      const bestDiscardIdx = findSmartBestDiscard(myHand.value);
      const discarded = myHand.value.splice(bestDiscardIdx, 1)[0];
      discarded.discardBy = 0;
      myHand.value = sortHand(myHand.value);
      discards.value.push(discarded);
      lastDiscarded.value = discarded;
      soundFX.playMahjongClack();
      soundFX.speakVoice(discarded.text);
      selectedIndex.value = null;
      tipMessage.value = `托管打出了【${discarded.text}】到牌池`;
      drawTable();
      emit('move', { action: 'discard', tile: discarded });
      runOpponentTurns();
    } else if (myHand.value.length % 3 === 1 && wallPool.length > 0) {
      handleDraw();
    }
  }, 650);
}



interface WinningBreakdown {
  fans: string[];
  totalFan: number;
  rewardCoins: number;
  maCount: number;
  rewardMaTiles: MahjongTile[];
  hitMaCount: number;
  payoutPerOpponent: number;
  isFourHongzhong?: boolean;
  kongBonusTotal?: number;
  opponentPayouts?: number[];
  winnerSeat?: number;
}

const playerKongExtra = ref<number[]>([0, 0, 0]); // [East, North, West] extra points owed by opponents due to player's Kongs
// 全席位杠分净盈亏记账本 [0:玩家, 1:东席, 2:北席, 3:西席]
const seatKongScores = ref<number[]>([0, 0, 0, 0]);
const kongRecords = ref<string[]>([]);

const winningBreakdown = ref<WinningBreakdown>({
  fans: ['自摸和牌 (基准 1番)', '常规平胡 (不计翻倍)'],
  totalFan: 1,
  rewardCoins: 100,
  maCount: 6,
  rewardMaTiles: [],
  hitMaCount: 0,
  payoutPerOpponent: 10,
  isFourHongzhong: false,
});

const isHongzhongMode = computed(() => {
  return props.sceneMode === 'hongzhong-6' || props.sceneMode === 'hongzhong-10';
});

const baseMaCount = computed(() => {
  return (props.sceneMode === 'standard-10' || props.sceneMode === 'hongzhong-10') ? 10 : 6;
});

function isHongzhong(tile: MahjongTile | null | undefined): boolean {
  if (!tile) return false;
  return (tile.type === 'zi' && tile.value === 5) || tile.text === '红中';
}

function isYiWuJiuMa(t: MahjongTile): boolean {
  if (winningBreakdown.value?.isFourHongzhong) return true;
  if (t.type !== 'zi') {
    return t.value === 1 || t.value === 5 || t.value === 9;
  }
  return t.value === 1 || t.value === 5 || t.text === '东风' || t.text === '红中';
}


function createTilePool(): MahjongTile[] {
  const pool: MahjongTile[] = [];
  (['wan', 'tiao', 'tong'] as const).forEach((t) => {
    for (let v = 1; v <= 9; v++) {
      for (let copy = 0; copy < 4; copy++) {
        pool.push({
          id: `${t}-${v}-${copy}`,
          type: t,
          value: v,
          text: TILE_CHARS[t][v - 1],
          color: t === 'wan' ? '#DC2626' : (t === 'tiao' ? '#16A34A' : '#2563EB'),
        });
      }
    }
  });
  // Zi tiles
  for (let v = 1; v <= 7; v++) {
    for (let copy = 0; copy < 4; copy++) {
      pool.push({
        id: `zi-${v}-${copy}`,
        type: 'zi',
        value: v,
        text: TILE_CHARS.zi[v - 1],
        color: v === 5 ? '#DC2626' : (v === 6 ? '#16A34A' : '#475569'),
      });
    }
  }
  return pool.sort(() => Math.random() - 0.5);
}

let wallPool: MahjongTile[] = [];

function sortHand(hand: MahjongTile[]): MahjongTile[] {
  const typeOrder = { wan: 0, tiao: 1, tong: 2, zi: 3 };
  return [...hand].sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || a.value - b.value);
}

function handleLeaveToLobby() {
  if (props.ws && props.ws.readyState === WebSocket.OPEN && !props.isPracticeMode) {
    try {
      props.ws.send(
        JSON.stringify({
          type: 'scene_leave',
          roomId: props.roomId,
          playerId: props.currentUser?.id,
          playerName: props.currentUser?.name,
          gameType: 'mahjong',
          sceneMode: props.sceneMode,
        })
      );
    } catch {}
  }
  emit('exit');
}

function onRestartGame() {
  soundFX.playTap();
  if (props.isPracticeMode) {
    hasClickedReady.value = false;
    continueGame();
    emit('restart');
    return;
  }

  hasClickedReady.value = true;
  if (props.ws && props.ws.readyState === WebSocket.OPEN) {
    try {
      props.ws.send(JSON.stringify({
        type: 'scene_player_ready',
        roomId: props.roomId,
        playerId: props.currentUser?.id,
        seat: mySeat.value,
        isReady: true,
      }));
    } catch {}
  }
}

function continueGame() {
  // 谁自摸谁坐庄，率先开牌出牌
  const nextDealer = lastWinnerSeat.value !== null ? lastWinnerSeat.value : dealerSeat.value;
  dealNewMatch(nextDealer);
}

const lastAppliedDealId = ref<string>('');

function dealNewMatch(designatedDealer?: number, forceReApply = false) {
  hasClickedReady.value = false;
  if (props.initialDeal?.seatCards) {
    const dealIdentifier = props.initialDeal.dealId || props.initialDeal.createdAt || (Array.isArray(props.initialDeal.seatCards[0]) ? props.initialDeal.seatCards[0].map((c: any) => c.id || c.name).join('-') : '');
    if (!forceReApply && lastAppliedDealId.value && lastAppliedDealId.value === dealIdentifier && myHand.value && myHand.value.length > 0) {
      console.log(`🛡️ [麻将网络波动防重刷] 发牌 ${dealIdentifier} 已在桌上执行，跳过重复洗牌与重置`);
      return;
    }
    lastAppliedDealId.value = dealIdentifier;
  }
  stopTurnCountdown();
  stopClaimCountdown();
  cleanDealingTimers();
  isDrawStalemate.value = false;

  const isContinuing = designatedDealer !== undefined;
  isDealerContinuing.value = isContinuing;
  let targetDealer = 0;

  const rawDealTiles = props.initialDeal?.seatCards;
  const hasValidTiles = rawDealTiles && (Array.isArray(rawDealTiles) ? rawDealTiles.length === 4 : (rawDealTiles[0] && rawDealTiles[1] && rawDealTiles[2] && rawDealTiles[3]));
  if (props.initialDeal && hasValidTiles) {
    const sMe = mySeat.value;
    const sEast = (sMe + 1) % 4;
    const sNorth = (sMe + 2) % 4;
    const sWest = (sMe + 3) % 4;

    myHand.value = sortHand([...(props.initialDeal.seatCards[sMe] || [])]);
    oppHands.value = [
      sortHand([...(props.initialDeal.seatCards[sEast] || [])]),
      sortHand([...(props.initialDeal.seatCards[sNorth] || [])]),
      sortHand([...(props.initialDeal.seatCards[sWest] || [])]),
    ];
    wallPool = [...(props.initialDeal.remainingWall || [])];
    wallCount.value = wallPool.length;

    const rawDealer = props.initialDeal.dealerSeat !== undefined ? props.initialDeal.dealerSeat : 0;
    targetDealer = (rawDealer - sMe + 4) % 4;
    dealerSeat.value = targetDealer;
    dealerDice.value = props.initialDeal.dice || { d1: 1, d2: 1, sum: 2 };
  } else {
    // Standard Mahjong: strictly 136 tiles in total (36 wan + 36 tiao + 36 tong + 28 zi)
    wallPool = createTilePool();

    // 掷色子：
    // 两个骰子 1..6，点数 2..12
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const sum = d1 + d2;

    // 规则：继续游戏时，上局谁自摸谁坐庄率先开牌出牌！若重新开局则由色子定庄
    targetDealer = designatedDealer !== undefined ? designatedDealer : (sum - 1) % 4; // 0=本席(南), 1=东席, 2=北席, 3=西席
    dealerSeat.value = targetDealer;
    dealerDice.value = { d1, d2, sum };

    // 庄家抓 14 张牌，闲家各抓 13 张牌 (起手共 53 张牌)
    if (targetDealer === 0) {
      myHand.value = sortHand(wallPool.slice(0, 14));
      oppHands.value = [
        sortHand(wallPool.slice(14, 27)), // East: 13
        sortHand(wallPool.slice(27, 40)), // North: 13
        sortHand(wallPool.slice(40, 53)), // West: 13
      ];
    } else if (targetDealer === 1) {
      myHand.value = sortHand(wallPool.slice(0, 13));
      oppHands.value = [
        sortHand(wallPool.slice(13, 27)), // East (Dealer): 14
        sortHand(wallPool.slice(27, 40)), // North: 13
        sortHand(wallPool.slice(40, 53)), // West: 13
      ];
    } else if (targetDealer === 2) {
      myHand.value = sortHand(wallPool.slice(0, 13));
      oppHands.value = [
        sortHand(wallPool.slice(13, 26)), // East: 13
        sortHand(wallPool.slice(26, 40)), // North (Dealer): 14
        sortHand(wallPool.slice(40, 53)), // West: 13
      ];
    } else {
      myHand.value = sortHand(wallPool.slice(0, 13));
      oppHands.value = [
        sortHand(wallPool.slice(13, 26)), // East: 13
        sortHand(wallPool.slice(26, 39)), // North: 13
        sortHand(wallPool.slice(39, 53)), // West (Dealer): 14
      ];
    }

    // Remaining in wall: exactly 136 - 14 - 39 = 83 tiles!
    wallPool = wallPool.slice(53);
    wallCount.value = wallPool.length;
  }

  playerKongExtra.value = [0, 0, 0];
  seatKongScores.value = [0, 0, 0, 0];
  kongRecords.value = [];
  meldedTiles.value = [];
  oppMelds.value = [[], [], []];
  discards.value = [];
  lastDiscarded.value = null;
  selectedIndex.value = null;
  hasWon.value = false;
  announcingWinnerSeat.value = null;
  if (announceTimer) {
    clearTimeout(announceTimer);
    announceTimer = null;
  }

  // 初始发牌动效阶段：3D 色盅与双色子定庄
  dealingPhase.value = 'rolling_dice';
  isRollingDice.value = true;
  myHandDealtCount.value = 0;
  oppHandsDealtCount.value = [0, 0, 0];
  handFlipProgress.value = 0;
  turnPlayer.value = targetDealer;
  tipMessage.value = isContinuing
    ? `🎲 【${SEAT_NAMES[targetDealer]}】上局自摸继续坐庄，开局掷色定开门...`
    : '🎲 开局掷双色子定庄开门...';
  drawTable();
}

function startDealingTilesAnimation() {
  dealingPhase.value = 'dealing_tiles';
  tipMessage.value = '🀄 开局起手抓牌 (牌背朝上发牌)...';
  drawTable();

  // Wave 1: 4 cards each
  const t1 = setTimeout(() => {
    myHandDealtCount.value = 4;
    oppHandsDealtCount.value = [4, 4, 4];
    soundFX.playCardSnap();
    tipMessage.value = '🀄 抓第一道手牌 (各得 4 张)...';
    drawTable();

    // Wave 2: 8 cards each
    const t2 = setTimeout(() => {
      myHandDealtCount.value = 8;
      oppHandsDealtCount.value = [8, 8, 8];
      soundFX.playCardSnap();
      tipMessage.value = '🀄 抓第二道手牌 (各得 8 张)...';
      drawTable();

      // Wave 3: 12 cards each
      const t3 = setTimeout(() => {
        myHandDealtCount.value = 12;
        oppHandsDealtCount.value = [12, 12, 12];
        soundFX.playCardSnap();
        tipMessage.value = '🀄 抓第三道手牌 (各得 12 张)...';
        drawTable();

        // Wave 4: 13 cards each
        const t4 = setTimeout(() => {
          myHandDealtCount.value = 13;
          oppHandsDealtCount.value = [13, 13, 13];
          soundFX.playCardSnap();
          tipMessage.value = '🀄 抓第四道起手牌 (各得 13 张)...';
          drawTable();

          // Wave 5: Dealer draws 14th tile (庄家跳牌)
          const t5 = setTimeout(() => {
            if (dealerSeat.value === 0) {
              myHandDealtCount.value = 14;
            } else {
              oppHandsDealtCount.value[dealerSeat.value - 1] = 14;
            }
            soundFX.playMahjongClack();
            tipMessage.value = `🀄 【${SEAT_NAMES[dealerSeat.value]}】跳牌抓第 14 张起手牌！`;
            drawTable();

            // Wave 6: Flip & Sort Hand (翻面亮牌理顺)
            const t6 = setTimeout(() => {
              startHandFlipAnimation();
            }, 360);
            dealingAnimTimers.push(t6);
          }, 320);
          dealingAnimTimers.push(t5);
        }, 300);
        dealingAnimTimers.push(t4);
      }, 300);
      dealingAnimTimers.push(t3);
    }, 300);
    dealingAnimTimers.push(t2);
  }, 220);
  dealingAnimTimers.push(t1);
}

function startHandFlipAnimation() {
  dealingPhase.value = 'sorting_tiles';
  tipMessage.value = '🀄 整牌理牌，翻面亮牌...';
  soundFX.playMahjongClack();
  const startTime = performance.now();
  const duration = 420;

  function step(now: number) {
    const elapsed = now - startTime;
    const p = Math.min(1, elapsed / duration);
    handFlipProgress.value = p;
    drawTable();
    if (p < 1) {
      flipRafId = requestAnimationFrame(step);
    } else {
      flipRafId = null;
      finishDealingAndStartPlay();
    }
  }
  flipRafId = requestAnimationFrame(step);
}

function finishDealingAndStartPlay() {
  dealingPhase.value = 'playing';
  turnPlayer.value = dealerSeat.value;
  drawTable();

  // 特殊规则：起手摸齐四张红中直接结束游戏！
  if (isHongzhongMode.value) {
    if (myHand.value.filter(isHongzhong).length === 4) {
      setTimeout(() => triggerMahjongWin(0, true), 350);
      return;
    }
    for (let b = 0; b < 3; b++) {
      if (oppHands.value[b].filter(isHongzhong).length === 4) {
        setTimeout(() => triggerMahjongWin(b + 1, true), 350);
        return;
      }
    }
  }

  if (dealerSeat.value === 0) {
    tipMessage.value = isDealerContinuing.value
      ? '👑 您上局自摸连庄，起手执14张牌，请点击手牌出第一张牌！'
      : (isHongzhongMode.value
        ? '👑 您是庄家，手牌理顺就绪，请先出牌！(红中百搭万能)'
        : '👑 您是庄家，起手抓齐 14 张，请点击手牌选一张打出');
    drawTable();
    if (isAutoHost.value) {
      checkAutoHostTurn();
    } else {
      startTurnCountdown();
    }
  } else {
    tipMessage.value = isDealerContinuing.value
      ? `👑 【${SEAT_NAMES[dealerSeat.value]}】上局自摸连庄，执 14 张牌率先出牌...`
      : `👑 【${SEAT_NAMES[dealerSeat.value]}】是庄家，执 14 张牌率先出牌...`;
    drawTable();
    const t = setTimeout(() => {
      botPlay(dealerSeat.value, () => passTurnToNext(dealerSeat.value));
    }, 950);
    dealingAnimTimers.push(t);
  }
}

function skipDealingAnimation() {
  cleanDealingTimers();
  isRollingDice.value = false;
  if (dealerDice.value) {
    currentDiceDisplay.value = { d1: dealerDice.value.d1, d2: dealerDice.value.d2 };
  }
  myHandDealtCount.value = myHand.value.length;
  oppHandsDealtCount.value = [oppHands.value[0].length, oppHands.value[1].length, oppHands.value[2].length];
  handFlipProgress.value = 1;
  dealingPhase.value = 'playing';

  // Check 4 Hongzhong instant win
  if (isHongzhongMode.value) {
    if (myHand.value.filter(isHongzhong).length === 4) {
      setTimeout(() => triggerMahjongWin(0, true), 350);
      return;
    }
    for (let b = 0; b < 3; b++) {
      if (oppHands.value[b].filter(isHongzhong).length === 4) {
        setTimeout(() => triggerMahjongWin(b + 1, true), 350);
        return;
      }
    }
  }

  turnPlayer.value = dealerSeat.value;
  if (dealerSeat.value === 0) {
    tipMessage.value = isDealerContinuing.value
      ? '👑 您上局自摸连庄，起手执14张牌，请点击手牌出第一张牌！'
      : (isHongzhongMode.value
        ? '👑 您是庄家，手牌理顺就绪，请先出牌！(红中百搭万能)'
        : '👑 您是庄家，起手抓齐 14 张，请点击手牌选一张打出');
    drawTable();
    if (isAutoHost.value) {
      checkAutoHostTurn();
    } else {
      startTurnCountdown();
    }
  } else {
    tipMessage.value = isDealerContinuing.value
      ? `👑 【${SEAT_NAMES[dealerSeat.value]}】上局自摸连庄，执 14 张牌率先出牌...`
      : `👑 【${SEAT_NAMES[dealerSeat.value]}】是庄家，执 14 张牌率先出牌...`;
    drawTable();
    const t = setTimeout(() => {
      botPlay(dealerSeat.value, () => passTurnToNext(dealerSeat.value));
    }, 800);
    dealingAnimTimers.push(t);
  }
}

// 规则：可以碰 (他人出牌时，手牌中有2张相同牌；红中不可碰)
const canPeng = computed(() => {
  if (!lastDiscarded.value || turnPlayer.value === 0) return false;
  const d = lastDiscarded.value;
  // 红中模式下，红中为万能百搭，不可被碰
  if (isHongzhongMode.value && isHongzhong(d)) return false;
  return myHand.value.filter((c) => c.type === d.type && c.value === d.value).length >= 2;
});

// 规则：可以杠 (支持明杠、暗杠、补杠；红中模式下四红中直接胡牌结算)
const canGang = computed(() => {
  // 1. 明杠：他人出牌时，手中已有3张相同牌
  if (lastDiscarded.value && turnPlayer.value !== 0) {
    const d = lastDiscarded.value;
    if (isHongzhongMode.value && isHongzhong(d)) return false;
    if (myHand.value.filter((c) => c.type === d.type && c.value === d.value).length === 3) return true;
  }
  // 2. 暗杠与补杠：轮到自己抓牌后 (手牌数为 3k+2)
  if (turnPlayer.value === 0 && myHand.value.length % 3 === 2) {
    // 暗杠：手牌中有4张完全相同的牌 (红中场中4张红中直接胡牌，不作为暗杠)
    const counts = new Map<string, number>();
    myHand.value.forEach((c) => {
      if (isHongzhongMode.value && isHongzhong(c)) return;
      counts.set(`${c.type}-${c.value}`, (counts.get(`${c.type}-${c.value}`) || 0) + 1);
    });
    for (const cnt of counts.values()) {
      if (cnt === 4) return true;
    }
    // 补杠：摸到已碰明刻中对应牌型的第4张
    for (const meld of meldedTiles.value) {
      if (meld.length === 3 && meld[0].type === meld[1].type && meld[0].value === meld[1].value) {
        if (myHand.value.some((c) => c.type === meld[0].type && c.value === meld[0].value)) {
          return true;
        }
      }
    }
  }
  return false;
});

/**
 * Standard Mahjong Win Check (4 melds + 1 pair, or 7 pairs)
 * 规则：无十三幺 (十三幺不作为胡牌牌型，严格禁止)
 */
function checkMahjongWin(hand: MahjongTile[]): boolean {
  if (hand.length % 3 !== 2) return false;

  // Check 7 pairs (七对)
  if (hand.length === 14) {
    const counts = new Map<string, number>();
    hand.forEach((c) => counts.set(`${c.type}-${c.value}`, (counts.get(`${c.type}-${c.value}`) || 0) + 1));
    let pairCount = 0;
    for (const cnt of counts.values()) {
      if (cnt === 2) pairCount++;
      if (cnt === 4) pairCount += 2;
    }
    if (pairCount === 7) return true;
  }

  // Group by type (wan, tiao, tong, zi)
  const groups: Record<string, number[]> = { wan: [], tiao: [], tong: [], zi: [] };
  hand.forEach((c) => groups[c.type].push(c.value));
  Object.values(groups).forEach((arr) => arr.sort((a, b) => a - b));

  // Try each possible pair (雀头)
  for (const [t, vals] of Object.entries(groups)) {
    for (let i = 0; i < vals.length - 1; i++) {
      if (vals[i] === vals[i + 1]) {
        // Remove this pair and check if remaining are all valid melds (3-sets)
        const testGroups: Record<string, number[]> = {
          wan: [...groups.wan],
          tiao: [...groups.tiao],
          tong: [...groups.tong],
          zi: [...groups.zi],
        };
        testGroups[t].splice(i, 2);

        let allValid = true;
        for (const [subT, subVals] of Object.entries(testGroups)) {
          if (!canDecomposeIntoMelds(subVals, subT === 'zi')) {
            allValid = false;
            break;
          }
        }
        if (allValid) return true;
      }
    }
  }

  return false;
}

function canDecomposeIntoMelds(vals: number[], isZi = false): boolean {
  if (vals.length === 0) return true;
  if (vals.length % 3 !== 0) return false;

  const arr = [...vals].sort((a, b) => a - b);
  // Try Triplet (刻子)
  if (arr[0] === arr[1] && arr[1] === arr[2]) {
    const nextArr = arr.slice(3);
    if (canDecomposeIntoMelds(nextArr, isZi)) return true;
  }
  // Try Sequence (顺子 - 字牌不可成顺)
  if (!isZi) {
    const v = arr[0];
    const idx2 = arr.indexOf(v + 1);
    const idx3 = arr.indexOf(v + 2);
    if (idx2 !== -1 && idx3 !== -1) {
      const nextArr = [...arr];
      nextArr.splice(idx3, 1);
      nextArr.splice(idx2, 1);
      nextArr.splice(0, 1);
      if (canDecomposeIntoMelds(nextArr, isZi)) return true;
    }
  }
  return false;
}

// 缓存单花色所需最小百搭癞子数量
const suitWildcardCache = new Map<string, number>();

function minWildcardsForSuit(arr: number[]): number {
  if (arr.length === 0) return 0;
  const key = arr.join(',');
  if (suitWildcardCache.has(key)) return suitWildcardCache.get(key)!;

  const v = arr[0];
  let minCost = 999;

  // 1. 刻子相关组合
  const countV = arr.filter((x) => x === v).length;
  // 1a: 3张相同，0百搭
  if (countV >= 3) {
    const nextArr = [...arr];
    nextArr.splice(nextArr.indexOf(v), 1);
    nextArr.splice(nextArr.indexOf(v), 1);
    nextArr.splice(nextArr.indexOf(v), 1);
    minCost = Math.min(minCost, minWildcardsForSuit(nextArr));
  }
  // 1b: 2张相同 + 1百搭
  if (countV >= 2) {
    const nextArr = [...arr];
    nextArr.splice(nextArr.indexOf(v), 1);
    nextArr.splice(nextArr.indexOf(v), 1);
    minCost = Math.min(minCost, 1 + minWildcardsForSuit(nextArr));
  }
  // 1c: 1张单牌 + 2百搭
  {
    const nextArr = [...arr];
    nextArr.splice(nextArr.indexOf(v), 1);
    minCost = Math.min(minCost, 2 + minWildcardsForSuit(nextArr));
  }

  // 2. 顺子相关组合
  const idx1 = arr.indexOf(v + 1);
  const idx2 = arr.indexOf(v + 2);

  // 2a: v, v+1, v+2 (0百搭)
  if (idx1 !== -1 && idx2 !== -1) {
    const nextArr = [...arr];
    nextArr.splice(idx2, 1);
    nextArr.splice(idx1, 1);
    nextArr.splice(0, 1);
    minCost = Math.min(minCost, minWildcardsForSuit(nextArr));
  }
  // 2b: v, v+1 + 1百搭
  if (idx1 !== -1) {
    const nextArr = [...arr];
    nextArr.splice(idx1, 1);
    nextArr.splice(0, 1);
    minCost = Math.min(minCost, 1 + minWildcardsForSuit(nextArr));
  }
  // 2c: v, v+2 + 1百搭
  if (idx2 !== -1) {
    const nextArr = [...arr];
    nextArr.splice(idx2, 1);
    nextArr.splice(0, 1);
    minCost = Math.min(minCost, 1 + minWildcardsForSuit(nextArr));
  }

  suitWildcardCache.set(key, minCost);
  return minCost;
}

function minWildcardsForZi(vals: number[]): number {
  if (vals.length === 0) return 0;
  const counts = new Map<number, number>();
  vals.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  let needed = 0;
  for (const c of counts.values()) {
    const rem = c % 3;
    if (rem === 1) needed += 2;
    else if (rem === 2) needed += 1;
  }
  return needed;
}

function totalWildcardsNeeded(w: number[], ti: number[], to: number[], z: number[]): number {
  return minWildcardsForSuit(w) + minWildcardsForSuit(ti) + minWildcardsForSuit(to) + minWildcardsForZi(z);
}

/**
 * 红中麻将胡牌检测：红中作为万能百搭牌
 * - 四张红中：直接胡牌结束游戏
 * - 七对：红中可与任意单牌成对
 * - 标准 4副牌 + 1将牌 (雀头)：红中可任意充当
 */
function checkHongzhongWin(hand: MahjongTile[]): boolean {
  if (hand.length % 3 !== 2) return false;

  const hzCount = hand.filter(isHongzhong).length;
  // 规则：摸到四张红中就结束游戏！
  if (hzCount === 4) return true;

  const normalTiles = hand.filter((t) => !isHongzhong(t));

  // 1. 七对检查 (七对必须全手牌14张且无亮副)
  if (hand.length === 14) {
    const counts = new Map<string, number>();
    normalTiles.forEach((c) => counts.set(`${c.type}-${c.value}`, (counts.get(`${c.type}-${c.value}`) || 0) + 1));
    let neededForSingles = 0;
    for (const cnt of counts.values()) {
      neededForSingles += cnt % 2;
    }
    if (hzCount >= neededForSingles) {
      return true;
    }
  }

  // 2. 正常 4副 + 1雀头 检查
  const wan = normalTiles.filter((t) => t.type === 'wan').map((t) => t.value).sort((a, b) => a - b);
  const tiao = normalTiles.filter((t) => t.type === 'tiao').map((t) => t.value).sort((a, b) => a - b);
  const tong = normalTiles.filter((t) => t.type === 'tong').map((t) => t.value).sort((a, b) => a - b);
  const zi = normalTiles.filter((t) => t.type === 'zi').map((t) => t.value).sort((a, b) => a - b);

  // 方案 A: 雀头由 2张红中 组成
  if (hzCount >= 2) {
    if (totalWildcardsNeeded(wan, tiao, tong, zi) <= hzCount - 2) {
      return true;
    }
  }

  // 方案 B: 雀头由 1张普通牌 + 1张红中 组成
  if (hzCount >= 1) {
    // 遍历每一个可能的普通单牌作为将
    const tried = new Set<string>();
    for (const t of normalTiles) {
      const key = `${t.type}-${t.value}`;
      if (tried.has(key)) continue;
      tried.add(key);

      const testWan = [...wan];
      const testTiao = [...tiao];
      const testTong = [...tong];
      const testZi = [...zi];

      if (t.type === 'wan') testWan.splice(testWan.indexOf(t.value), 1);
      else if (t.type === 'tiao') testTiao.splice(testTiao.indexOf(t.value), 1);
      else if (t.type === 'tong') testTong.splice(testTong.indexOf(t.value), 1);
      else if (t.type === 'zi') testZi.splice(testZi.indexOf(t.value), 1);

      if (totalWildcardsNeeded(testWan, testTiao, testTong, testZi) <= hzCount - 1) {
        return true;
      }
    }
  }

  // 方案 C: 雀头由 2张完全相同的普通牌 组成
  const countsByKind = new Map<string, { type: 'wan' | 'tiao' | 'tong' | 'zi'; value: number; count: number }>();
  normalTiles.forEach((t) => {
    const key = `${t.type}-${t.value}`;
    if (!countsByKind.has(key)) {
      countsByKind.set(key, { type: t.type, value: t.value, count: 0 });
    }
    countsByKind.get(key)!.count++;
  });

  for (const item of countsByKind.values()) {
    if (item.count >= 2) {
      const testWan = [...wan];
      const testTiao = [...tiao];
      const testTong = [...tong];
      const testZi = [...zi];

      if (item.type === 'wan') {
        testWan.splice(testWan.indexOf(item.value), 1);
        testWan.splice(testWan.indexOf(item.value), 1);
      } else if (item.type === 'tiao') {
        testTiao.splice(testTiao.indexOf(item.value), 1);
        testTiao.splice(testTiao.indexOf(item.value), 1);
      } else if (item.type === 'tong') {
        testTong.splice(testTong.indexOf(item.value), 1);
        testTong.splice(testTong.indexOf(item.value), 1);
      } else if (item.type === 'zi') {
        testZi.splice(testZi.indexOf(item.value), 1);
        testZi.splice(testZi.indexOf(item.value), 1);
      }

      if (totalWildcardsNeeded(testWan, testTiao, testTong, testZi) <= hzCount) {
        return true;
      }
    }
  }

  return false;
}

// 规则：不可炮胡，仅限自摸 (必须轮到自己回合且已抓牌在手，手牌数为 3k+2)
const canHu = computed(() => {
  if (turnPlayer.value !== 0 || myHand.value.length % 3 !== 2) return false;
  if (isHongzhongMode.value) {
    return checkHongzhongWin(myHand.value);
  }
  return checkMahjongWin(myHand.value);
});

/**
 * 统一麻将胡牌与积分结算
 * - 普通六码/十码场：自摸奖 6 / 10 码，底分10分，一五九码及红中东风每中1码+10分
 * - 红中六码/十码场：
 *   1. 摸到4张红中直接结束游戏：
 *      - 六码场：等于六码全中加底分，各得其他玩家70分，共210分
 *      - 十码场：等于十码全中加底分，各得其他玩家110分，共330分
 *   2. 自摸手牌没有红中：奖励额外加2个码 (六码场变8码，十码场变12码)
 */
function triggerMahjongWin(winnerSeat: number, isFourHongzhong = false) {
  stopTurnCountdown();
  stopClaimCountdown();
  if (botTimer) clearTimeout(botTimer);
  if (announceTimer) clearTimeout(announceTimer);

  hasWon.value = true;
  hasClickedReady.value = false;
  const isPlayer = winnerSeat === 0;
  const seatNames = ['您 (本席)', '东席 (南洋商贾)', '北席 (九龙棋杰)', '西席 (濠江赌客)'];
  const winnerName = seatNames[winnerSeat] || '雀圣';

  const winnerHand = isPlayer ? myHand.value : (oppHands.value[winnerSeat - 1] || []);
  const hzCountInHand = winnerHand.filter(isHongzhong).length;

  const baseCodes = baseMaCount.value; // 6 or 10
  const isHzMode = isHongzhongMode.value;
  const fourHzWin = isHzMode && (isFourHongzhong || hzCountInHand === 4);

  let maCount = baseCodes;
  let hitCount = 0;
  let payoutPerOpponent = 0;
  let fansList: string[] = [];
  let rewardMaTiles: MahjongTile[] = [];

  if (fourHzWin) {
    // 规则：摸到四张红中直接结束游戏！
    // 六码场：6码全中 (6*10=60分) + 底分10分 = 各得70分，共210分
    // 十码场：10码全中 (10*10=100分) + 底分10分 = 各得110分，共330分
    maCount = baseCodes;
    hitCount = baseCodes;
    payoutPerOpponent = 10 + hitCount * 10; // 70 or 110
    fansList = [
      '摸到四张红中 · 天降大满贯！',
      baseCodes === 6 ? '红中六码全中 (奖60分)' : '红中十码全中 (奖100分)',
      '各得其他玩家底分10分',
    ];

    rewardMaTiles = wallPool.slice(0, Math.min(maCount, wallPool.length));
    while (rewardMaTiles.length < maCount) {
      rewardMaTiles.push({
        id: `hz-win-${rewardMaTiles.length}`,
        type: 'zi',
        value: 5,
        text: '红中',
        color: '#DC2626',
      });
    }
  } else {
    // 普通自摸 / 红中自摸
    const hasNoHongzhong = isHzMode && hzCountInHand === 0;
    if (hasNoHongzhong) {
      // 规则：红中场自摸玩家手牌没有红中的加两个码 (六码场变8码，十码场变12码)
      maCount = baseCodes + 2;
      fansList.push(`自摸和牌 (手牌无红中奖励加2码，共${maCount}码)`);
    } else {
      maCount = baseCodes;
      fansList.push(isHzMode ? `红中百搭自摸和牌 (奖${maCount}码)` : `自摸和牌 (奖${maCount}码)`);
    }

    rewardMaTiles = wallPool.slice(0, Math.min(maCount, wallPool.length));
    // 牌墙不足时补充牌展示完整奖码
    if (rewardMaTiles.length < maCount) {
      const extraPool = createTilePool();
      while (rewardMaTiles.length < maCount && extraPool.length > 0) {
        rewardMaTiles.push(extraPool.pop()!);
      }
    }

    hitCount = rewardMaTiles.filter(isYiWuJiuMa).length;
    payoutPerOpponent = 10 + hitCount * 10;
    fansList.push(`自摸奖码 (${maCount}码中${hitCount}码)`);
  }

  // 综合结算：基础自摸 + 全席位杠分净收支 (赢家自摸+3*底码，输家各付底码，并结清所有明杠/暗杠点数)
  const netCoinsPerSeat = [0, 0, 0, 0];
  for (let s = 0; s < 4; s++) {
    const zimoDelta = s === winnerSeat ? payoutPerOpponent * 3 : -payoutPerOpponent;
    netCoinsPerSeat[s] = zimoDelta + seatKongScores.value[s];
  }

  // 本席玩家 (seat 0) 实际总盈亏 (如明杠得10分，对手自摸50分，则本席实输 -50 + 10 = -40分)
  const rewardCoins = netCoinsPerSeat[0];
  let totalWon = netCoinsPerSeat[winnerSeat];
  let kongBonusTotal = Math.max(0, seatKongScores.value[0]);
  const opponentPayouts = [0, 0, 0];
  const oppNames = ['东席', '北席', '西席'];

  if (isPlayer) {
    // 玩家自己自摸和牌
    for (let i = 0; i < 3; i++) {
      const oppSeat = i + 1;
      const actualLoss = Math.max(0, -netCoinsPerSeat[oppSeat]);
      opponentPayouts[i] = actualLoss;
      if (seatKongScores.value[oppSeat] < 0) {
        fansList.push(`杠牌加成 (${oppNames[i]}被杠多输${-seatKongScores.value[oppSeat]}分)`);
      }
    }
    if (seatKongScores.value[0] > 0) {
      fansList.push(`本席杠牌进账 (+${seatKongScores.value[0]}分)`);
    }
  } else {
    // 其他玩家自摸和牌
    for (let i = 0; i < 3; i++) {
      const oppSeat = i + 1;
      if (oppSeat === winnerSeat) {
        opponentPayouts[i] = netCoinsPerSeat[oppSeat]; // 自摸赢家实赢总分
      } else {
        opponentPayouts[i] = Math.max(0, -netCoinsPerSeat[oppSeat]); // 输家实输总分 (含被杠多输)
      }
    }

    // 将玩家杠分收益与冲抵明细加入 fansList 供弹窗清晰展示
    if (seatKongScores.value[0] > 0) {
      for (const rec of kongRecords.value) {
        if (rec.includes('您')) {
          fansList.push(rec);
        }
      }
      const myGrossLoss = payoutPerOpponent;
      const myNetLoss = -rewardCoins;
      fansList.push(`自摸本输${myGrossLoss}分，冲抵杠分+${seatKongScores.value[0]}分，实输${myNetLoss}分`);
    } else if (seatKongScores.value[0] < 0) {
      fansList.push(`被杠扣除${-seatKongScores.value[0]}分，冲抵后实输${-rewardCoins}分`);
    }

    // 记录被玩家杠的对手多输分
    for (let i = 0; i < 3; i++) {
      const oppSeat = i + 1;
      if (oppSeat !== winnerSeat && seatKongScores.value[oppSeat] < 0) {
        fansList.push(`【${oppNames[i]}】被杠多输${-seatKongScores.value[oppSeat]}分 (实输${-netCoinsPerSeat[oppSeat]}分)`);
      }
    }
  }

  winningBreakdown.value = {
    fans: fansList,
    totalFan: 1 + hitCount,
    rewardCoins,
    maCount,
    rewardMaTiles,
    hitMaCount: hitCount,
    payoutPerOpponent,
    isFourHongzhong: fourHzWin,
    kongBonusTotal,
    opponentPayouts,
    winnerSeat,
  };

  lastWinnerSeat.value = winnerSeat;

  soundFX.playVictory();
  if (isPlayer) {
    haptics.sealStamp();
    haptics.victory();
  }
  emit('fx', 'hu');

  if (fourHzWin) {
    soundFX.speakAction(isPlayer ? '摸到四张红中！天降大满贯！' : `${winnerName}摸到四张红中胡牌！`);
    tipMessage.value = `🀄 【${winnerName}】摸到四张红中！${baseCodes === 6 ? '六码全中各得70分共210分' : '十码全中各得110分共330分'}，直接结束游戏！`;
  } else {
    if (isPlayer) {
      soundFX.speakAction('zimo', { text: '自摸！胡了！' });
    } else {
      soundFX.speakAction('zimo', { text: `${winnerName}自摸胡牌！` });
    }
    tipMessage.value = `🀄 【${winnerName}】自摸和出！斩获 ${hitCount} 码！`;
  }

  emit('move', {
    action: 'hu',
    winner: winnerSeat,
    fan: 1 + hitCount,
    rewardCoins,
    payoutPerOpponent,
    detail: fourHzWin
      ? `${winnerName}摸到四张红中结束游戏 (${baseCodes === 6 ? '70分/各家' : '110分/各家'})`
      : `${winnerName}自摸和牌 (奖${maCount}码中${hitCount}码)`,
  });

  drawTable();
}


function drawTable() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = 680;
  const height = 430;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background Mahjong Table Felt with spotlight illumination
  const highlight = props.tableTheme?.highlightColor || '#FFFFFF';
  const felt = props.tableTheme?.feltColor || '#ECEFF1';
  const edge = props.tableTheme?.edgeColor || '#CFD8DC';

  const grad = ctx.createRadialGradient(width / 2, height / 2 - 20, 20, width / 2, height / 2, 430);
  grad.addColorStop(0, highlight);
  grad.addColorStop(0.35, felt);
  grad.addColorStop(0.85, edge);
  grad.addColorStop(1, edge);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle luxury table felt inner rim (bright amethyst pinstripe border)
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 0);
  ctx.stroke();

  // Subtle ambient table spotlight ellipse
  const spotGrad = ctx.createRadialGradient(width / 2, height / 2 - 20, 0, width / 2, height / 2 - 20, 260);
  spotGrad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  spotGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
  spotGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = spotGrad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // Helper: Draw Oval Avatar for Mahjong Opponent Players
  const drawOvalOpponentAvatar = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    avatarEmoji: string,
    seatName: string,
    count: number,
    color: string,
    isActive: boolean,
    orientation: 'horizontal' | 'vertical',
    isDealer = false
  ) => {
    ctx.save();

    // Active breathing / glowing aura
    if (isActive) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
    } else {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
    }

    // Oval background matching the border color (Blue for North, Red for West, Green for East)
    const grad = ctx.createRadialGradient(cx, cy - ry * 0.25, 4, cx, cy, Math.max(rx, ry));
    if (color === '#3B82F6') {
      // 蓝色背景 (北席 - 边框同色系 #3B82F6)
      grad.addColorStop(0, isActive ? '#3B82F6' : '#2563EB');
      grad.addColorStop(0.55, '#1D4ED8');
      grad.addColorStop(1, '#172554');
    } else if (color === '#EF4444') {
      // 红色背景 (西席 - 边框同色系 #EF4444)
      grad.addColorStop(0, isActive ? '#EF4444' : '#DC2626');
      grad.addColorStop(0.55, '#B91C1C');
      grad.addColorStop(1, '#450A0A');
    } else if (color === '#10B981') {
      // 绿色背景 (东席 - 边框同色系 #10B981)
      grad.addColorStop(0, isActive ? '#10B981' : '#059669');
      grad.addColorStop(0.55, '#047857');
      grad.addColorStop(1, '#022C22');
    } else {
      grad.addColorStop(0, color);
      grad.addColorStop(1, '#110C09');
    }

    ctx.fillStyle = grad;
    ctx.strokeStyle = isActive ? '#FFFFFF' : color;
    ctx.lineWidth = isActive ? 2.5 : 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Reset shadow for crisp text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Inner subtle pinstripe rim
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx - 3), Math.max(1, ry - 3), 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();



    if (orientation === 'horizontal') {
      // Horizontal Oval (North / Seat 2 at top)
      const avatarR = 14;
      const avatarCx = cx - rx + avatarR + 6;
      const avatarCy = cy;

      // Circle avatar icon badge
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(avatarEmoji, avatarCx, avatarCy + 1);

      // Name & Tile Count
      const textX = cx + 10;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(seatName, textX, cy - 6);

      ctx.fillStyle = '#FEF08A';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`${count}张${isActive ? ' ⏳' : ''}`, textX, cy + 7);
    } else {
      // Vertical Oval (West / Seat 3 on left and East / Seat 1 on right)
      const avatarR = 14;
      const avatarCx = cx;
      const avatarCy = cy - ry + avatarR + 6;

      // Circle avatar icon badge
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(avatarEmoji, avatarCx, avatarCy + 1);

      // Seat Name
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(seatName, cx, cy + 5);

      // Count
      ctx.fillStyle = '#FEF08A';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`${count}张${isActive ? ' ⏳' : ''}`, cx, cy + 18);
    }

    ctx.restore();
  };

  // 1. Top: North (顶部玩家: 蓝色椭圆头像)
  const northCount = dealingPhase.value === 'dealing_tiles'
    ? oppHandsDealtCount.value[1]
    : (dealingPhase.value === 'rolling_dice' ? 0 : oppCounts.value[1]);
  drawOvalOpponentAvatar(
    width / 2,
    26,
    52,
    22,
    '🧓',
    '北席',
    northCount,
    '#3B82F6',
    turnPlayer.value === 2 && dealingPhase.value === 'playing',
    'horizontal',
    dealerSeat.value === 2
  );

  // 牌墙横幅：显示在顶部头像左边
  const wallBoxW = 90;
  const wallBoxH = 26;
  const wallBoxX = width / 2 - 52 - wallBoxW - 10;
  const wallBoxY = 13;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(wallBoxX, wallBoxY, wallBoxW, wallBoxH, 13);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`🀄 牌墙 ${wallCount.value}张`, wallBoxX + wallBoxW / 2, wallBoxY + wallBoxH / 2);
  ctx.restore();

  // 倒计时：显示在顶部头像右边
  const cdBoxW = 76;
  const cdBoxH = 26;
  const cdBoxX = width / 2 + 52 + 10;
  const cdBoxY = 13;

  const isLowTime = turnCountdown.value <= 5 && turnPlayer.value === 0 && dealingPhase.value === 'playing';
  ctx.save();
  if (isLowTime) {
    ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
    ctx.shadowBlur = 8;
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = 1.2;
  }
  ctx.beginPath();
  ctx.roundRect(cdBoxX, cdBoxY, cdBoxW, cdBoxH, 13);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isLowTime ? '#FFFFFF' : '#FDE047';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cdText = dealingPhase.value !== 'playing'
    ? '🎲 发牌中'
    : (isClaiming.value
      ? `⏱️ ${claimCountdown.value}s`
      : (turnPlayer.value === 0 ? `⏱️ ${turnCountdown.value}s` : '⏱️ 思考中'));
  ctx.fillText(cdText, cdBoxX + cdBoxW / 2, cdBoxY + cdBoxH / 2);
  ctx.restore();

  // 2. Left: West (左玩家: 红色椭圆头像)
  const westCount = dealingPhase.value === 'dealing_tiles'
    ? oppHandsDealtCount.value[2]
    : (dealingPhase.value === 'rolling_dice' ? 0 : oppCounts.value[2]);
  drawOvalOpponentAvatar(
    30,
    90,
    22,
    42,
    '🧔',
    '西席',
    westCount,
    '#EF4444',
    turnPlayer.value === 3 && dealingPhase.value === 'playing',
    'vertical',
    dealerSeat.value === 3
  );

  // 3. Right: East (右玩家: 绿色椭圆头像)
  const eastCount = dealingPhase.value === 'dealing_tiles'
    ? oppHandsDealtCount.value[0]
    : (dealingPhase.value === 'rolling_dice' ? 0 : oppCounts.value[0]);
  drawOvalOpponentAvatar(
    width - 30,
    90,
    22,
    42,
    '🧑',
    '东席',
    eastCount,
    '#10B981',
    turnPlayer.value === 1 && dealingPhase.value === 'playing',
    'vertical',
    dealerSeat.value === 1
  );

  // Discard Pool (凸字形样式：上部宽 560px 紧贴顶部头像底部，下部向左右延伸至 644px，底部显示三个玩家碰牌)
  const neckLeft = 60;
  const neckRight = width - 60; // 620
  const topY = 48; // 紧贴顶部头像底部 (26 + 22 = 48)
  const stepY = 134; // 左右头像底部下方 (90 + 42 = 132)
  const bodyLeft = 18; // 移除碰牌显示区后向左延伸
  const bodyRight = width - 18; // 662，移除碰牌显示区后向右延伸
  const bottomY = 179; // 弃牌框在第四行底部切割截断 (四行容量 21+21+21+24=87 张)

  // 绘制凸字形路径 (圆润外角 + 紧凑内角)
  const traceConvexPath = (c: CanvasRenderingContext2D, r = 5) => {
    c.beginPath();
    // 顶部凸颈 (Neck)
    c.moveTo(neckLeft + r, topY);
    c.lineTo(neckRight - r, topY);
    c.arcTo(neckRight, topY, neckRight, topY + r, r);

    // 右侧颈部向下延伸至内转角
    c.lineTo(neckRight, stepY - 2);
    c.arcTo(neckRight, stepY, neckRight + 2, stepY, 2);

    // 右肩水平向右延伸
    c.lineTo(bodyRight - r, stepY);
    c.arcTo(bodyRight, stepY, bodyRight, stepY + r, r);

    // 右下身垂直向下至第四行底部
    c.lineTo(bodyRight, bottomY - r);
    c.arcTo(bodyRight, bottomY, bodyRight - r, bottomY, r);

    // 底部水平边向左
    c.lineTo(bodyLeft + r, bottomY);
    c.arcTo(bodyLeft, bottomY, bodyLeft, bottomY - r, r);

    // 左下身垂直向上
    c.lineTo(bodyLeft, stepY + r);
    c.arcTo(bodyLeft, stepY, bodyLeft + r, stepY, r);

    // 左肩水平向右延伸至内转角
    c.lineTo(neckLeft - 2, stepY);
    c.arcTo(neckLeft, stepY, neckLeft, stepY - 2, 2);

    // 左侧颈部向上回到顶部
    c.lineTo(neckLeft, topY + r);
    c.arcTo(neckLeft, topY, neckLeft + r, topY, r);
    c.closePath();
  };

  // 弃牌框边框线全透明：不绘制外边框线与底框，弃牌自然清透地悬浮于桌布之上

  // 弃牌区磁贴排布：4行自适应排满（21 + 21 + 21 + 24 = 87 张，完全满足全场弃牌需求）
  const tileW = 23;
  const tileH = 31;
  const gapX = 3;
  const gapY = 1;

  interface RiverRowConfig {
    ry: number;
    capacity: number;
    startX: number;
  }
  const rowConfigs: RiverRowConfig[] = [];
  let curY = 50;
  for (let r = 0; r < 4; r++) {
    const ry = curY;
    const isNeck = ry < stepY;
    const minX = isNeck ? neckLeft : bodyLeft;
    const maxX = isNeck ? neckRight : bodyRight;
    const availW = (maxX - minX) - 16;
    const capacity = Math.floor((availW + gapX) / (tileW + gapX));
    const actualW = capacity * tileW + (capacity - 1) * gapX;
    const startX = minX + Math.floor(((maxX - minX) - actualW) / 2);
    rowConfigs.push({ ry, capacity, startX });
    curY += tileH + gapY;
  }

  // 21 + 21 + 21 + 24 = 87 张
  const visibleDiscards = discards.value.slice(-87);

  if (visibleDiscards.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.font = '500 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无弃牌', width / 2, 114);
  } else {
    let tileIndex = 0;
    for (let r = 0; r < rowConfigs.length && tileIndex < visibleDiscards.length; r++) {
      const config = rowConfigs[r];
      for (let c = 0; c < config.capacity && tileIndex < visibleDiscards.length; c++) {
        const tile = visibleDiscards[tileIndex];
        const rx = config.startX + c * (tileW + gapX);
        const ry = config.ry;

        renderMahjongTile(ctx, tile, rx, ry, tileW, tileH, {
          isSmall: true,
        });

        if (tileIndex === visibleDiscards.length - 1) {
          ctx.save();
          ctx.strokeStyle = '#FDE047';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.roundRect(rx - 0.5, ry - 0.5, tileW + 1, tileH + 1, 3);
          ctx.stroke();
          ctx.restore();
        }

        tileIndex++;
      }
    }
  }

  // 三个玩家碰牌展示区：横幅底板与标签完全透明，不显示“暂无碰牌”，哪位玩家碰牌了才动态展示其标签与牌张
  const activeOpponents: { label: string; color: string; melds: MahjongTile[][] }[] = [];
  if (oppMelds.value[2].length > 0) {
    activeOpponents.push({ label: '西席碰牌', color: '#EF4444', melds: oppMelds.value[2] });
  }
  if (oppMelds.value[1].length > 0) {
    activeOpponents.push({ label: '北席碰牌', color: '#3B82F6', melds: oppMelds.value[1] });
  }
  if (oppMelds.value[0].length > 0) {
    activeOpponents.push({ label: '东席碰牌', color: '#10B981', melds: oppMelds.value[0] });
  }

  const oppTileW = 23;
  const oppTileH = 31;
  const meldBaseY = 186;
  const rowSpacing = 36;

  activeOpponents.forEach((opp, rowIdx) => {
    const rowY = meldBaseY + rowIdx * rowSpacing;
    const labelX = bodyLeft + 8; // x = 26

    // 全透明标签：无底色、无外框，仅以纯粹高清色字与柔光呈现
    ctx.save();
    ctx.shadowColor = opp.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = opp.color;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(opp.label, labelX, rowY + oppTileH / 2);
    ctx.restore();

    // 碰/杠的牌（与弃牌池相同尺寸 23x31）
    const tilesStartX = labelX + 62;
    let curX = tilesStartX;
    opp.melds.forEach((set) => {
      set.forEach((t) => {
        renderMahjongTile(ctx, t, curX, rowY, oppTileW, oppTileH, {
          isSmall: true,
          borderColor: opp.color,
          borderWidth: 1.5,
        });
        curX += oppTileW + 2;
      });
      curX += 8; // 副与副之间的清晰间隔
    });
  });

  // Coordinated Non-overlapping Layout: Left Melded Sets (碰牌 / 杠牌亮副) + Hand Tiles
  const handLen = dealingPhase.value === 'playing' || dealingPhase.value === 'sorting_tiles'
    ? myHand.value.length
    : (dealerSeat.value === 0 ? 14 : 13);
  const handTileW = 38;
  const handTileH = 56;
  const gap = 3;
  const hasDrawn14 = (myHand.value.length % 3 === 2) || (dealerSeat.value === 0 && dealingPhase.value !== 'playing');
  const drawnOffset = hasDrawn14 ? 14 : 0;
  const handTotalW = handLen > 0 ? (handLen * handTileW + (handLen - 1) * gap + drawnOffset) : 0;

  const meldTileW = 28;
  const meldTileH = 40;
  const meldGap = 2;
  const meldSetGap = 12;
  const meldsToHandGap = 18;
  const meldStartX = 24;

  let totalMeldsW = 0;
  if (meldedTiles.value.length > 0) {
    meldedTiles.value.forEach((set, sIdx) => {
      totalMeldsW += set.length * meldTileW + (set.length - 1) * meldGap;
      if (sIdx < meldedTiles.value.length - 1) totalMeldsW += meldSetGap;
    });
  }

  // Left side is used for melded tiles (碰/杠牌); hand is placed to the right of melds
  let handStartX = 24;
  if (totalMeldsW > 0) {
    handStartX = meldStartX + totalMeldsW + meldsToHandGap;
  } else {
    handStartX = Math.max(20, Math.floor((width - handTotalW) / 2));
  }
  const baseY = height - 142; // 288，与向下延伸至 298 的弃牌框保持 14px 纯净间隙



  // 1. Draw Melded Sets on the LEFT (左边放碰的牌 / 杠的牌)
  if (meldedTiles.value.length > 0) {
    let meldOffsetX = meldStartX;
    const meldY = baseY + 40 + (handTileH - meldTileH);

    // Label above melded tiles
    ctx.save();
    ctx.fillStyle = '#CBD5E1';
    ctx.font = '600 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('亮副 (碰/杠):', meldStartX, meldY - 5);
    ctx.restore();

    meldedTiles.value.forEach((set) => {
      set.forEach((t) => {
        renderMahjongTile(ctx, t, meldOffsetX, meldY, meldTileW, meldTileH, { isSmall: true });
        meldOffsetX += meldTileW + meldGap;
      });
      meldOffsetX += meldSetGap - meldGap;
    });

    // Decorative separator line between melded tiles and hand
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(handStartX - 10, baseY + 36);
    ctx.lineTo(handStartX - 10, baseY + 40 + handTileH);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Draw Hand Tiles (with phases: rolling_dice -> dealing_tiles -> sorting_tiles -> playing)
  if (dealingPhase.value === 'rolling_dice') {
    // 打色子阶段：桌前整洁，手牌不显示
  } else if (dealingPhase.value === 'dealing_tiles') {
    // 抓牌要牌阶段：牌背朝上发牌，展示翠绿麻将牌背
    const dealtLen = myHandDealtCount.value;
    const isDealerWith14 = dealerSeat.value === 0;
    for (let idx = 0; idx < dealtLen; idx++) {
      const isDrawn14 = idx === 13 && isDealerWith14;
      const extraOffset = isDrawn14 ? 14 : 0;
      const tx = handStartX + idx * (handTileW + gap) + extraOffset;
      const ty = baseY + 40;
      renderMahjongTileBack(ctx, tx, ty, handTileW, handTileH);
    }
  } else if (dealingPhase.value === 'sorting_tiles') {
    // 理牌翻面动效 (牌背收缩 -> 牌面展开)
    const p = handFlipProgress.value;
    myHand.value.forEach((t, idx) => {
      const isDrawn14 = idx === handLen - 1 && hasDrawn14;
      const extraOffset = isDrawn14 ? 14 : 0;
      const tx = handStartX + idx * (handTileW + gap) + extraOffset;
      const ty = baseY + 40;

      if (p < 0.5) {
        const scaleY = 1 - p * 2;
        renderMahjongTileBack(ctx, tx, ty, handTileW, handTileH, { scaleY });
      } else {
        const scaleY = (p - 0.5) * 2;
        renderMahjongTile(ctx, t, tx, ty, handTileW, handTileH, { scaleY });
      }
    });
  } else {
    // 对战进行中：明亮清晰的整副手牌
    myHand.value.forEach((t, idx) => {
      const isSel = selectedIndex.value === idx;
      const isDrawn14 = idx === handLen - 1 && hasDrawn14;
      const extraOffset = isDrawn14 ? 14 : 0;

      const tx = handStartX + idx * (handTileW + gap) + extraOffset;
      const ty = isSel ? baseY + 40 - 16 : baseY + 40;

      renderMahjongTile(ctx, t, tx, ty, handTileW, handTileH, { isSelected: isSel });
    });
  }
}

function onCanvasClick(e: MouseEvent | PointerEvent) {
  if (dealingPhase.value !== 'playing') return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const { x, y } = getCanvasEventCoords(canvas, e.clientX, e.clientY, props.isRotated90);

  const handLen = myHand.value.length;
  const handTileW = 38;
  const handTileH = 56;
  const gap = 3;
  const hasDrawn14 = handLen % 3 === 2;
  const drawnOffset = hasDrawn14 ? 14 : 0;
  const handTotalW = handLen > 0 ? (handLen * handTileW + (handLen - 1) * gap + drawnOffset) : 0;

  const meldTileW = 28;
  const meldGap = 2;
  const meldSetGap = 12;
  const meldsToHandGap = 18;
  const meldStartX = 24;

  let totalMeldsW = 0;
  if (meldedTiles.value.length > 0) {
    meldedTiles.value.forEach((set, sIdx) => {
      totalMeldsW += set.length * meldTileW + (set.length - 1) * meldGap;
      if (sIdx < meldedTiles.value.length - 1) totalMeldsW += meldSetGap;
    });
  }

  let handStartX = 24;
  if (totalMeldsW > 0) {
    handStartX = meldStartX + totalMeldsW + meldsToHandGap;
  } else {
    handStartX = Math.max(20, Math.floor((680 - handTotalW) / 2));
  }
  const baseY = 430 - 142; // 288，与 drawTable 严格同步，点击判定精准无偏差

  for (let i = 0; i < handLen; i++) {
    const isDrawn14 = i === handLen - 1 && hasDrawn14;
    const extraOffset = isDrawn14 ? 14 : 0;
    const tx = handStartX + i * (handTileW + gap) + extraOffset;

    if (x >= tx && x <= tx + handTileW && y >= baseY + 40 - 20 && y <= baseY + 40 + handTileH) {
      if (selectedIndex.value === i) {
        // Discard tile!
        if (turnPlayer.value !== 0 || myHand.value.length % 3 !== 2) return;
        stopTurnCountdown();
        const discarded = myHand.value.splice(i, 1)[0];
        discarded.discardBy = 0;
        myHand.value = sortHand(myHand.value);
        discards.value.push(discarded);
        lastDiscarded.value = discarded;
        soundFX.playMahjongClack();
        haptics.mahjongClack();
        selectedIndex.value = null;
        tipMessage.value = `打出了【${discarded.text}】到牌池`;
        soundFX.speakVoice(discarded.text);
        drawTable();
        emit('move', { action: 'discard', tile: discarded });

        // Trigger bot turns
        passTurnToNext(0);
        return;
      } else {
        selectedIndex.value = i;
        soundFX.playTap();
        haptics.tap();
        drawTable();
        return;
      }
    }
  }
}

function handleDraw() {
  if (myHand.value.length % 3 !== 1) return;
  if (wallPool.length === 0) {
    isDrawStalemate.value = true;
    hasClickedReady.value = false;
    stopTurnCountdown();
    drawTable();
    return;
  }
  const newTile = wallPool.shift()!;
  wallCount.value = wallPool.length;
  myHand.value.push(newTile);
  turnPlayer.value = 0;
  soundFX.playMahjongClack();
  haptics.mahjongClack();

  // 特殊规则：摸到四张红中直接结束游戏！
  if (isHongzhongMode.value && myHand.value.filter(isHongzhong).length === 4) {
    drawTable();
    triggerMahjongWin(0, true);
    return;
  }

  tipMessage.value = `摸到了【${newTile.text}】${isHongzhong(newTile) && isHongzhongMode.value ? '(红中百搭万能)' : ''}，请自摸胡牌或点击出牌`;
  drawTable();
  if (isAutoHost.value) {
    checkAutoHostTurn();
  } else {
    startTurnCountdown();
  }
}

function handleDiscardSelected() {
  if (selectedIndex.value === null || myHand.value.length % 3 !== 2 || turnPlayer.value !== 0 || dealingPhase.value !== 'playing') return;
  stopTurnCountdown();
  const discarded = myHand.value.splice(selectedIndex.value, 1)[0];
  discarded.discardBy = 0;
  myHand.value = sortHand(myHand.value);
  discards.value.push(discarded);
  lastDiscarded.value = discarded;
  soundFX.playMahjongClack();
  haptics.mahjongClack();
  selectedIndex.value = null;
  tipMessage.value = `打出了【${discarded.text}】到牌池`;
  soundFX.speakVoice(discarded.text);
  drawTable();
  emit('move', { action: 'discard', tile: discarded });
  passTurnToNext(0);
}

// 规则：可以碰 (他人出牌时，从手牌中拿出2张相同牌与他人弃牌组成明刻)
function handlePeng() {
  if (!canPeng.value || !lastDiscarded.value) return;
  stopClaimCountdown();
  if (botTimer) clearTimeout(botTimer);
  const d = lastDiscarded.value;
  const matches = myHand.value.filter((c) => c.type === d.type && c.value === d.value).slice(0, 2);

  if (matches.length === 2) {
    const rmIds = new Set(matches.map((c) => c.id));
    myHand.value = myHand.value.filter((c) => !rmIds.has(c.id));
    meldedTiles.value.push([...matches, d]);
    // Remove the claimed tile from discards so total tiles remain exact
    if (discards.value.length > 0 && discards.value[discards.value.length - 1].id === d.id) {
      discards.value.pop();
    }
    lastDiscarded.value = null;
    soundFX.playMahjongClack();
    haptics.sealStamp();
    soundFX.speakAction('peng');
    emit('fx', 'peng');
    tipMessage.value = `碰牌成功！碰进【${d.text}】亮刻，请打出一张牌`;
    turnPlayer.value = 0;
    selectedIndex.value = null;
    drawTable();
    if (isAutoHost.value) {
      checkAutoHostTurn();
    } else {
      startTurnCountdown();
    }
  }
}

// 规则：可以杠 (明杠、暗杠、补杠，杠后从牌墙末尾补一张牌入座)
function handleGang() {
  if (!canGang.value) return;
  stopClaimCountdown();
  if (botTimer) clearTimeout(botTimer);
  soundFX.playMahjongClack();
  haptics.sealStamp();
  soundFX.speakAction('gang');
  emit('fx', 'gang');

  let kongedOpponentSeat: number | null = null;
  let isAnOrBuGang = false;

  // Case 1: 明杠 (他人弃牌)
  if (lastDiscarded.value && turnPlayer.value !== 0) {
    const d = lastDiscarded.value;
    const matches = myHand.value.filter((c) => c.type === d.type && c.value === d.value);
    if (matches.length >= 3) {
      const takeThree = matches.slice(0, 3);
      const idsToRemove = new Set(takeThree.map((c) => c.id));
      myHand.value = myHand.value.filter((c) => !idsToRemove.has(c.id));
      meldedTiles.value.push([...takeThree, d]);
      if (discards.value.length > 0 && discards.value[discards.value.length - 1].id === d.id) {
        discards.value.pop();
      }
      kongedOpponentSeat = d.discardBy !== undefined ? d.discardBy : turnPlayer.value;
      lastDiscarded.value = null;
      turnPlayer.value = 0;
    }
  } else if (turnPlayer.value === 0) {
    // Case 2: 暗杠 (手牌中有4张完全相同的牌)
    const counts = new Map<string, MahjongTile[]>();
    myHand.value.forEach((c) => {
      const k = `${c.type}-${c.value}`;
      if (!counts.has(k)) counts.set(k, []);
      counts.get(k)!.push(c);
    });
    let foundAnGang = false;
    for (const tiles of counts.values()) {
      if (tiles.length === 4) {
        const ids = new Set(tiles.map((c) => c.id));
        myHand.value = myHand.value.filter((c) => !ids.has(c.id));
        meldedTiles.value.push(tiles);
        foundAnGang = true;
        isAnOrBuGang = true;
        break;
      }
    }

    // Case 3: 补杠 (将摸到的第4张牌加入已碰出的3张明刻中)
    if (!foundAnGang) {
      for (const meld of meldedTiles.value) {
        if (meld.length === 3 && meld[0].type === meld[1].type && meld[0].value === meld[1].value) {
          const matchIdx = myHand.value.findIndex((c) => c.type === meld[0].type && c.value === meld[0].value);
          if (matchIdx !== -1) {
            const addedTile = myHand.value.splice(matchIdx, 1)[0];
            meld.push(addedTile);
            isAnOrBuGang = true;
            break;
          }
        }
      }
    }
  }

  if (kongedOpponentSeat !== null && kongedOpponentSeat > 0 && kongedOpponentSeat <= 3) {
    playerKongExtra.value[kongedOpponentSeat - 1] += 10;
    seatKongScores.value[0] += 10;
    seatKongScores.value[kongedOpponentSeat] -= 10;
    kongRecords.value.push(`您明杠【${SEAT_NAMES[kongedOpponentSeat]}】得10分 (${SEAT_NAMES[kongedOpponentSeat]}多输10分)`);
  }
  if (isAnOrBuGang) {
    for (let i = 0; i < 3; i++) {
      playerKongExtra.value[i] += 10;
      seatKongScores.value[i + 1] -= 10;
    }
    seatKongScores.value[0] += 30;
    kongRecords.value.push('您暗杠/补杠各得三家10分 (+30分，三家各多输10分)');
  }

  // 杠后从牌墙末尾补一张牌入座 (杠上自摸机会)
  if (wallPool.length > 0) {
    const supp = wallPool.pop()!;
    wallCount.value = wallPool.length;
    myHand.value.push(supp);
    myHand.value = sortHand(myHand.value);

    // 杠后摸到第4张红中直接胡牌结束游戏！
    if (isHongzhongMode.value && myHand.value.filter(isHongzhong).length === 4) {
      drawTable();
      triggerMahjongWin(0, true);
      return;
    }

    tipMessage.value = `杠牌成功！补得【${supp.text}】，请自摸胡牌或出牌`;
  } else {
    tipMessage.value = '杠牌成功！牌墙已空，请打出一张牌';
  }

  selectedIndex.value = null;
  drawTable();
  if (isAutoHost.value) {
    checkAutoHostTurn();
  } else {
    startTurnCountdown();
  }
}

// 规则：仅自摸胡牌 (不可炮胡)，调用统一结算函数
function handleHu() {
  if (!canHu.value) return;
  const isFourHz = isHongzhongMode.value && myHand.value.filter(isHongzhong).length === 4;
  triggerMahjongWin(0, isFourHz);
}

let botTimer: any = null;

function runOpponentTurns() {
  passTurnToNext(0);
}

function passTurnToNext(fromSeat: number) {
  stopTurnCountdown();
  stopClaimCountdown();
  if (botTimer) clearTimeout(botTimer);
  if (hasWon.value || isDrawStalemate.value) return;

  const nextSeat = (fromSeat + 1) % 4;

  if (nextSeat === 0) {
    // 轮到玩家回合
    waitForPlayerClaim(() => {
      if (hasWon.value || isDrawStalemate.value) return;
      turnPlayer.value = 0;
      handleDraw();
    });
  } else {
    // 轮到电脑玩家回合
    waitForPlayerClaim(() => {
      if (hasWon.value || isDrawStalemate.value) return;
      turnPlayer.value = nextSeat;
      drawTable();
      const thinkTime = Math.floor(400 + Math.random() * 400);
      botTimer = setTimeout(() => {
        botPlay(nextSeat, () => {
          passTurnToNext(nextSeat);
        });
      }, thinkTime);
    });
  }
}

function botPlay(seat: number, next: () => void) {
  const botIdx = seat - 1; // 0=East, 1=North, 2=West
  const botHand = oppHands.value[botIdx] || [];

  // Check if bot can Peng the last discarded tile (if any)
  if (lastDiscarded.value) {
    const d = lastDiscarded.value;
    // 红中模式下不可碰红中
    const canPengTile = !(isHongzhongMode.value && isHongzhong(d));
    const matches = botHand.filter(c => c.type === d.type && c.value === d.value);
    const seatNames = ['东席(右)', '北席(上)', '西席(左)'];
    if (canPengTile && matches.length >= 2 && Math.random() < 0.98) {
      const takeTwo = matches.slice(0, 2);
      const rmIds = new Set(takeTwo.map(c => c.id));
      oppHands.value[botIdx] = botHand.filter(c => !rmIds.has(c.id));
      oppMelds.value[botIdx].push([...takeTwo, d]);
      if (discards.value.length > 0 && discards.value[discards.value.length - 1].id === d.id) {
        discards.value.pop();
      }
      lastDiscarded.value = null;
      soundFX.playMahjongClack();
      soundFX.speakAction('peng', { isFemale: botIdx === 1 });
      emit('fx', 'peng');
      tipMessage.value = `🀄 【${SEAT_NAMES[seat]}】大喊：碰！拿下了【${d.text}】`;
      drawTable();

      // Pause 1.2s so user clearly sees the player penging before discarding
      setTimeout(() => {
        const updatedHand = oppHands.value[botIdx];
        const bestDiscardIdx = findSmartBestDiscard(updatedHand);
        const [discarded] = updatedHand.splice(bestDiscardIdx, 1);
        discarded.discardBy = seat;
        oppHands.value[botIdx] = sortHand(updatedHand);

        discards.value.push(discarded);
        lastDiscarded.value = discarded;
        soundFX.playMahjongClack();
        soundFX.speakVoice(discarded.text);
        tipMessage.value = `🀄 【${SEAT_NAMES[seat]}】碰后打出了【${discarded.text}】`;
        drawTable();
        next();
      }, 1100);
      return;
    }
  }

  // 1. 摸牌判断：仅在手牌为 3k+1 张（如13张）时从牌墙摸1张牌入座；
  // 若是庄家起手开牌或碰杠后已持有 14 张（3k+2），则直接出牌不额外摸牌！
  if (botHand.length % 3 === 1) {
    if (wallPool.length === 0) {
      isDrawStalemate.value = true;
      stopTurnCountdown();
      stopClaimCountdown();
      tipMessage.value = '牌墙已摸空，荒牌流局！';
      drawTable();
      return;
    }
    const drawn = wallPool.shift()!;
    wallCount.value = wallPool.length;
    botHand.push(drawn);
  }

  // 规则：摸到四张红中直接结束游戏！
  if (isHongzhongMode.value && botHand.filter(isHongzhong).length === 4) {
    triggerMahjongWin(seat, true);
    return;
  }

  // Check if bot completed a winning hand by self-draw (自摸和牌)
  const botCanHu = isHongzhongMode.value ? checkHongzhongWin(botHand) : checkMahjongWin(botHand);
  if (botCanHu) {
    triggerMahjongWin(seat, false);
    return;
  }

  // Check for AnGang (4 identical tiles in hand)
  const counts = new Map<string, MahjongTile[]>();
  botHand.forEach(c => {
    const k = `${c.type}-${c.value}`;
    if (!counts.has(k)) counts.set(k, []);
    counts.get(k)!.push(c);
  });
  for (const tiles of counts.values()) {
    if (tiles.length === 4) {
      const ids = new Set(tiles.map(c => c.id));
      const remainingHand = botHand.filter(c => !ids.has(c.id));
      oppMelds.value[botIdx].push(tiles);
      if (wallPool.length > 0) {
        const supp = wallPool.shift()!;
        wallCount.value = wallPool.length;
        remainingHand.push(supp);
      }
      oppHands.value[botIdx] = sortHand(remainingHand);
      break;
    }
  }

  // 2. Pro-level AI selection using findSmartBestDiscard
  const currentBotHand = oppHands.value[botIdx];
  const bestDiscardIdx = findSmartBestDiscard(currentBotHand);
  const [discarded] = currentBotHand.splice(bestDiscardIdx, 1);
  discarded.discardBy = seat;
  oppHands.value[botIdx] = sortHand(currentBotHand);

  // 3. Discarded tile is placed into river
  discards.value.push(discarded);
  lastDiscarded.value = discarded;
  soundFX.playMahjongClack();
  soundFX.speakVoice(discarded.text);
  tipMessage.value = `${['东席', '北席', '西席'][seat - 1]} 打出了【${discarded.text}】`;
  drawTable();
  next();
}

let cleanupMahjongLoader: (() => void) | null = null;

onMounted(() => {
  preloadMahjongAssets();
  cleanupMahjongLoader = onMahjongAssetsLoaded(() => {
    drawTable();
  });
  dealNewMatch();
  updateDimensions();
  window.addEventListener('resize', updateDimensions);
  if (containerRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(containerRef.value);
  }
});

onBeforeUnmount(() => {
  cleanupMahjongLoader?.();
  window.removeEventListener('resize', updateDimensions);
  resizeObserver?.disconnect();
  cleanDealingTimers();
  stopTurnCountdown();
  stopClaimCountdown();
  if (autoHostTimer) clearTimeout(autoHostTimer);
  if (botTimer) clearTimeout(botTimer);
});
</script>

<style scoped>
/* Scoped custom styling handled inside sub-components */
</style>
