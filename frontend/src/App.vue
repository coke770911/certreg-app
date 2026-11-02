<template>
  <RouterView v-if="route.meta.bare" />
  <div v-else class="flex min-h-screen flex-col">
    <header class="print:hidden bg-gradient-to-r from-brand-500 to-accent-500 text-white shadow">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <RouterLink to="/" class="text-lg font-bold tracking-wide sm:text-xl">證照報名系統</RouterLink>

        <nav class="flex items-center gap-2 text-sm sm:gap-3">
          <RouterLink to="/" class="rounded-full px-3 py-1.5 hover:bg-white/15">考試列表</RouterLink>
          <template v-if="auth.user">
            <RouterLink :to="{ name: 'my-applications' }" class="rounded-full px-3 py-1.5 hover:bg-white/15">
              報名紀錄
            </RouterLink>
            <RouterLink
              v-if="adminHome"
              :to="{ name: adminHome }"
              class="rounded-full px-3 py-1.5 hover:bg-white/15"
            >
              管理
            </RouterLink>
            <span class="hidden md:inline">
              {{ auth.user.name }} {{ auth.user.title }}
              <span v-if="auth.user.impersonatedBy" class="ml-1 rounded-full bg-white/25 px-2 py-0.5 text-xs">
                代理：{{ auth.user.impersonatedBy }}
              </span>
            </span>
            <button
              type="button"
              class="rounded-full bg-white/20 px-4 py-1.5 font-medium hover:bg-white/30"
              @click="onLogout"
            >
              登出
            </button>
          </template>
          <RouterLink
            v-else-if="auth.loaded"
            :to="{ name: 'login', query: route.name === 'login' ? route.query : { redirect: route.fullPath } }"
            class="rounded-full bg-white px-4 py-1.5 font-medium text-brand-600 hover:bg-brand-50"
          >
            登入
          </RouterLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto w-full flex-1 px-4 py-8" :class="route.path.startsWith('/admin') ? 'max-w-7xl' : 'max-w-6xl'">
      <RouterView />
    </main>

    <footer class="print:hidden border-t border-slate-200 py-4 text-center text-sm text-slate-500">
      © {{ year }} 證照報名系統
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth, logout } from '@/auth';

const route = useRoute();
const router = useRouter();
const year = new Date().getFullYear();

// 「管理」連結：有考試管理權限進考試列表，只有系統管理權限進系統資訊
const adminHome = computed(() => {
  const permissions = auth.user?.permissions ?? [];
  if (permissions.includes('manage')) return 'admin-exams';
  if (permissions.includes('system')) return 'admin-system';
  return null;
});

async function onLogout() {
  await logout();
  if (route.meta.requiresAuth) router.push('/');
}
</script>
