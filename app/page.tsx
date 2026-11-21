"use client";

// ─────────────────────────────────────────────────────────────
// 주변 상권 분석 키트
// ① 키는 Vercel 환경변수(VWORLD_KEY, DATA_GO_KR_KEY)에 넣어 두면 서버가 읽습니다
// ② 지번을 찾거나 지도를 눌러 가운데를 정한 뒤
// ③ 반경을 골라 [상권 분석]을 누르면 → 주변 상가를 업종별로 세어 보여 줍니다.
//    지도를 누르면 그곳을 가운데로 바로 분석하고, 해 볼 만한 업종도 뽑습니다(app/insight.tsx).
// 키가 없어도 신림동 1573-28 샘플 파일(public/data/stores.json)로 돌아갑니다.
//
// [이 땅에 뭘 지을까] 탭
// 지도에서 필지를 누르면 → 필지 경계·토지이용계획(토지이음과 같은 자료)을 읽고
// → 용도지역의 건폐율·용적률로 임대형 기숙사를 가장 크게 지은 매스를 3D로 세웁니다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import type * as MLGL from "maplibre-gl";
import { Revenue } from "./revenue";
import { Insight } from "./insight";
import { api, type KeyStatus } from "@/lib/keys";
import { dormMass, findZone, outerRing, rectRing, ringArea, shrinkRing, FLOOR_H, ROOM_M2, ZONES_SOURCE, type Mass, type Zone } from "@/lib/zoning";

declare global {
  interface Window { maplibregl: typeof MLGL; __map?: MLGL.Map }
}

type Store = { 이름: string; 대분류: string; 중분류: string; 소분류: string; 층: string; 지번주소: string; 도로명주소: string; lon: number; lat: number };

// 업종(대분류)별 점 색
const COLORS: Record<string, string> = {
  음식: "#e4572e", 소매: "#2e86ab", "수리·개인": "#8d6a9f", "과학·기술": "#3f7d20", 교육: "#f2a541",
  "예술·스포츠": "#c03f8b", "시설관리·임대": "#6b7f8e", 보건의료: "#1b998b", 부동산: "#a0522d", 숙박: "#5c4d7d",
};
const colorOf = (c: string) => COLORS[c] ?? "#999";

// 신림동 1573-28 (샘플 파일의 가운데)
const SAMPLE_CENTER: [number, number] = [126.919353, 37.481374];

// 두 점 사이 거리(m)
function meters(a: [number, number], b: [number, number]) {
  const R = 6371000, t = Math.PI / 180;
  const dLat = (b[1] - a[1]) * t, dLon = (b[0] - a[0]) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 지도에 그릴 반경 원
function circle(center: [number, number], r: number): GeoJSON.Feature {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    const dx = (r * Math.cos(a)) / (111320 * Math.cos((center[1] * Math.PI) / 180));
    const dy = (r * Math.sin(a)) / 110540;
    pts.push([center[0] + dx, center[1] + dy]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}

const vworld = (path: string, params: Record<string, string>) =>
  `/api/vworld?path=${encodeURIComponent(path)}&${new URLSearchParams(params).toString()}`;

type LL = [number, number];
const FC = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const poly = (ring: LL[], props: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [ring] } });
const won = (n: number) => n.toLocaleString("ko-KR");
const m2 = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}㎡`;

// 필지를 읽은 결과
type Parcel = {
  addr: string; pnu: string; ring: LL[]; site: number; jimok: string; jiga: number;
  uses: string[];                                   // 토지이용계획 지역·지구 이름들
  zone: { zone: Zone; floorCap?: number; label: string } | null;
  seoul: boolean; mass: Mass | null; from: string;
};

// 키가 없을 때 보여 줄 샘플: 신림동 1573-28 (2026-10-29 토지이음에서 확인한 값, 모양은 네모로 대신)
const SAMPLE_PARCEL = { addr: "서울특별시 관악구 신림동 1573-28 (샘플)", pnu: "1162010200115730028", site: 278, jimok: "대", jiga: 4829000,
  uses: ["도시지역", "제2종일반주거지역(7층이하)", "가축사육제한구역", "교육환경보호구역", "대공방어협조구역(위탁고도:194m)", "과밀억제권역", "중점경관관리구역(주요산 주변)"] };

// VWorld 응답에서 첫 번째 지형지물 꺼내기
function firstFeature(j: any): GeoJSON.Feature | null {
  if (j?.error) throw new Error(j.error);
  const r = j?.response;
  if (r?.status === "NOT_FOUND") return null;
  if (r?.status && r.status !== "OK") throw new Error(`VWorld: ${r?.error?.text ?? r.status}`);
  return r?.result?.featureCollection?.features?.[0] ?? null;
}

export default function Page() {
  const mapBox = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLGL.Map | null>(null);

  // ① 서버(Vercel 환경변수)에 키가 들어 있는지만 확인합니다. 키 값은 화면으로 안 옵니다.
  const [saved, setSaved] = useState<KeyStatus>({ vworld: false, datagokr: false });
  const savedRef = useRef(saved);
  useEffect(() => {
    fetch("/api/keys").then((r) => r.json()).then((k: KeyStatus) => { savedRef.current = k; setSaved(k); analyzeRef.current(); }).catch(() => analyzeRef.current());
  }, []);

  // ② 가운데와 반경
  const [addr, setAddr] = useState("서울특별시 관악구 신림동 1573-28");
  const [center, setCenter] = useState<[number, number]>(SAMPLE_CENTER);
  const [radius, setRadius] = useState(500);

  // ③ 분석 결과
  const [stores, setStores] = useState<Store[]>([]);
  const [source, setSource] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [mapNote, setMapNote] = useState("");

  // 탭: 상권 분석 / 이 땅에 뭘 지을까
  const [tab, setTab] = useState<"상권" | "규모">("상권");
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [pBusy, setPBusy] = useState(false);
  const [pMsg, setPMsg] = useState("");
  const pickRef = useRef<(p: LL) => void>(() => {});
  const analyzeRef = useRef<(c?: LL) => void>(() => {});
  const seq = useRef(0);   // 여러 번 누르면 마지막 것만 보여 주려고 세는 번호

  // 지도 만들기 ──────────────────────────────────────────
  useEffect(() => {
    if (!mapBox.current || mapRef.current) return;
    const ml = window.maplibregl;
    (async () => {
      // VWorld 키가 되면 VWorld 배경지도, 아니면 OpenStreetMap
      const ok = await fetch("/api/vworld-tile?t=Base&z=12&y=1587&x=3491").then((r) => r.ok).catch(() => false);
      const tiles = ok ? ["/api/vworld-tile?t=Base&z={z}&y={y}&x={x}"] : ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];
      if (!ok) setMapNote("배경지도: VWorld 키가 없거나 아직 안 돼서 OpenStreetMap으로 보여 주는 중입니다.");
      const map = new ml.Map({
        container: mapBox.current!,
        style: {
          version: 8,
          sources: { base: { type: "raster", tiles, tileSize: 256, attribution: ok ? "© VWorld" : "© OpenStreetMap" } },
          layers: [{ id: "base", type: "raster", source: "base" }],
        },
        center: SAMPLE_CENTER,
        zoom: 15.5,
        maxPitch: 75,
      });
      map.addControl(new ml.NavigationControl(), "top-left");
      map.on("load", () => {
        const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
        map.addSource("ring", { type: "geojson", data: empty });
        map.addLayer({ id: "ring-fill", type: "fill", source: "ring", paint: { "fill-color": "#1a3636", "fill-opacity": 0.06 } });
        map.addLayer({ id: "ring-line", type: "line", source: "ring", paint: { "line-color": "#1a3636", "line-width": 1.5, "line-dasharray": [2, 2] } });
        map.addSource("stores", { type: "geojson", data: empty });
        map.addLayer({
          id: "stores", type: "circle", source: "stores",
          paint: {
            "circle-radius": 5, "circle-stroke-width": 1, "circle-stroke-color": "#fff",
            "circle-color": ["match", ["get", "대분류"], ...Object.entries(COLORS).flat(), "#999"] as unknown as MLGL.ExpressionSpecification,
          },
        });
        map.addSource("center", { type: "geojson", data: empty });
        map.addLayer({ id: "center", type: "circle", source: "center", paint: { "circle-radius": 8, "circle-color": "#1a3636", "circle-stroke-width": 3, "circle-stroke-color": "#fff" } });

        // 규모 검토: 주변 건물, 필지 경계, 매스
        map.addSource("nb", { type: "geojson", data: empty });
        map.addLayer({ id: "nb", type: "fill-extrusion", source: "nb", paint: { "fill-extrusion-color": "#e4e6ea", "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 0.6 } });
        map.addSource("parcel", { type: "geojson", data: empty });
        map.addLayer({ id: "parcel-fill", type: "fill", source: "parcel", paint: { "fill-color": "#d96b43", "fill-opacity": 0.12 } });
        map.addLayer({ id: "parcel-line", type: "line", source: "parcel", paint: { "line-color": "#d96b43", "line-width": 2.5 } });
        map.addSource("mass", { type: "geojson", data: empty });
        map.addLayer({ id: "mass", type: "fill-extrusion", source: "mass", paint: { "fill-extrusion-color": "#e8794f", "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "b"], "fill-extrusion-opacity": 0.95 } });

        // 점을 누르면 가게 이름과 업종
        map.on("click", "stores", (e) => {
          const p = e.features?.[0]?.properties as Record<string, string> | undefined;
          if (!p) return;
          new ml.Popup().setLngLat(e.lngLat).setHTML(`<b>${p.이름}</b><br/>${p.대분류} · ${p.소분류}${p.층 ? ` · ${p.층}층` : ""}<br/><small>${p.지번주소 ?? ""}</small>`).addTo(map);
        });
        map.on("mouseenter", "stores", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "stores", () => (map.getCanvas().style.cursor = ""));
        // 빈 곳을 누르면 거기를 가운데로
        map.on("click", (e) => {
          if (tabRef.current === "규모") { pickRef.current([e.lngLat.lng, e.lngLat.lat]); return; }
          if (map.queryRenderedFeatures(e.point, { layers: ["stores"] }).length) return;
          const c: LL = [e.lngLat.lng, e.lngLat.lat];
          setCenter(c);
          analyzeRef.current(c);   // 누른 곳을 바로 분석
        });
        drawRing(map, SAMPLE_CENTER, 500);
      });
      mapRef.current = map;
      window.__map = map;
    })();
  }, []);

  function drawRing(map: MLGL.Map, c: [number, number], r: number) {
    (map.getSource("ring") as MLGL.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [circle(c, r)] });
    (map.getSource("center") as MLGL.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } }] });
  }
  useEffect(() => { if (mapRef.current?.isStyleLoaded()) drawRing(mapRef.current, center, radius); }, [center, radius]);

  // 지도에 상가 점 다시 그리기 (숨긴 업종 빼고)
  useEffect(() => {
    const src = mapRef.current?.getSource("stores") as MLGL.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: stores.filter((s) => !hidden.has(s.대분류)).map((s) => ({ type: "Feature", properties: s, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })),
    });
  }, [stores, hidden]);

  // 지번 → 좌표 (VWorld 키 필요)
  async function findAddr() {
    setMsg("");
    try {
      const g = await api(vworld("req/address", {
        service: "address", request: "getcoord", version: "2.0", crs: "epsg:4326", type: "parcel", address: addr, format: "json",
      })).then((r) => r.json());
      if (g?.error) throw new Error(g.error);
      const pt = g?.response?.result?.point;
      if (!pt) throw new Error("주소를 찾지 못했어요. '서울특별시 ○○구 ○○동 123-45'처럼 지번 주소로 넣어 보세요.");
      const c: [number, number] = [Number(pt.x), Number(pt.y)];
      setCenter(c);
      mapRef.current?.flyTo({ center: c, zoom: 15.5 });
      analyze(c);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  // 상권 분석: 공공데이터포털 키가 있으면 바로 조회, 없으면 샘플 파일
  // c, r을 안 주면 지금 화면의 가운데와 반경으로 셉니다
  async function analyze(c: LL = center, r: number = radius) {
    const id = ++seq.current;
    setBusy(true); setMsg(""); setHidden(new Set());
    try {
      let list: Store[] = [];
      let from = "";
      if (savedRef.current.datagokr) {
        const res = await api(`/api/stores?cx=${c[0]}&cy=${c[1]}&radius=${r}`);
        const j = await res.json();
        if (res.ok) { list = j.상가; from = "공공데이터포털 상가(상권)정보 · 방금 조회"; }
        else setMsg(`${j.error ?? "조회 실패"} → 이번에는 샘플 파일로 보여 줍니다.`);
      }
      if (!from) {
        const j = await fetch("/data/stores.json").then((r) => r.json());
        list = (j.상가 as Store[]).filter((s) => meters(c, [s.lon, s.lat]) <= r);
        from = "샘플 파일 stores.json (신림동 1573-28 반경 500m, 2026-10-29 조회)";
        if (meters(c, SAMPLE_CENTER) + r > 520)
          setMsg((m) => (m ? m + "\n" : "") + "샘플 파일은 신림동 1573-28 반경 500m만 들어 있어요. 다른 곳은 공공데이터포털 키를 넣어야 제대로 나옵니다.");
      }
      if (id !== seq.current) return;   // 그 사이 다른 곳을 눌렀으면 버림
      setStores(list);
      setSource(from);
    } catch (e) {
      if (id === seq.current) setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }
  analyzeRef.current = analyze;

  // 업종별로 세기
  const byMajor = useMemo(() => tally(stores.map((s) => s.대분류)), [stores]);
  const byMinor = useMemo(() => tally(stores.map((s) => s.소분류)).slice(0, 10), [stores]);
  const max = byMajor[0]?.[1] ?? 1;

  // ── 이 땅에 뭘 지을까 ────────────────────────────────────
  // 필지 하나를 읽어서 임대형 기숙사 최대 매스를 계산합니다
  function finish(p: Omit<Parcel, "zone" | "seoul" | "mass">): Parcel {
    const zone = findZone(p.uses);
    const seoul = p.pnu.startsWith("11");
    let mass: Mass | null = null;
    if (zone && p.site > 0) {
      const [bcr, far] = seoul ? zone.zone.seoul : zone.zone.nation;
      mass = dormMass(p.site, bcr, far, zone.floorCap);
    }
    return { ...p, zone, seoul, mass };
  }

  // 지도에 필지·매스·주변 건물 그리기
  function draw(p: Parcel, nb: GeoJSON.Feature[] = []) {
    const map = mapRef.current; if (!map) return;
    (map.getSource("parcel") as MLGL.GeoJSONSource).setData(FC([poly(p.ring)]));
    const ok = p.mass && p.zone?.zone.dorm !== "불가";
    const fp = ok ? shrinkRing(p.ring, p.mass!.footprint) : null;
    // 층마다 한 덩어리씩 쌓아 층이 보이게
    const floors: GeoJSON.Feature[] = fp ? Array.from({ length: p.mass!.floors }, (_, i) => poly(fp, { b: i * FLOOR_H, h: (i + 1) * FLOOR_H - 0.15 })) : [];
    (map.getSource("mass") as MLGL.GeoJSONSource).setData(FC(floors));
    (map.getSource("nb") as MLGL.GeoJSONSource).setData(FC(nb));
    const c = p.ring.slice(0, -1).reduce((a, q) => [a[0] + q[0], a[1] + q[1]], [0, 0]).map((v) => v / (p.ring.length - 1)) as LL;
    map.easeTo({ center: c, zoom: 18.7, pitch: 60, bearing: -30, duration: 1200 });
  }

  function showSample() {
    const p = finish({ ...SAMPLE_PARCEL, ring: rectRing(SAMPLE_CENTER, SAMPLE_PARCEL.site, 1.25), from: "샘플 (2026-10-29 토지이음 열람값, 필지 모양은 같은 면적의 네모)" });
    setParcel(p); draw(p);
  }

  async function pickParcel(pt: LL) {
    setPMsg("");
    if (!savedRef.current.vworld) { showSample(); setPMsg("서버에 VWorld 키가 없어서 신림동 1573-28 샘플로 보여 줍니다. Vercel 환경변수에 VWORLD_KEY를 넣으면 누른 필지를 바로 읽습니다."); return; }
    setPBusy(true);
    try {
      const data = (layer: string, geomFilter: string, size = "1") => api(vworld("req/data", {
        service: "data", request: "GetFeature", version: "2.0", data: layer, geomFilter, crs: "EPSG:4326",
        format: "json", geometry: "true", attribute: "true", size,
      })).then((r) => r.json());
      const POINT = `POINT(${pt[0]} ${pt[1]})`;

      // 1) 필지 경계 (연속지적도)
      const f = firstFeature(await data("LP_PA_CBND_BUBUN", POINT));
      if (!f) throw new Error("여기에는 필지가 없어요. 땅 위를 눌러 보세요.");
      const pr = (f.properties ?? {}) as Record<string, string>;
      const ring = outerRing(f.geometry);
      if (!ring) throw new Error("필지 모양을 읽지 못했어요.");
      const pnu = pr.pnu ?? "";

      // 2) 토지이용계획 (토지이음에 나오는 지역·지구와 같은 국토부 자료)
      const lu = await api(vworld("ned/data/getLandUseAttr", { pnu, numOfRows: "100", pageNo: "1", format: "json" })).then((r) => r.json()).catch(() => null);
      const fields: Record<string, string>[] = lu?.landUses?.field ?? [];
      const uses = [...new Set(fields.filter((x) => x.cnflcAtNm !== "접합").map((x) => x.prposAreaDstrcCodeNm).filter(Boolean))];
      // 용도지역이 안 잡히면 용도지역 지도(LT_C_UQ111)로 한 번 더
      if (!findZone(uses)) {
        const uq = firstFeature(await data("LT_C_UQ111", POINT).catch(() => null));
        const nm = (uq?.properties as Record<string, string> | undefined)?.uname;
        if (nm) uses.unshift(nm);
      }

      // 3) 토지특성: 공부상 면적, 지목, 공시지가 (올해 자료가 없으면 작년)
      let lc: Record<string, string> | undefined;
      for (const y of [new Date().getFullYear(), new Date().getFullYear() - 1]) {
        const j = await api(vworld("ned/data/getLandCharacteristics", { pnu, stdrYear: String(y), numOfRows: "1", pageNo: "1", format: "json" })).then((r) => r.json()).catch(() => null);
        lc = j?.landCharacteristicss?.field?.[0];
        if (lc) break;
      }
      const site = Number(lc?.lndpclAr) || ringArea(ring);

      const p = finish({
        addr: pr.addr ?? pr.jibun ?? "", pnu, ring, site,
        jimok: lc?.lndcgrCodeNm ?? "", jiga: Number(lc?.pblntfPclnd ?? pr.jiga ?? 0), uses,
        from: `VWorld 연속지적도 · 토지이용계획 · 토지특성 (방금 조회${lc ? "" : ", 면적은 지도 모양으로 계산"})`,
      });
      setParcel(p);

      // 4) 주변 건물 (도로명주소 건물, 지상 층수 × 3m). 선택한 필지 위의 기존 건물은 뺍니다.
      const [x, y] = pt, d = 0.0015;
      const nbj = await data("LT_C_SPBD", `BOX(${x - d},${y - d},${x + d},${y + d})`, "1000").catch(() => null);
      const inRing = (q: LL, r: LL[]) => {
        let c = false;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          if ((r[i][1] > q[1]) !== (r[j][1] > q[1]) && q[0] < ((r[j][0] - r[i][0]) * (q[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
        }
        return c;
      };
      const mid = (r: LL[]) => r.slice(0, -1).reduce((a, q) => [a[0] + q[0] / (r.length - 1), a[1] + q[1] / (r.length - 1)], [0, 0]) as LL;
      const onParcel = (g: GeoJSON.Feature) => {
        const br = outerRing(g.geometry);
        if (!br) return false;
        const inside = br.filter((q) => inRing(q, ring)).length;
        return inRing(mid(br), ring) || inRing(mid(ring), br) || inside >= br.length / 2;
      };
      const nb: GeoJSON.Feature[] = (nbj?.response?.result?.featureCollection?.features ?? []).filter((g: GeoJSON.Feature) => !onParcel(g)).map((g: GeoJSON.Feature) => ({
        ...g, properties: { h: Math.max(1, Number((g.properties as Record<string, string>)?.gro_flo_co) || 1) * 3 },
      }));
      draw(p, nb);
    } catch (e) {
      setPMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setPBusy(false);
    }
  }
  pickRef.current = pickParcel;

  function switchTab(t: "상권" | "규모") {
    setTab(t);
    const map = mapRef.current; if (!map) return;
    const show = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    ["ring-fill", "ring-line", "stores", "center"].forEach((id) => show(id, t === "상권"));
    ["nb", "parcel-fill", "parcel-line", "mass"].forEach((id) => show(id, t === "규모"));
    if (t === "상권") map.easeTo({ pitch: 0, bearing: 0, zoom: 15.5, center, duration: 800 });
    else if (parcel) draw(parcel);
  }

  function toggle(cat: string) {
    setHidden((h) => { const n = new Set(h); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
  }

  return (
    <div className="wrap">
      <div ref={mapBox} className="map" />
      <aside className="panel">
        <h1>주변 상권 분석 키트</h1>
        <div className="tabs">
          <button className={tab === "상권" ? "on" : ""} onClick={() => switchTab("상권")}>상권 분석</button>
          <button className={tab === "규모" ? "on" : ""} onClick={() => switchTab("규모")}>이 땅에 뭘 지을까</button>
        </div>
        <p className="sub">{tab === "상권" ? "가운데를 정하고 반경을 고르면, 주변 상가를 업종별로 세어 줍니다." : "필지를 누르면 토지이용계획을 읽고, 임대형 기숙사를 가장 크게 지은 매스를 세웁니다."}</p>

        {/* ① 서버 키 상태 (키는 Vercel 환경변수에 있음) */}
        <section className="keys">
          <div className="keys-head"><b>API 키</b></div>
          <p className="note" style={{ margin: 0 }}>
            VWorld <span className={saved.vworld ? "ok" : "no"}>{saved.vworld ? "연결됨" : "없음"}</span>
            {"  "}공공데이터포털 <span className={saved.datagokr ? "ok" : "no"}>{saved.datagokr ? "연결됨" : "없음 · 샘플 사용"}</span>
          </p>
          <p className="note">키는 Vercel 환경변수에 들어 있어요. 화면에는 안 보입니다.</p>
        </section>

        {tab === "상권" && <>
        {/* ② 가운데와 반경 */}
        <section>
          <b>가운데 정하기</b>
          <div className="search">
            <input value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && findAddr()} />
            <button onClick={findAddr} disabled={!saved.vworld} title={saved.vworld ? "" : "VWorld 키가 있어야 지번을 찾습니다"}>찾기</button>
          </div>
          <p className="note">지도를 누르면 그곳을 가운데로 바로 분석합니다. 지금: {center[1].toFixed(5)}, {center[0].toFixed(5)}</p>
          <div className="radius">
            {[300, 500, 1000].map((r) => (
              <button key={r} className={r === radius ? "on" : ""} onClick={() => { setRadius(r); analyze(center, r); }}>{r >= 1000 ? `${r / 1000}km` : `${r}m`}</button>
            ))}
          </div>
          {busy && <p className="note">세는 중…</p>}
        </section>

        {mapNote && <div className="note">{mapNote}</div>}
        {msg && <div className="msg">{msg}</div>}

        {/* ③ 결과 */}
        {source && (
          <section className="card">
            <h2>반경 {radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} 안 상가 {stores.length.toLocaleString("ko-KR")}곳</h2>
            <p className="note">출처: {source}</p>
            <Insight stores={stores} center={center} radius={radius} />
            <h3>업종별 (누르면 지도에서 숨기기)</h3>
            {byMajor.map(([cat, n]) => (
              <button key={cat} className={`bar ${hidden.has(cat) ? "off" : ""}`} onClick={() => toggle(cat)}>
                <span className="name"><i style={{ background: colorOf(cat) }} />{cat}</span>
                <span className="track"><span style={{ width: `${(n / max) * 100}%`, background: colorOf(cat) }} /></span>
                <span className="n">{n} <small>{Math.round((n / stores.length) * 100)}%</small></span>
              </button>
            ))}
            <h3>많은 업종 10개</h3>
            <ol className="top">
              {byMinor.map(([cat, n]) => <li key={cat}><span>{cat}</span><b>{n}</b></li>)}
            </ol>
          </section>
        )}
        </>}

        {tab === "규모" && <ParcelPanel parcel={parcel} busy={pBusy} msg={pMsg} hasKey={!!saved.vworld} onSample={() => { setPMsg(""); showSample(); }} />}
      </aside>
    </div>
  );
}

function tally(xs: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x || "기타", (m.get(x || "기타") ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// ── 이 땅에 뭘 지을까: 결과 카드 ───────────────────────────────
function ParcelPanel({ parcel: p, busy, msg, hasKey, onSample }: { parcel: Parcel | null; busy: boolean; msg: string; hasKey: boolean; onSample: () => void }) {
  return (
    <>
      <section>
        <b>필지 고르기</b>
        <p className="note">{hasKey ? "지도에서 땅을 한 번 누르면 바로 읽습니다. 필지 경계, 토지이용계획, 면적을 읽어 옵니다." : "VWorld 키가 없으면 신림동 1573-28 샘플로 먼저 봅니다."}</p>
        {busy && <p className="note">읽는 중…</p>}
      </section>
      {msg && <div className="msg">{msg}</div>}
      {p && (
        <section className="card">
          <h2>{p.addr}</h2>
          <table><tbody>
            <tr><th>대지면적</th><td>{m2(p.site)}{p.jimok && ` · 지목 ${p.jimok}`}</td></tr>
            {p.jiga > 0 && <tr><th>공시지가</th><td>{won(p.jiga)}원/㎡ <small>(참고용 · 아래 수익 계산의 땅값은 주변 실거래 시세)</small></td></tr>}
            <tr><th>용도지역</th><td><b>{p.zone?.label ?? "못 찾음"}</b></td></tr>
            <tr><th>그 밖의 지역·지구</th><td className="uses">{p.uses.filter((u) => u !== p.zone?.label && u !== "도시지역").join(", ") || "없음"}</td></tr>
          </tbody></table>

          {p.zone && p.mass && (
            <>
              <h3>임대형 기숙사로 가장 크게 지으면</h3>
              {p.zone.zone.dorm === "불가" ? (
                <div className="verdict no">이 용도지역에는 기숙사를 지을 수 없습니다. {p.zone.zone.why}</div>
              ) : (
                <>
                  {p.zone.zone.dorm === "조례 확인" && <div className="verdict mid">조례 확인 필요: {p.zone.zone.why}</div>}
                  {p.zone.zone.dorm === "가능" && p.zone.zone.why && <p className="note">{p.zone.zone.why}</p>}
                  <div className="big">
                    <div><small>연면적</small><b>{m2(p.mass.gfa)}</b></div>
                    <div><small>층수</small><b>{p.mass.floors}층</b></div>
                    <div><small>실 수(대략)</small><b>{p.mass.rooms}실</b></div>
                  </div>
                  <table><tbody>
                    <tr><th>건폐율 · 용적률</th><td>{p.mass.bcr}% · {p.mass.far}% <small>({p.seoul ? "서울시 조례" : "법 상한, 시·군 조례 확인"})</small></td></tr>
                    <tr><th>한 층 바닥</th><td>{m2(p.mass.footprint)} (최대 {m2((p.site * p.mass.bcr) / 100)})</td></tr>
                    <tr><th>높이</th><td>약 {p.mass.height.toFixed(0)}m (층높이 {FLOOR_H}m)</td></tr>
                    <tr><th>막힌 곳</th><td>{p.mass.limitedBy}{p.mass.gfa < p.mass.gfaMax - 1 && ` · 용적률 ${m2(p.mass.gfaMax - p.mass.gfa)} 남음`}</td></tr>
                  </tbody></table>
                  <div className={`verdict ${p.mass.rooms >= 20 ? "ok" : "mid"}`}>
                    {p.mass.rooms >= 20 ? "임대형 기숙사 조건 중 임대 20실 이상은 넘깁니다. 공동취사시설을 쓰는 세대가 절반 이상이어야 하는 조건도 있습니다." : "20실이 안 돼서 임대형 기숙사 조건(임대 20실 이상, 건축법 시행령 별표1)에 못 미칩니다."}
                  </div>
                  <Revenue site={p.site} gfa={p.mass.gfa} jiga={p.jiga} zoneLabel={p.zone.label} />
                </>
              )}
            </>
          )}
          <p className="note">
            출처: {p.from}. 건폐율·용적률은 {ZONES_SOURCE}.<br />
            거친 1차 검토입니다. 일조 사선, 도로 사선, 주차, 조경, 지구단위계획, 대지 안의 공지는 넣지 않았고, 매스는 필지 모양을 가운데로 줄여 그렸습니다. 실 수는 연면적 ÷ {ROOM_M2}㎡로 셌습니다.
          </p>
        </section>
      )}
    </>
  );
}
