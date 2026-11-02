<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div>
        <p class="text-sm font-medium text-accent-600">管理端</p>
        <h1 class="text-2xl font-bold text-slate-800 sm:text-3xl">{{ isSystemPage ? '系統管理' : '證照考試管理' }}</h1>
      </div>
      <nav class="flex flex-wrap gap-2 text-sm">
        <RouterLink
          v-for="link in visibleLinks"
          :key="link.name"
          :to="{ name: link.name }"
          class="rounded-full border px-4 py-1.5 font-medium transition"
          :class="
            isActive(link)
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:border-brand-500 hover:text-brand-600'
          "
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>
    <RouterView />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { auth } from '@/auth';

const route = useRoute();

const links = [
  { name: 'admin-exams', label: '考試列表', permission: 'manage', match: ['admin-exams', 'admin-exam-edit', 'admin-payments', 'admin-scores'] },
  { name: 'admin-exam-new', label: '新增考試', permission: 'manage' },
  { name: 'admin-licenses', label: '證照項目', permission: 'manage' },
  { name: 'admin-system', label: '系統資訊', permission: 'system' },
  { name: 'admin-permissions', label: '權限設定', permission: 'system' },
];

const visibleLinks = computed(() => links.filter((l) => auth.user?.permissions?.includes(l.permission)));
const isSystemPage = computed(() => ['admin-system', 'admin-permissions'].includes(route.name));

const isActive = (link) => (link.match ?? [link.name]).includes(route.name);
</script>
