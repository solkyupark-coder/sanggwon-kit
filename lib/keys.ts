// 키는 Vercel 환경변수(VWORLD_KEY, DATA_GO_KR_KEY)에만 둡니다.
// 화면(브라우저)에는 키 값이 오지 않고, /api/keys 가 "있다/없다"만 알려 줍니다.
// 내 컴퓨터에서 돌릴 때는 .env.local 에 같은 이름으로 넣으면 됩니다.

export type KeyStatus = { vworld: boolean; datagokr: boolean };

// 우리 서버 통로(/api/...)를 부릅니다. 키는 서버가 환경변수에서 붙입니다.
export const api = (url: string) => fetch(url);
