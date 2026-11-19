import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true, // 같은 와이파이의 태블릿에서도 접속 가능
    fs: { allow: ['..'] }, // shared 폴더를 함께 사용
  },
  build: {
    rollupOptions: {
      // 게임 화면과 캐릭터 쇼룸을 함께 빌드
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        character: fileURLToPath(new URL('./character.html', import.meta.url)),
        outfits: fileURLToPath(new URL('./outfits.html', import.meta.url)),
      },
    },
  },
});
