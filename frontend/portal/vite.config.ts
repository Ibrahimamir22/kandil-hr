import { defineConfig } from 'vite';
export default defineConfig({base:'/assets/kandil_hr/portal/',build:{outDir:'../../kandil_hr/public/portal',emptyOutDir:true,manifest:true,rollupOptions:{output:{entryFileNames:'portal.js',chunkFileNames:'chunks/[name]-[hash].js',assetFileNames:'[name]-[hash][extname]'}}}});
