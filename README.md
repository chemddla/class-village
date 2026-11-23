# 우리 반 마을 — 1단계 시제품

마을 공터에서 여러 학생이 함께 돌아다니는 것을 확인하는 시제품입니다.

## 실행

```bash
npm install
npm run dev
```

- 화면: http://localhost:5173
- 게임 서버: 포트 2567 (`GAME_PORT` 환경 변수로 변경 가능)

## 늘 켜 두는 테스트 서버 (내 컴퓨터)

작업 스케줄러가 로그인할 때, 그리고 2분마다 확인해 꺼져 있으면 켭니다. 따로 `npm run dev`를 켜지 않아도 늘 접속할 수 있습니다.

| 용도 | 화면 주소 | 게임 서버 | 보여 주는 것 | 작업 스케줄러 이름 |
|---|---|---|---|---|
| 로컬용 | http://localhost:5173 | 2567 | 이 컴퓨터의 작업 폴더 (커밋 안 한 내용도 바로 보임) | `ClassVillage live test server` |
| 동시 작업용 (같은 와이파이) | http://localhost:5180 | 2577 | 원격 `main` (어느 컴퓨터에서 푸시하든 5초 안에 반영). **평소엔 꺼 둠**, 아래 스위치로 켬 | `ClassVillage live main server` |
| 다른 장소에서 함께 | https://test.class-village.duckdns.org | 2577 (실제 서버) | 원격 `main` (위 동시 작업용 서버가 바뀔 때마다 올려 줌, 1분쯤 걸림) | — |

- 화면 코드(`client`)가 바뀌면 브라우저가 곧바로 새로 그리고, 게임 서버 코드(`server`·`shared`)가 바뀌면 게임 서버가 저절로 다시 켜집니다.
- 화면 서버나 게임 서버가 멈추면 4초 뒤 다시 켭니다. 포트를 다른 곳에서 쓰고 있으면 비워질 때까지 기다렸다가 켭니다.
- 동시 작업용은 전용 폴더 `%LOCALAPPDATA%\ClassVillage\live-main`을 원격 `main`에 강제로 맞춥니다. 거기서는 고치지 마세요. 설치 폴더(`node_modules`)는 작업 폴더의 것을 함께 쓰므로, `main`에 새 패키지가 들어오면 작업 폴더에서도 `npm install`을 해야 합니다.
- 기록: `%LOCALAPPDATA%\ClassVillage\live-server.log`, `live-main-server.log`
- 동시 작업용(5180·2577)은 스위치 파일 `%LOCALAPPDATA%\ClassVillage\main-serve.on`이 있을 때만 켜집니다. 켜기: `New-Item -ItemType File "$env:LOCALAPPDATA\ClassVillage\main-serve.on"`, 끄기: 그 파일을 지우기 (2초 안에 따라감). 꺼 둬도 원격 `main` 받아오기와 다른 장소용 테스트판 올리기는 계속합니다.
- 다른 장소용 테스트판은 실제 서버에 따로 있습니다(`class-village-test` 서비스). 처음 한 번 `bash tools/setup-test-server.sh`로 만들고, 그 뒤로는 이 컴퓨터가 켜져 있는 동안 원격 `main`이 바뀔 때마다 자동으로 올라갑니다. 이 컴퓨터가 꺼져 있으면 마지막으로 올린 내용에 머뭅니다.
- 처음 등록하거나 설정을 바꿀 때: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-live-server.ps1`
- Claude 앱의 미리보기(`.claude/launch.json`의 `village`, `village-main`)는 새로 켜지 않고 이 서버들에 붙습니다. 따로 켜야 할 때는 `village-dev`를 씁니다.

## 태블릿에서 접속

1. 컴퓨터와 태블릿을 **같은 와이파이**에 연결합니다.
2. `npm run dev`를 실행했을 때 나오는 `Network: http://192.168.x.x:5173` 주소를 태블릿 브라우저에 입력합니다.
3. 접속이 안 되면 Windows 방화벽에서 Node.js의 "개인 네트워크" 접근을 허용합니다 (5173, 2567 포트).
4. 학교 와이파이는 기기끼리 연결을 막아 둔 경우가 많아, 이때는 실제 서버(Oracle)를 준비한 뒤에 시험합니다.

## 가짜 학생 시험

```bash
npm run bots -- 30
```

서버 창에 10초마다 `[전송량]` 줄이 나옵니다. "1명당" 값이 학생 한 명이 받는 양입니다.

## 조작

| 기기 | 이동 | 달리기 | 인사 |
|---|---|---|---|
| 태블릿 | 화면 왼쪽을 누르고 끌기 (조이스틱) | 조이스틱을 끝까지 밀기 | 오른쪽 아래 버튼 |
| 컴퓨터 | 방향키 또는 WASD | 같은 방향키 두 번 연타 후 누르고 있기 (Shift는 마우스 쪽 회피 구르기) | Space 또는 E |

저사양 기기에서는 주소 뒤에 `?q=low`를 붙이면 화질을 낮춰 더 빠르게 돌아갑니다.

## 폴더 구성

| 폴더 | 내용 |
|---|---|
| `client/` | 3D 화면 (Three.js, Vite) |
| `server/` | 게임 서버 (Colyseus 0.16) |
| `shared/` | 지도와 막힌 곳 판정 (화면과 서버가 함께 사용) |
| `tools/` | 가짜 학생 시험 도구 |
