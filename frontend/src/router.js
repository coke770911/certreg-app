import { createRouter, createWebHistory } from 'vue-router';
import { loadUser } from './auth';

// history 模式：後端 Express 已設定 SPA fallback，重新整理任何頁面都會回傳 index.html
// meta.requiresAuth：需要登入；meta.bare：不顯示網站頁首頁尾 (列印用頁面)
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    {
      path: '/exams/:id(\\d+)',
      name: 'exam-detail',
      component: () => import('./views/ExamDetailView.vue'),
      props: true,
    },
    {
      path: '/exams/:id(\\d+)/apply',
      name: 'exam-apply',
      component: () => import('./views/ApplyView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/my/applications',
      name: 'my-applications',
      component: () => import('./views/MyApplicationsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/my/applications/:id(\\d+)',
      name: 'my-application',
      component: () => import('./views/MyApplicationDetailView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/my/applications/:id(\\d+)/slip',
      name: 'deposit-slip',
      component: () => import('./views/DepositSlipView.vue'),
      props: true,
      meta: { requiresAuth: true, bare: true },
    },
    // 管理端：meta.permission 為所需權限 (manage 考試管理 / system 系統管理)，由「權限設定」頁維護
    {
      path: '/admin',
      component: () => import('./views/admin/AdminLayout.vue'),
      meta: { requiresAuth: true, permission: 'manage' },
      children: [
        { path: '', name: 'admin-exams', component: () => import('./views/admin/AdminExamsView.vue') },
        { path: 'exams/new', name: 'admin-exam-new', component: () => import('./views/admin/AdminExamFormView.vue') },
        {
          path: 'exams/:id(\\d+)',
          name: 'admin-exam-edit',
          component: () => import('./views/admin/AdminExamFormView.vue'),
          props: true,
        },
        {
          path: 'exams/:id(\\d+)/payments',
          name: 'admin-payments',
          component: () => import('./views/admin/AdminPaymentsView.vue'),
          props: true,
        },
        {
          path: 'exams/:id(\\d+)/scores',
          name: 'admin-scores',
          component: () => import('./views/admin/AdminScoresView.vue'),
          props: true,
        },
        { path: 'licenses', name: 'admin-licenses', component: () => import('./views/admin/AdminLicensesView.vue') },
        {
          path: 'system',
          name: 'admin-system',
          component: () => import('./views/admin/AdminSystemView.vue'),
          meta: { permission: 'system' },
        },
        {
          path: 'permissions',
          name: 'admin-permissions',
          component: () => import('./views/admin/AdminPermissionsView.vue'),
          meta: { permission: 'system' },
        },
      ],
    },
    {
      path: '/admin/applications/:id(\\d+)/slip',
      name: 'admin-deposit-slip',
      component: () => import('./views/DepositSlipView.vue'),
      props: (route) => ({ id: route.params.id, admin: true }),
      meta: { requiresAuth: true, permission: 'manage', bare: true },
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

// 需要登入的頁面：未登入時導向登入頁，登入後再回到原頁面；管理端另需對應權限
router.beforeEach(async (to) => {
  const user = await loadUser();
  if (to.meta.requiresAuth && !user) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.permission && !user.permissions?.includes(to.meta.permission)) {
    // 只有系統管理權限時，管理端首頁改到系統資訊
    if (to.name === 'admin-exams' && user.permissions?.includes('system')) return { name: 'admin-system' };
    return { path: '/' };
  }
  if (to.name === 'login' && user) return { path: '/' };
});

export default router;
