import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

// 前端一律編譯為靜態檔案，輸出至 backend/public，由後端 Express 以同一個 PORT 提供。
// 不使用 Vite 開發伺服器，因此不會有第二個通訊埠。
export default defineConfig(({ mode }) => ({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  base: '/',
  build: {
    outDir: fileURLToPath(new URL('../backend/public', import.meta.url)),
    emptyOutDir: true,
    // 開發模式 (build:watch) 保留 sourcemap 方便除錯，正式編譯不輸出
    sourcemap: mode === 'development',
  },
}));
