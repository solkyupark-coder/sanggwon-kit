# 이 폴더에서 일하는 Claude에게

이 앱은 패스트캠퍼스 건축가 대상 2주차 수업의 "주변 상권 분석 키트"입니다. 수강생 대부분은 코딩이 처음입니다.

## 말하는 방식
- 쉬운 말로, 짧게. 개발 용어는 처음 나올 때 한 줄로 풀어 주세요.
- 바꾼 뒤에는 "브라우저에서 무엇을 눌러 보면 되는지" 한 줄로 알려 주세요.

## 앱 구조
- `app/page.tsx` 화면 전부. ① 서버 키 상태(연결됨/없음) ② 가운데·반경 ③ 업종별 결과 + 지도(MapLibre).
- 키는 Vercel 환경변수 `VWORLD_KEY`, `DATA_GO_KR_KEY`(내 컴퓨터에서는 `.env.local`)에만 있습니다. 서버 통로(`app/api/...`)가 `process.env`로 읽고, 화면은 `/api/keys`로 있다/없다만 받습니다. 서버 통로를 새로 부를 때는 `api(url)`을 쓰세요.
- `app/api/vworld/route.ts` VWorld API 통로. 화면에서는 `/api/vworld?path=...`로만 부릅니다.
- `app/api/vworld-tile/route.ts` VWorld 배경지도 타일 통로.
- `app/api/stores/route.ts` 공공데이터포털 상가(상권)정보 storeListInRadius 통로. 응답을 샘플 파일과 같은 모양(이름·대분류·중분류·소분류·층·지번주소·lon·lat)으로 바꿔 돌려줍니다.
- `public/data/stores.json` 신림동 1573-28 반경 500m 상가 848곳 샘플. 공공데이터포털 키가 없을 때 씁니다.
- `public/data/permits.json` 신림동 건축 허가 969건, `trades.json` 땅 실거래 568건. `permits.json`을 지도에 찍으려면 `지번주소`를 `/api/vworld?path=req/address&service=address&request=getcoord&version=2.0&crs=epsg:4326&type=parcel&format=json&address=...`로 좌표로 바꿔야 합니다(`api()`로 부르기). 969건을 한꺼번에 부르지 말고 걸러서 수십 건만. `trades.json`의 지번은 `5**`처럼 가려져 있어 표나 막대로 보여 주세요.
- 지도 객체는 `mapRef.current` (개발자 도구에서는 `window.__map`).

## 지켜 주세요
- 키 원문을 코드 파일, `NEXT_PUBLIC_` 변수, 채팅 답변에 쓰지 않습니다. 키는 Vercel 환경변수(또는 `.env.local`)에만.
- 새 키가 필요한 API를 붙이면 환경변수 이름을 하나 정해 `.env.example`에 적고, 서버 통로(`app/api/...`)에서 `process.env`로 읽으세요. `NEXT_PUBLIC_`는 쓰지 않습니다(브라우저로 새어 나갑니다).
- 새 기능은 기존 결과 카드를 망가뜨리지 않게 아래에 덧붙입니다. 파일이 길어지면 `app/` 안에 새 파일로 나눕니다.
- 새 npm 패키지는 꼭 필요할 때만. 차트는 먼저 HTML/CSS 막대로.
- 공공데이터포털 API는 한 번에 1,000곳까지 줍니다. 반경을 2km보다 크게 하지 마세요.

## 배포
- "Vercel에 올려 줘"라고 하면 `npx vercel`로 배포합니다.
- 키는 Vercel 프로젝트 Settings → Environment Variables 에 `VWORLD_KEY`, `DATA_GO_KR_KEY`로 넣고, 넣은 뒤에는 다시 배포해야 반영됩니다.
- VWorld 인증키의 서비스 URL에 배포 주소가 없으면 VWorld가 응답하지 않습니다. 수강생에게 추가하라고 알려 주세요.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
