// ─────────────────────────────────────────────────────────────
// 용도지역 → 건폐율·용적률 → 임대형 기숙사 최대 매스
// 아주 거친 1차 규모 검토입니다. 일조 사선, 도로 사선, 주차, 조경, 지구단위계획은 넣지 않았습니다.
// ─────────────────────────────────────────────────────────────

export type Zone = {
  name: string;        // 용도지역 이름 (VWorld·토지이음 표기)
  seoul: [number, number]; // 서울특별시 도시계획 조례 [건폐율 %, 용적률 %]
  nation: [number, number]; // 국토계획법 시행령 상한 [건폐율 %, 용적률 %] (서울 밖에서 씀, 각 시·군 조례로 더 낮을 수 있음)
  dorm: "가능" | "불가" | "조례 확인";
  maxFloors?: number;  // 층수 제한
  why?: string;
};

// 표 값은 아래 ZONES_SOURCE 출처로 확인했습니다 (2026-11-12, law.go.kr).
// 상업지역 용적률은 일반값입니다. 서울 도심은 중심 800 · 일반 600 · 근린 500 · 유통 500%.
export const ZONES: Zone[] = [
  { name: "제1종전용주거지역", seoul: [50, 100], nation: [50, 100], dorm: "불가", why: "단독주택 위주 지역이라 공동주택(기숙사)을 지을 수 없습니다." },
  { name: "제2종전용주거지역", seoul: [40, 120], nation: [50, 150], dorm: "가능" },
  { name: "제1종일반주거지역", seoul: [60, 150], nation: [60, 200], dorm: "가능", maxFloors: 4 },
  { name: "제2종일반주거지역", seoul: [60, 200], nation: [60, 250], dorm: "가능", why: "7층 이하로 묶인 곳은 지구단위계획 등에서 층수·용적률이 따로 정해졌을 수 있으니 결정도서를 확인하세요." },
  { name: "제3종일반주거지역", seoul: [50, 250], nation: [50, 300], dorm: "가능", why: "공공준주택 임대형 기숙사가 연면적 절반 이상이면 조례 제51조로 300%까지 완화될 수 있습니다." },
  { name: "준주거지역", seoul: [60, 400], nation: [70, 500], dorm: "가능", why: "공공준주택 임대형 기숙사면 조례 제51조로 500%까지 완화될 수 있습니다." },
  { name: "중심상업지역", seoul: [60, 1000], nation: [90, 1500], dorm: "조례 확인", why: "공동주택은 안 되고, 용도 비율(조례 별표16)을 지킨 주거복합만 됩니다." },
  { name: "일반상업지역", seoul: [60, 800], nation: [80, 1300], dorm: "조례 확인", why: "공동주택은 안 되고, 용도 비율(조례 별표16)을 지킨 주거복합만 됩니다." },
  { name: "근린상업지역", seoul: [60, 600], nation: [70, 900], dorm: "조례 확인", why: "공동주택은 안 되고, 용도 비율(조례 별표16)을 지킨 주거복합만 됩니다." },
  { name: "유통상업지역", seoul: [60, 600], nation: [80, 1100], dorm: "불가", why: "공동주택을 지을 수 없습니다." },
  { name: "전용공업지역", seoul: [60, 200], nation: [70, 300], dorm: "조례 확인", why: "조례로 정하면 기숙사만 됩니다. 임대형까지 되는지는 허가권자 확인이 필요합니다." },
  { name: "일반공업지역", seoul: [60, 200], nation: [70, 350], dorm: "조례 확인", why: "조례로 정하면 기숙사가 됩니다. 임대형까지 되는지는 허가권자 확인이 필요합니다." },
  { name: "준공업지역", seoul: [60, 400], nation: [70, 400], dorm: "조례 확인", why: "서울은 조례 별표17 기준을 지켜야 하고, 공동주택 등은 용적률 250%(공공기여 시 400%)입니다." },
  { name: "보전녹지지역", seoul: [20, 50], nation: [20, 80], dorm: "불가" },
  { name: "생산녹지지역", seoul: [20, 50], nation: [20, 100], dorm: "조례 확인", why: "조례로 정하면 아파트를 뺀 공동주택을 4층 이하로 지을 수 있습니다.", maxFloors: 4 },
  { name: "자연녹지지역", seoul: [20, 50], nation: [20, 100], dorm: "조례 확인", why: "조례로 정하면 아파트를 뺀 공동주택을 4층 이하로 지을 수 있습니다.", maxFloors: 4 },
];
export const ZONES_SOURCE = "서울특별시 도시계획 조례 제44조·제48조(2026.7.13 시행본), 국토의 계획 및 이용에 관한 법률 시행령 제84조·제85조";

// "제2종일반주거지역(7층이하)" 같은 이름에서 용도지역과 층수 제한을 찾습니다
export function findZone(names: string[]): { zone: Zone; floorCap?: number; label: string } | null {
  for (const raw of names) {
    const n = raw.replace(/\s/g, "");
    const z = ZONES.find((z) => n.includes(z.name) || n.includes(z.name.replace("지역", "")));
    if (!z) continue;
    const m = names.join(" ").match(/(\d+)층\s*이하/);
    const floorCap = m ? Number(m[1]) : z.maxFloors;
    return { zone: z, floorCap, label: raw };
  }
  return null;
}

// ── 좌표 계산 (작은 땅이라 평면으로 봐도 됩니다) ─────────────
type LL = [number, number];
const toXY = (o: LL) => (p: LL): [number, number] => [
  (p[0] - o[0]) * 111320 * Math.cos((o[1] * Math.PI) / 180),
  (p[1] - o[1]) * 110540,
];
const toLL = (o: LL) => (q: [number, number]): LL => [
  o[0] + q[0] / (111320 * Math.cos((o[1] * Math.PI) / 180)),
  o[1] + q[1] / 110540,
];

export function ringArea(ring: LL[]): number {
  const f = toXY(ring[0]);
  const xy = ring.map(f);
  let s = 0;
  for (let i = 0; i < xy.length - 1; i++) s += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1];
  return Math.abs(s) / 2;
}

function centroid(ring: LL[]): LL {
  const pts = ring.slice(0, -1);
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}

// 필지 모양을 가운데로 줄여서 원하는 바닥 면적을 맞춥니다 (거친 근사)
export function shrinkRing(ring: LL[], targetArea: number): LL[] {
  const a = ringArea(ring);
  if (a <= 0) return ring;
  const s = Math.min(1, Math.sqrt(targetArea / a));
  const c = centroid(ring);
  const f = toXY(c), g = toLL(c);
  return ring.map((p) => { const q = f(p); return g([q[0] * s, q[1] * s]); });
}

// 가장 큰 바깥 고리 하나만 씁니다
export function outerRing(geom: GeoJSON.Geometry | null | undefined): LL[] | null {
  if (!geom) return null;
  const polys: LL[][][] = geom.type === "Polygon" ? [geom.coordinates as LL[][]] : geom.type === "MultiPolygon" ? (geom.coordinates as LL[][][]) : [];
  let best: LL[] | null = null, bestA = 0;
  for (const p of polys) { const a = ringArea(p[0]); if (a > bestA) { bestA = a; best = p[0]; } }
  return best;
}

// 샘플용 네모 필지 (가운데 c, 면적 area, 가로:세로 = ratio)
export function rectRing(c: LL, area: number, ratio = 1.2): LL[] {
  const w = Math.sqrt(area * ratio), h = area / w, g = toLL(c);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]].map((q) => g(q as [number, number]));
}

// ── 임대형 기숙사 최대 매스 ─────────────────────────────────
export const FLOOR_H = 3.0;     // 층높이 (m)
export const ROOM_M2 = 20;      // 1실이 차지하는 연면적 (개인실 + 복도·공용 몫, 거친 가정)

export type Mass = {
  site: number; bcr: number; far: number;
  gfaMax: number;      // 용적률로 가능한 연면적
  floors: number;      // 층수
  footprint: number;   // 한 층 바닥 면적
  gfa: number;         // 실제로 쌓은 연면적
  height: number;
  rooms: number;
  limitedBy: string;
};

export function dormMass(site: number, bcr: number, far: number, floorCap?: number): Mass {
  const gfaMax = (site * far) / 100;
  const fpMax = (site * bcr) / 100;
  // 용적률을 다 쓰려면 몇 층이 필요한가
  let floors = Math.max(1, Math.ceil(gfaMax / fpMax - 1e-9));
  let limitedBy = "용적률";
  if (floorCap && floors > floorCap) { floors = floorCap; limitedBy = `층수 제한 ${floorCap}층`; }
  // 층마다 같은 바닥으로 쌓되, 건폐율을 넘지 않게
  const footprint = Math.min(fpMax, gfaMax / floors);
  const gfa = footprint * floors;
  return {
    site, bcr, far, gfaMax, floors, footprint, gfa,
    height: floors * FLOOR_H,
    rooms: Math.floor(gfa / ROOM_M2),
    limitedBy,
  };
}
