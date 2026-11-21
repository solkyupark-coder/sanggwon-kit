import { NextRequest } from "next/server";

// VWorld 배경지도 타일 통로. 타일 주소 안에 키가 들어가서 서버에서 대신 받아 옵니다.
// 키는 VWORLD_KEY 환경변수에서 읽습니다.
const TYPES = new Set(["Base", "Satellite", "Hybrid", "gray", "midnight"]);

export async function GET(req: NextRequest) {
  const KEY = process.env.VWORLD_KEY || "";
  if (!KEY) return new Response("VWorld 키 없음", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const t = sp.get("t") ?? "Base";
  const z = sp.get("z"), y = sp.get("y"), x = sp.get("x");
  if (!TYPES.has(t) || !z || !y || !x) return new Response("bad params", { status: 400 });
  const ext = t === "Satellite" ? "jpeg" : "png";
  const r = await fetch(`https://api.vworld.kr/req/wmts/1.0.0/${KEY}/${t}/${z}/${y}/${x}.${ext}`, { cache: "no-store" });
  return new Response(await r.arrayBuffer(), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? `image/${ext}`, "cache-control": "private, max-age=86400" },
  });
}
