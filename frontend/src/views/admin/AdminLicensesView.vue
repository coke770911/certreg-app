<template>
  <section class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
    <div class="h-fit space-y-6">
      <form class="space-y-4 rounded-2xl bg-white p-6 shadow-sm" novalidate @submit.prevent="onSubmit">
        <h2 class="text-xl font-bold text-slate-800">新增證照項目</h2>
        <div>
          <label for="groupId" class="mb-1 block text-sm font-medium text-slate-700">證照分類 <span class="text-rose-500">*</span></label>
          <select id="groupId" v-model="form.groupId" class="input" :class="ring('groupId')">
            <option value="">-- 請選擇 --</option>
            <option v-for="g in visibleGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
        <div>
          <label for="name" class="mb-1 block text-sm font-medium text-slate-700">證照名稱 <span class="text-rose-500">*</span></label>
          <input id="name" v-model="form.name" maxlength="50" class="input" :class="ring('name')" />
        </div>
        <p v-if="message" class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{{ message }}</p>
        <p v-if="submitError" class="rounded-xl bg-rose-50 p-3 text-sm text-rose-600" role="alert">{{ submitError }}</p>
        <button type="submit" :disabled="submitting" class="btn-primary w-full">{{ submitting ? '新增中…' : '新增' }}</button>
      </form>

      <form class="space-y-4 rounded-2xl bg-white p-6 shadow-sm" novalidate @submit.prevent="onSubmitGroup">
        <h2 class="text-xl font-bold text-slate-800">新增證照分類</h2>
        <div>
          <label for="groupName" class="mb-1 block text-sm font-medium text-slate-700">分類名稱 <span class="text-rose-500">*</span></label>
          <input
            id="groupName"
            v-model="groupForm.name"
            maxlength="100"
            placeholder="例如：MOS (Microsoft Office Specialist)"
            class="input"
            :class="groupError.field === 'groupName' && 'ring-2 ring-rose-300 border-rose-400'"
          />
          <p class="mt-1 text-xs text-slate-400">新分類會排在現有分類之後，「其他」固定排在最後。</p>
        </div>
        <p v-if="groupMessage" class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{{ groupMessage }}</p>
        <p v-if="groupError.message" class="rounded-xl bg-rose-50 p-3 text-sm text-rose-600" role="alert">{{ groupError.message }}</p>
        <button type="submit" :disabled="groupSubmitting" class="btn-outline w-full py-2.5 font-bold">
          {{ groupSubmitting ? '新增中…' : '新增分類' }}
        </button>
      </form>
    </div>

    <div class="rounded-2xl bg-white p-6 shadow-sm">
      <h2 class="mb-1 text-xl font-bold text-slate-800">證照分類與項目</h2>
      <p class="mb-4 text-xs text-slate-400">點分類名稱展開項目。分類不可刪除，不再使用時請「隱藏」，隱藏後不出現在新增考試與項目的選單，舊考試與報名紀錄仍可對照。用於尚未結束考試的項目不可改名或刪除。</p>
      <p v-if="listMessage" class="sticky top-2 z-10 mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 shadow-sm" role="status">{{ listMessage }}</p>
      <p v-if="listError" class="sticky top-2 z-10 mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-600 shadow-sm" role="alert">{{ listError }}</p>
      <p v-if="loading" class="text-center text-slate-500">載入中…</p>
      <p v-else-if="loadError" class="text-center text-rose-600">{{ loadError }}</p>
      <ul v-else class="divide-y divide-slate-100">
        <li v-for="(g, gi) in groups" :key="g.id" class="py-3">
          <!-- 分類：編輯模式 -->
          <form
            v-if="editing.type === 'group' && editing.id === g.id"
            class="flex flex-wrap items-center gap-2"
            novalidate
            @submit.prevent="saveGroup(g)"
          >
            <input
              id="editGroupName"
              v-model="editing.name"
              maxlength="100"
              class="input min-w-0 flex-1 py-1.5"
              aria-label="分類名稱"
            />
            <button type="submit" class="btn-primary px-4 py-1.5 text-sm" :disabled="busy">儲存</button>
            <button type="button" class="btn-outline text-sm" @click="cancelEdit">取消</button>
          </form>
          <!-- 分類：顯示模式 -->
          <div v-else class="flex items-center gap-2">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
              :aria-expanded="open.has(g.id)"
              @click="toggle(g.id)"
            >
              <span class="flex min-w-0 items-center gap-2">
                <span
                  class="font-medium"
                  :class="g.hidden ? 'text-slate-400' : g.id === lastAddedGroup ? 'text-brand-600' : 'text-slate-800'"
                >{{ g.name }}</span>
                <span v-if="g.hidden" class="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">已隱藏</span>
              </span>
              <span class="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">{{ g.items.length }} 項</span>
            </button>
            <div class="flex shrink-0 items-center gap-0.5 text-sm">
              <template v-if="!isOther(g)">
                <button
                  type="button"
                  class="icon-btn"
                  :disabled="busy || gi === 0"
                  :aria-label="`${g.name} 上移`"
                  title="上移"
                  @click="moveGroup(g, 'up')"
                >↑</button>
                <button
                  type="button"
                  class="icon-btn"
                  :disabled="busy || gi >= lastMovableIndex"
                  :aria-label="`${g.name} 下移`"
                  title="下移"
                  @click="moveGroup(g, 'down')"
                >↓</button>
              </template>
              <button type="button" class="icon-btn text-accent-600" :disabled="busy" @click="startEditGroup(g)">編輯</button>
              <button
                type="button"
                class="icon-btn"
                :class="g.hidden ? 'text-emerald-600' : 'text-slate-500'"
                :disabled="busy"
                @click="setHidden(g, !g.hidden)"
              >{{ g.hidden ? '取消隱藏' : '隱藏' }}</button>
            </div>
          </div>

          <ul v-if="open.has(g.id)" class="mt-2 space-y-1 border-l-2 border-accent-500/20 pl-3">
            <li v-if="!g.items.length" class="text-sm text-slate-400">尚未新增子項目</li>
            <li v-for="item in g.items" :key="item.id">
              <!-- 項目：編輯模式 -->
              <form
                v-if="editing.type === 'item' && editing.id === item.id"
                class="flex flex-wrap items-center gap-2 py-1"
                novalidate
                @submit.prevent="saveItem(item)"
              >
                <input
                  id="editItemName"
                  v-model="editing.name"
                  maxlength="50"
                  class="input min-w-0 flex-1 py-1.5 text-sm"
                  aria-label="證照名稱"
                />
                <select id="editItemGroup" v-model="editing.groupId" class="input w-auto py-1.5 text-sm" aria-label="所屬分類">
                  <option v-for="opt in groups.filter((o) => !o.hidden || o.id === g.id)" :key="opt.id" :value="opt.id">
                    {{ opt.name }}{{ opt.hidden ? '（已隱藏）' : '' }}
                  </option>
                </select>
                <button type="submit" class="btn-primary px-4 py-1.5 text-sm" :disabled="busy">儲存</button>
                <button type="button" class="btn-outline text-sm" @click="cancelEdit">取消</button>
              </form>
              <!-- 項目：顯示模式 -->
              <div v-else class="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
                <span class="text-sm" :class="item.id === lastAdded ? 'font-bold text-brand-600' : 'text-slate-700'">
                  {{ item.name }}
                </span>
                <div class="flex shrink-0 gap-0.5 text-sm">
                  <button type="button" class="icon-btn text-accent-600" :disabled="busy" @click="startEditItem(item, g)">編輯</button>
                  <button type="button" class="icon-btn text-rose-500" :disabled="busy" @click="removeItem(item)">刪除</button>
                </div>
              </div>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { apiDelete, apiGet, apiPost, apiPut } from '@/api';

const groups = ref([]);
const loading = ref(true);
const loadError = ref('');
const form = reactive({ groupId: '', name: '' });
const submitting = ref(false);
const submitError = ref('');
const errorField = ref('');
const message = ref('');
const open = ref(new Set());
const lastAdded = ref(null);
const groupForm = reactive({ name: '' });
const groupSubmitting = ref(false);
const groupError = reactive({ message: '', field: '' });
const groupMessage = ref('');
const lastAddedGroup = ref(null);

// 新增項目只能選未隱藏的分類
const visibleGroups = computed(() => groups.value.filter((g) => !g.hidden));

const ring = (field) => (errorField.value === field ? 'ring-2 ring-rose-300 border-rose-400' : '');

function toggle(id) {
  const next = new Set(open.value);
  next.has(id) ? next.delete(id) : next.add(id);
  open.value = next;
}

async function load() {
  try {
    groups.value = await apiGet('/admin/license-groups');
  } catch (err) {
    loadError.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function onSubmit() {
  message.value = '';
  submitError.value = '';
  errorField.value = '';
  submitting.value = true;
  try {
    const res = await apiPost('/admin/licenses', form);
    message.value = `${res.message}「${res.license.name}」`;
    lastAdded.value = res.license.id;
    open.value = new Set([...open.value, res.license.groupId]);
    form.name = '';
    await load();
  } catch (err) {
    submitError.value = err.message;
    errorField.value = err.field || '';
    if (err.field) document.getElementById(err.field)?.focus();
  } finally {
    submitting.value = false;
  }
}

async function onSubmitGroup() {
  groupMessage.value = '';
  groupError.message = '';
  groupError.field = '';
  groupSubmitting.value = true;
  try {
    const res = await apiPost('/admin/license-groups', groupForm);
    groupMessage.value = `${res.message}「${res.group.name}」`;
    lastAddedGroup.value = res.group.id;
    groupForm.name = '';
    await load();
    // 直接帶入上方表單，方便接著新增此分類的證照項目
    form.groupId = res.group.id;
    open.value = new Set([...open.value, res.group.id]);
  } catch (err) {
    groupError.message = err.message;
    groupError.field = err.field || '';
    if (err.field) document.getElementById(err.field)?.focus();
  } finally {
    groupSubmitting.value = false;
  }
}

// ---------- 分類的編輯、隱藏、排序與項目的編輯、刪除 ----------
const editing = reactive({ type: null, id: null, name: '', groupId: null });
const busy = ref(false);
const listMessage = ref('');
const listError = ref('');

const isOther = (g) => g.name.trim() === '其他';
// 「其他」固定最後，下移按鈕只到它前一個
const lastMovableIndex = computed(() => groups.value.filter((g) => !isOther(g)).length - 1);

function resetNotice() {
  listMessage.value = '';
  listError.value = '';
  // 左側新增表單的舊訊息一併清除，避免同時出現多則訊息
  message.value = '';
  groupMessage.value = '';
}

function cancelEdit() {
  Object.assign(editing, { type: null, id: null, name: '', groupId: null });
}

async function focusEdit(id) {
  await nextTick();
  document.getElementById(id)?.focus();
}

function startEditGroup(g) {
  resetNotice();
  Object.assign(editing, { type: 'group', id: g.id, name: g.name, groupId: null });
  focusEdit('editGroupName');
}

function startEditItem(item, g) {
  resetNotice();
  Object.assign(editing, { type: 'item', id: item.id, name: item.name, groupId: g.id });
  focusEdit('editItemName');
}

/** 執行一個異動：成功顯示訊息並重新載入，失敗顯示原因 */
async function run(action) {
  resetNotice();
  busy.value = true;
  try {
    listMessage.value = (await action()).message;
    await load();
    return true;
  } catch (err) {
    listError.value = err.message;
    if (err.field) document.getElementById(err.field)?.focus();
    return false;
  } finally {
    busy.value = false;
  }
}

async function saveGroup(g) {
  if (await run(() => apiPut(`/admin/license-groups/${g.id}`, { name: editing.name }))) cancelEdit();
}

async function saveItem(item) {
  const groupId = editing.groupId;
  if (await run(() => apiPut(`/admin/licenses/${item.id}`, { name: editing.name, groupId }))) {
    lastAdded.value = item.id;
    open.value = new Set([...open.value, groupId]);
    cancelEdit();
  }
}

function moveGroup(g, direction) {
  run(() => apiPost(`/admin/license-groups/${g.id}/move`, { direction }));
}

function setHidden(g, hidden) {
  if (hidden && !window.confirm(`確定要隱藏分類「${g.name}」嗎？
隱藏後不會出現在新增考試與證照項目的選單，舊資料不受影響，之後可取消隱藏。`)) return;
  if (hidden && form.groupId === g.id) form.groupId = '';
  run(() => apiPut(`/admin/license-groups/${g.id}/hidden`, { hidden }));
}

function removeItem(item) {
  if (!window.confirm(`確定要刪除證照項目「${item.name}」嗎？\n已建立的考試與報名紀錄不受影響。`)) return;
  run(() => apiDelete(`/admin/licenses/${item.id}`));
}
</script>
