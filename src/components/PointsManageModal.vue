<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-start sm:items-center justify-center p-2 sm:p-4 select-none overflow-hidden">
      <!-- Modal Box: Flex Column with Docked Fixed Action Footer -->
      <div
        class="w-full max-w-[480px] max-h-[96vh] sm:max-h-[88vh] flex flex-col rounded-2xl sm:rounded-3xl bg-[#EFE5D3] border border-[#D8C7B0] shadow-2xl overflow-hidden relative text-[#3C2C1E]"
      >
        <!-- 1. Top Header Bar (Fixed / Shrink-0) -->
        <header class="flex items-center justify-between px-3.5 py-2.5 sm:px-5 sm:py-3 border-b border-[#D8C7B0] shrink-0 gap-2 bg-[#FAF4E8]">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-[#EFE5D3] border border-[#D8C7B0] flex items-center justify-center text-base text-[#3C2C1E] shadow-inner shrink-0">
              🪙
            </div>
            <div class="min-w-0">
              <h3 class="text-sm sm:text-base font-bold text-[#3C2C1E] font-serif-title leading-tight truncate">
                钱庄与积分管理
              </h3>
              <p class="text-[10px] sm:text-[11px] text-[#6B5744] leading-none mt-0.5 truncate">
                可用结余: <strong class="text-[#5C4533] font-mono font-bold">{{ userCoins.toLocaleString() }} 分</strong>
                <span class="ml-1 text-[#8C755E]">· LV.{{ userLevel }}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            @click="$emit('close')"
            class="w-7 h-7 rounded-full bg-[#EFE5D3] hover:bg-[#E5D7C2] border border-[#D8C7B0] flex items-center justify-center text-xs text-[#3C2C1E] transition-colors cursor-pointer shrink-0"
            title="关闭钱庄"
          >
            ✕
          </button>
        </header>

        <!-- 2. Navigation Tabs (Fixed / Shrink-0) -->
        <nav class="flex items-center gap-1.5 px-3.5 pt-2 pb-1 sm:px-5 bg-[#FAF4E8] shrink-0">
          <div class="flex items-center gap-1 p-1 bg-[#EFE5D3] rounded-xl border border-[#D8C7B0] w-full">
            <button
              type="button"
              @click="activeTab = 'transfer'"
              :class="activeTab === 'transfer' ? 'bg-gradient-to-r from-[#5C4533] to-[#433022] text-[#FAF4E8] font-bold shadow-md' : 'text-[#6B5744] hover:text-[#3C2C1E]'"
              class="flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
            >
              <span>🎁</span>
              <span class="truncate">手机号筹码互赠</span>
            </button>

            <button
              type="button"
              @click="activeTab = 'history'"
              :class="activeTab === 'history' ? 'bg-gradient-to-r from-[#5C4533] to-[#433022] text-[#FAF4E8] font-bold shadow-md' : 'text-[#6B5744] hover:text-[#3C2C1E]'"
              class="flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
            >
              <span>📜</span>
              <span class="truncate">流水账册 ({{ transactions.length }})</span>
            </button>
          </div>
        </nav>

        <!-- 3. Scrollable Content Body (Middle Area) -->
        <main class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-3.5 py-2 sm:px-5 space-y-2.5 overscroll-contain">
          <!-- ======================================================== -->
          <!-- TAB 1: 手机号筹码互赠 (TRANSFER)                          -->
          <!-- ======================================================== -->
          <div v-if="activeTab === 'transfer'" class="space-y-2.5 py-0.5">
            <!-- Section A: 查找接收人 (紧凑高密度布局) -->
            <div class="p-2.5 sm:p-3 rounded-2xl bg-[#FFFDF8] border border-[#D8C7B0] space-y-2 shadow-xs">
              <div class="text-[11px] font-bold text-[#3C2C1E] flex items-center justify-between">
                <span class="flex items-center gap-1">
                  <span>🔍</span> 查找茶友手机号
                </span>
                <span class="text-[10px] text-[#6B5744] font-normal">支持精确匹配与转账</span>
              </div>

              <div class="flex items-center gap-2">
                <input
                  v-model="searchPhone"
                  type="tel"
                  inputmode="numeric"
                  placeholder="输入接收人手机号 (如 13912345678)..."
                  class="flex-1 px-3 py-1.5 text-xs rounded-xl bg-[#FFFDF8] border border-[#D8C7B0] text-[#3C2C1E] focus:outline-none focus:border-[#5C4533] font-mono shadow-inner"
                  @keydown.enter="searchUser"
                />
                <button
                  type="button"
                  @click="searchUser"
                  :disabled="isSearching"
                  class="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-[#5C4533] to-[#433022] hover:from-[#4E3929] hover:to-[#38271A] text-[#FAF4E8] border border-[#7D6049] shadow-md active:scale-95 transition-all cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {{ isSearching ? '查找中...' : '查找茶友' }}
                </button>
              </div>

              <div v-if="searchError" class="text-[11px] text-red-700 font-medium">
                {{ searchError }}
              </div>

              <!-- Recipient Preview Card -->
              <div v-if="searchedUser" class="p-2 rounded-xl bg-[#FAF4E8] border border-[#D8C7B0] flex items-center justify-between">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-xl p-1 rounded-lg bg-[#EFE5D3] border border-[#D8C7B0] shrink-0">{{ searchedUser.avatar || '👤' }}</span>
                  <div class="min-w-0">
                    <div class="text-xs font-bold text-[#3C2C1E] flex items-center gap-1.5 truncate">
                      <span class="truncate">{{ searchedUser.name }}</span>
                      <span class="text-[9px] px-1 py-0.2 rounded bg-[#EFE5D3] text-[#3C2C1E] font-mono shrink-0 border border-[#D8C7B0]">LV.{{ searchedUser.level || 1 }}</span>
                    </div>
                    <div class="text-[10px] text-[#6B5744] font-mono mt-0.5 truncate">手机号: {{ searchedUser.phone }}</div>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <div class="text-[9px] text-[#6B5744]">对方结余</div>
                  <div class="text-xs font-mono font-bold text-[#5C4533]">{{ searchedUser.coins }} 分</div>
                </div>
              </div>
            </div>

            <!-- Section B: 转账数量设定 (紧凑单行预设) -->
            <div class="p-2.5 sm:p-3 rounded-2xl bg-[#FFFDF8] border border-[#D8C7B0] space-y-2 shadow-xs">
              <div class="text-[11px] font-bold text-[#3C2C1E] flex items-center justify-between">
                <span class="flex items-center gap-1">
                  <span>💸</span> 赠送筹码数量
                </span>
                <span class="text-[10px] text-[#6B5744] font-mono">
                  可用: <strong class="text-[#5C4533]">{{ userCoins.toLocaleString() }} 分</strong>
                </span>
              </div>

              <!-- Presets -->
              <div class="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
                <button
                  v-for="amt in [100, 500, 1000, 5000]"
                  :key="amt"
                  type="button"
                  @click="transferAmount = amt"
                  :class="transferAmount === amt ? 'bg-[#5C4533] text-[#FAF4E8] font-bold border-[#7D6049]' : 'bg-[#EFE5D3] text-[#3C2C1E] border-[#D8C7B0] hover:bg-[#E5D7C2]'"
                  class="px-2 py-1 rounded-lg text-[11px] border transition-colors cursor-pointer shrink-0"
                >
                  +{{ amt }}
                </button>
                <button
                  type="button"
                  @click="transferAmount = userCoins"
                  :class="transferAmount === userCoins ? 'bg-[#5C4533] text-[#FAF4E8] font-bold border-[#7D6049]' : 'bg-[#FAF4E8] text-[#3C2C1E] border-[#D8C7B0] hover:bg-[#EFE5D3]'"
                  class="px-2.5 py-1 rounded-lg text-[11px] border transition-colors cursor-pointer font-bold shrink-0 ml-auto"
                >
                  全部转出
                </button>
              </div>

              <!-- Input -->
              <div>
                <input
                  v-model.number="transferAmount"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  :max="userCoins"
                  placeholder="输入具体赠送数量..."
                  class="w-full px-3 py-1.5 text-xs rounded-xl bg-[#FFFDF8] border border-[#D8C7B0] text-[#3C2C1E] focus:outline-none focus:border-[#5C4533] font-mono shadow-inner"
                  @keydown.enter="submitTransfer"
                />
              </div>

              <div v-if="transferMessage" class="text-xs font-bold p-2 rounded-xl flex items-center gap-1.5" :class="transferSuccess ? 'bg-emerald-100 border border-emerald-300 text-emerald-800' : 'bg-red-100 border border-red-300 text-red-800'">
                <span>{{ transferSuccess ? '✅' : '⚠️' }}</span>
                <span>{{ transferMessage }}</span>
              </div>
            </div>
          </div>

          <!-- ======================================================== -->
          <!-- TAB 2: 收支流水明细 (LEDGER)                             -->
          <!-- ======================================================== -->
          <div v-else-if="activeTab === 'history'" class="space-y-2 py-0.5">
            <!-- Filter Pills -->
            <div class="flex items-center justify-between text-xs text-[#6B5744] shrink-0">
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  @click="historyFilter = 'all'; historyPage = 0"
                  :class="historyFilter === 'all' ? 'bg-[#5C4533] text-[#FAF4E8] font-bold' : 'bg-[#FAF4E8] text-[#3C2C1E] border border-[#D8C7B0] hover:bg-[#EFE5D3]'"
                  class="px-2.5 py-1 rounded-lg cursor-pointer transition-colors text-[11px]"
                >
                  全部
                </button>
                <button
                  type="button"
                  @click="historyFilter = 'income'; historyPage = 0"
                  :class="historyFilter === 'income' ? 'bg-emerald-700 text-white font-bold' : 'bg-[#FAF4E8] text-[#3C2C1E] border border-[#D8C7B0] hover:bg-[#EFE5D3]'"
                  class="px-2.5 py-1 rounded-lg cursor-pointer transition-colors text-[11px]"
                >
                  收入
                </button>
                <button
                  type="button"
                  @click="historyFilter = 'expense'; historyPage = 0"
                  :class="historyFilter === 'expense' ? 'bg-rose-700 text-white font-bold' : 'bg-[#FAF4E8] text-[#3C2C1E] border border-[#D8C7B0] hover:bg-[#EFE5D3]'"
                  class="px-2.5 py-1 rounded-lg cursor-pointer transition-colors text-[11px]"
                >
                  支出
                </button>
              </div>
              <span class="text-[10px] font-mono">共 {{ filteredTransactions.length }} 笔</span>
            </div>

            <!-- Transaction List -->
            <div class="space-y-1.5">
              <div v-if="filteredTransactions.length === 0" class="py-8 text-center text-xs text-[#6B5744] bg-[#FFFDF8] rounded-2xl border border-dashed border-[#D8C7B0]">
                暂无收支明细记录
              </div>
              <div
                v-for="tx in paginatedTransactions"
                :key="tx.id"
                class="px-3 py-2 rounded-xl bg-[#FFFDF8] border border-[#D8C7B0] flex items-center justify-between text-xs hover:border-[#5C4533] transition-colors shadow-xs"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-sm shrink-0">
                    {{ tx.amount >= 0 ? '🪙' : '💸' }}
                  </span>
                  <div class="min-w-0">
                    <div class="font-semibold text-[#3C2C1E] truncate text-[11px]">{{ tx.title }}</div>
                    <div class="text-[9px] text-[#6B5744] font-mono mt-0.5">{{ tx.timestamp }}</div>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0 text-right">
                  <span
                    :class="tx.amount >= 0 ? 'text-emerald-800' : 'text-rose-800'"
                    class="font-mono font-bold text-xs tabular-nums"
                  >
                    {{ tx.amount >= 0 ? `+${tx.amount}` : tx.amount }} 分
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>

        <!-- 4. DOCKED STICKY FOOTER (常驻吸底操作栏，不被键盘与表单淹没！) -->
        <footer class="shrink-0 p-3 sm:px-5 bg-[#FAF4E8] border-t border-[#D8C7B0] flex flex-col gap-1.5 shadow-2xl">
          <!-- When on Transfer Tab: Permanent Action Button -->
          <template v-if="activeTab === 'transfer'">
            <button
              type="button"
              @click="submitTransfer"
              :disabled="!searchedUser || transferAmount <= 0 || isTransferring || isSearching"
              :class="(!searchedUser || transferAmount <= 0 || isTransferring || isSearching)
                ? 'bg-[#EFE5D3] text-[#8C755E] cursor-not-allowed border border-[#D8C7B0]'
                : 'bg-gradient-to-r from-[#5C4533] to-[#433022] hover:from-[#4E3929] hover:to-[#38271A] text-[#FAF4E8] border border-[#7D6049] font-bold shadow-lg active:scale-98 cursor-pointer'"
              class="w-full py-2.5 px-3 text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-1.5 truncate"
            >
              <span>💸</span>
              <span class="truncate">
                {{ isTransferring ? '正在处理筹码赠送...' : (searchedUser ? `确认向 ${searchedUser.name} 赠送 ${transferAmount || 0} 分筹码` : '请先在上方输入手机号选定接收茶客') }}
              </span>
            </button>
            <div class="text-[10px] text-center text-[#6B5744] flex items-center justify-center gap-1">
              <span>💡</span>
              <span>赠送筹码秒级到账，双方账册实时留存审计记录</span>
            </div>
          </template>

          <!-- When on History Tab: Permanent Pagination Bar -->
          <template v-else-if="activeTab === 'history'">
            <div class="flex items-center justify-between text-xs text-[#6B5744]">
              <span class="font-mono text-[11px]">第 {{ historyPage + 1 }} / {{ totalHistoryPages }} 页</span>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  @click="prevHistoryPage"
                  :disabled="historyPage === 0"
                  :class="historyPage === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[#EFE5D3] text-[#3C2C1E] cursor-pointer'"
                  class="px-3 py-1.5 rounded-lg border border-[#D8C7B0] text-xs transition-colors bg-[#FFFDF8]"
                >
                  ◀ 上一页
                </button>
                <button
                  type="button"
                  @click="nextHistoryPage"
                  :disabled="historyPage >= totalHistoryPages - 1"
                  :class="historyPage >= totalHistoryPages - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[#EFE5D3] text-[#3C2C1E] cursor-pointer'"
                  class="px-3 py-1.5 rounded-lg border border-[#D8C7B0] text-xs transition-colors bg-[#FFFDF8]"
                >
                  下一页 ▶
                </button>
              </div>
            </div>
          </template>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { soundFX } from '../utils/sound';
import { resolveApiUrl } from '../utils/networkConfig';
import {
  saveLocalProfile,
  loadPointsTransactions,
  recordPointsTx,
  PointsTransaction,
} from '../utils/storage';

interface UserProfile {
  id: string;
  name: string;
  phone: string;
  coins: number;
  rating: number;
  avatar?: string;
  level?: number;
}

const props = defineProps<{
  profile: UserProfile;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update:profile', profile: UserProfile): void;
}>();

const activeTab = ref<'transfer' | 'history'>('transfer');

const userCoins = computed(() => props.profile.coins || 0);
const userRating = computed(() => props.profile.rating || 1200);
const userLevel = computed(() => Math.max(1, Math.floor(userRating.value / 400)));

// Transfer State
const searchPhone = ref('');
const searchError = ref('');
const searchedUser = ref<UserProfile | null>(null);
const transferAmount = ref<number>(500);
const transferMessage = ref('');
const transferSuccess = ref(false);
const isSearching = ref(false);
const isTransferring = ref(false);

async function searchUser() {
  const p = searchPhone.value.trim().replace(/\D/g, '');
  if (!p) {
    searchError.value = '请输入要查找的手机号';
    searchedUser.value = null;
    return;
  }

  const myPhone = String(props.profile.phone || '').trim().replace(/\D/g, '');
  if (myPhone && p === myPhone) {
    searchError.value = '不能向自己的手机号赠送筹码';
    searchedUser.value = null;
    soundFX.playTap();
    return;
  }

  isSearching.value = true;
  searchError.value = '';
  transferMessage.value = '';

  try {
    const res = await fetch(resolveApiUrl(`/api/users/search?phone=${encodeURIComponent(p)}`));
    const data = await res.json();
    if (data && data.success && data.user) {
      searchedUser.value = {
        id: data.user.id,
        name: data.user.name || `茶客${p.slice(-4)}`,
        phone: data.user.phone || p,
        coins: typeof data.user.coins === 'number' ? data.user.coins : 0,
        rating: data.user.rating || 1800,
        avatar: data.user.avatar || '👤',
        level: data.user.level || 1,
      };
      soundFX.playTap();
    } else {
      searchedUser.value = null;
      searchError.value = (data && data.error) || '未找到该手机号对应的茶客，请确认手机号是否正确或已获白名单授权';
      soundFX.playTap();
    }
  } catch (err) {
    searchedUser.value = null;
    searchError.value = '网络连接异常，未能连接到钱庄服务，请检查网络';
  } finally {
    isSearching.value = false;
  }
}

const transactions = ref<PointsTransaction[]>(loadPointsTransactions());

onMounted(() => {
  transactions.value = loadPointsTransactions();
});

watch(
  () => props.profile.coins,
  () => {
    transactions.value = loadPointsTransactions();
  }
);

async function submitTransfer() {
  if (!searchedUser.value || transferAmount.value <= 0 || isTransferring.value) return;
  if (transferAmount.value > userCoins.value) {
    transferMessage.value = '持有筹码不足，转账失败！';
    transferSuccess.value = false;
    soundFX.playTap();
    return;
  }

  const amt = transferAmount.value;
  isTransferring.value = true;
  transferMessage.value = '';

  try {
    const res = await fetch(resolveApiUrl('/api/points/transfer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: props.profile.id,
        senderPhone: props.profile.phone,
        recipientId: searchedUser.value.id,
        recipientPhone: searchedUser.value.phone,
        amount: amt,
        clientCoins: userCoins.value,
      }),
    });
    const data = await res.json();
    if (!data || !data.success) {
      transferMessage.value = (data && data.error) || '赠送筹码失败，请重试';
      transferSuccess.value = false;
      soundFX.playTap();
      return;
    }

    const newCoins = typeof data.senderCoins === 'number' ? data.senderCoins : (userCoins.value - amt);
    const updated: UserProfile = { ...props.profile, coins: newCoins };
    saveLocalProfile(updated);
    emit('update:profile', updated);

    if (typeof data.recipientCoins === 'number') {
      searchedUser.value.coins = data.recipientCoins;
    }

    recordPointsTx('transfer_out', `向 ${searchedUser.value.name} (${searchedUser.value.phone}) 赠送筹码`, -amt, newCoins);
    transactions.value = loadPointsTransactions();

    transferMessage.value = `成功向 ${searchedUser.value.name} 赠送 ${amt.toLocaleString()} 分筹码！对方已实时到账。`;
    transferSuccess.value = true;
    soundFX.playVictory();
    transferAmount.value = 500;
  } catch (err) {
    transferMessage.value = '赠送请求网络超时或服务异常，请重试';
    transferSuccess.value = false;
    soundFX.playTap();
  } finally {
    isTransferring.value = false;
  }
}

// History & Ledger Filtering
const historyFilter = ref<'all' | 'income' | 'expense'>('all');
const historyPage = ref(0);
const pageSize = ref(6);

const filteredTransactions = computed(() => {
  return transactions.value.filter((tx) => {
    if (historyFilter.value === 'income') return tx.amount > 0;
    if (historyFilter.value === 'expense') return tx.amount < 0;
    return true;
  });
});

const totalHistoryPages = computed(() => {
  return Math.max(1, Math.ceil(filteredTransactions.value.length / pageSize.value));
});

const paginatedTransactions = computed(() => {
  const start = historyPage.value * pageSize.value;
  return filteredTransactions.value.slice(start, start + pageSize.value);
});

function prevHistoryPage() {
  if (historyPage.value > 0) historyPage.value--;
}

function nextHistoryPage() {
  if (historyPage.value < totalHistoryPages.value - 1) historyPage.value++;
}
</script>

<style scoped>
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
