<template>
  <fieldset :disabled="readonly" class="space-y-6">
    <fieldset>
      <legend class="mb-3 font-bold text-slate-800">考試項目 <span class="text-rose-500">*</span></legend>
      <div class="grid gap-2 sm:grid-cols-2" :class="ring('item')">
        <label
          v-for="item in exam.items"
          :key="item.id"
          class="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
        >
          <input v-model="form.item" type="radio" name="item" :value="item.name" class="accent-brand-500" />
          <span class="text-slate-700">{{ item.name }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend class="mb-3 font-bold text-slate-800">報名資料</legend>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">學號</label>
          <input :value="form.studentNo" disabled class="input bg-slate-50 text-slate-500" />
        </div>
        <div>
          <label for="name" class="mb-1 block text-sm font-medium text-slate-700">中文姓名 <span class="text-rose-500">*</span></label>
          <input
            id="name"
            v-model="form.name"
            class="input"
            :class="[ring('name'), lockIdentity && 'bg-slate-50 text-slate-500']"
            :disabled="lockIdentity"
            maxlength="50"
          />
        </div>
        <div class="sm:col-span-2">
          <label for="englishName" class="mb-1 block text-sm font-medium text-slate-700">
            英文姓名 <span class="text-rose-500">*</span>
          </label>
          <input
            id="englishName"
            v-model="form.englishName"
            class="input uppercase"
            :class="ring('englishName')"
            maxlength="50"
            placeholder="例如：WANG,SIAO-MING（需與護照相同，全大寫）"
          />
        </div>
        <div>
          <span class="mb-1 block text-sm font-medium text-slate-700">性別 <span class="text-rose-500">*</span></span>
          <div class="flex gap-2" :class="ring('sex')">
            <label
              v-for="opt in SEX_OPTIONS"
              :key="opt.value"
              class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:disabled]:cursor-default"
            >
              <input v-model="form.sex" type="radio" name="sex" :value="opt.value" :disabled="lockIdentity" class="accent-brand-500" />
              {{ opt.label }}
            </label>
          </div>
        </div>
        <div>
          <label for="idNumber" class="mb-1 block text-sm font-medium text-slate-700">
            身分證字號 <span class="text-rose-500">*</span>
          </label>
          <input
            id="idNumber"
            v-model="form.idNumber"
            class="input uppercase"
            :class="[ring('idNumber'), lockIdentity && 'bg-slate-50 text-slate-500']"
            :disabled="lockIdentity"
            maxlength="20"
          />
        </div>
        <div>
          <label for="dept" class="mb-1 block text-sm font-medium text-slate-700">系年班 <span class="text-rose-500">*</span></label>
          <input id="dept" v-model="form.dept" class="input" :class="ring('dept')" maxlength="50" />
        </div>
        <div>
          <label for="phone" class="mb-1 block text-sm font-medium text-slate-700">行動電話 <span class="text-rose-500">*</span></label>
          <input
            id="phone"
            v-model="form.phone"
            type="tel"
            inputmode="numeric"
            class="input"
            :class="ring('phone')"
            maxlength="15"
            placeholder="例如：0910123456"
          />
        </div>
        <div class="sm:col-span-2">
          <label for="email" class="mb-1 block text-sm font-medium text-slate-700">電子郵件 <span class="text-rose-500">*</span></label>
          <input id="email" v-model="form.email" type="email" class="input" :class="ring('email')" maxlength="80" />
        </div>
      </div>
    </fieldset>

    <fieldset v-if="exam.requiresRegistration" class="rounded-xl bg-amber-50 p-4">
      <legend class="sr-only">官網註冊</legend>
      <span class="text-sm font-medium text-amber-800">此考試需先至官方網站註冊，您是否已完成註冊？</span>
      <div class="mt-2 flex gap-4 text-sm text-amber-900">
        <label class="flex items-center gap-2"><input v-model="form.isRegistered" type="radio" :value="true" />是</label>
        <label class="flex items-center gap-2"><input v-model="form.isRegistered" type="radio" :value="false" />否</label>
      </div>
    </fieldset>

    <div>
      <label for="memo" class="mb-1 block text-sm font-medium text-slate-700">備註</label>
      <textarea
        id="memo"
        v-model="form.memo"
        rows="2"
        maxlength="120"
        class="input"
        :class="ring('memo')"
        placeholder="給予建議或考場特殊需求（最多 120 字）"
      ></textarea>
    </div>
  </fieldset>
</template>

<script setup>
// 報名表單欄位 (新增報名與修改報名共用)；form 為父元件的 reactive 物件，直接雙向綁定
const props = defineProps({
  exam: { type: Object, required: true },
  form: { type: Object, required: true },
  errorField: { type: String, default: '' },
  // 修改報名時姓名、性別、身分證字號不可變更
  lockIdentity: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
});

const SEX_OPTIONS = [
  { value: 'M', label: '男' },
  { value: 'F', label: '女' },
];

const ring = (field) => (props.errorField === field ? 'ring-2 ring-rose-300 rounded-xl' : '');
</script>
