import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true, // 같은 와이파이의 태블릿에서도 접속 가능
    fs: { allow: ['..'] }, // shared 폴더를 함께 사용
  },
});
