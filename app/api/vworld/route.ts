import { NextRequest } from "next/server";

// VWorld API를 서버에서 대신 불러 주는 통로(프록시)입니다.
// 키는 Vercel 환경변수(내 컴퓨터에서는 .env.local)의 VWORLD_KEY를 씁니다.

const BASE = "https://api.vworld.kr";
const ALLOW = new Set([
  "req/data", "req/wms", "req/wfs", "req/search", "req/address",
  "ned/data/getLandCharacteristics", "ned/data/getLandUseAttr",
]);

export async function GET(req: NextRequest) {
  const KEY = process.env.VWORLD_KEY || "";
  if (!KEY) return Response.json({ error: "VWorld 키가 없습니다. Vercel 환경변수에 VWORLD_KEY를 넣어 주세요." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const path = sp.get("path") ?? "";
  if (!ALLOW.has(path)) return Response.json({ error: "허용되지 않은 path: " + path }, { status: 400 });

  const out = new URLSearchParams();
  sp.forEach((v, k) => { if (k !== "path") out.set(k, v); });
  out.set("key", KEY);
  // VWorld는 키를 받을 때 적은 서비스 URL과 이 값이 맞아야 응답합니다.
  // 내 컴퓨터에서는 http://localhost, 배포하면 https://내주소.vercel.app
  out.set("domain", process.env.VWORLD_DOMAIN || `${req.nextUrl.protocol}//${req.nextUrl.hostname}`);
  if (path.startsWith("ned/")) out.set("format", out.get("format") ?? "json");

  let r: Response;
  try {
    r = await fetch(`${BASE}/${path}?${out.toString()}`, { cache: "no-store" });
  } catch {
    return Response.json({ error: "VWorld에 연결하지 못했어요. 인터넷 연결을 확인하세요." }, { status: 502 });
  }
  const ct = r.headers.get("content-type") ?? "application/octet-stream";
  return new Response(await r.arrayBuffer(), { status: r.status, headers: { "content-type": ct, "cache-control": "no-store" } });
}
