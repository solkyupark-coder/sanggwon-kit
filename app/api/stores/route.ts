import { NextRequest } from "next/server";

// 소상공인시장진흥공단 상가(상권)정보 API 통로 (공공데이터포털 data.go.kr)
// 반경 안 상가 목록: storeListInRadius
// 키는 Vercel 환경변수 DATA_GO_KR_KEY 에서 읽습니다.
// 공공데이터포털 키는 '일반 인증키(Decoding)'를 넣습니다.

const URL_ = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius";

type Item = Record<string, string>;

export async function GET(req: NextRequest) {
  const KEY = process.env.DATA_GO_KR_KEY || "";
  if (!KEY) return Response.json({ error: "공공데이터포털 키가 없습니다." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const cx = sp.get("cx"), cy = sp.get("cy");
  const radius = String(Math.min(2000, Math.max(50, Number(sp.get("radius") ?? 500))));
  if (!cx || !cy) return Response.json({ error: "cx, cy(경도, 위도)가 필요합니다." }, { status: 400 });

  const all: Item[] = [];
  // 한 번에 1,000곳씩, 최대 5쪽(5,000곳)까지 받습니다
  for (let page = 1; page <= 5; page++) {
    const q = new URLSearchParams({ serviceKey: KEY, pageNo: String(page), numOfRows: "1000", radius, cx, cy, type: "json" });
    let text = "";
    try {
      const r = await fetch(`${URL_}?${q}`, { cache: "no-store" });
      text = await r.text();
    } catch {
      return Response.json({ error: "공공데이터포털에 연결하지 못했어요. 인터넷 연결을 확인하세요." }, { status: 502 });
    }
    let j: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: Item[]; totalCount?: number } };
    try { j = JSON.parse(text); } catch {
      // 키가 틀리면 JSON 대신 XML 오류가 옵니다
      return Response.json({ error: "공공데이터포털 응답을 못 읽었어요. 키가 맞는지, 이 API 활용 신청이 승인됐는지 확인하세요.", raw: text.slice(0, 300) }, { status: 502 });
    }
    const code = j.header?.resultCode;
    if (code === "03") break; // 데이터 없음
    if (code && code !== "00") return Response.json({ error: `공공데이터포털 오류 ${code}: ${j.header?.resultMsg ?? ""}` }, { status: 502 });
    const items = j.body?.items ?? [];
    all.push(...items);
    if (items.length < 1000 || all.length >= (j.body?.totalCount ?? 0)) break;
  }

  // 화면에서 쓰기 쉽게 샘플 파일(stores.json)과 같은 모양으로 바꿉니다
  const 상가 = all.map((s) => ({
    이름: s.bizesNm, 대분류: s.indsLclsNm, 중분류: s.indsMclsNm, 소분류: s.indsSclsNm,
    층: s.flrNo ?? "", 지번주소: s.lnoAdr, 도로명주소: s.rdnmAdr, lon: Number(s.lon), lat: Number(s.lat),
  }));
  return Response.json({ 설명: "소상공인시장진흥공단 상가(상권)정보, 방금 조회", 개수: 상가.length, 상가 });
}
