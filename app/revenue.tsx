"use client";

// ─────────────────────────────────────────────────────────────
// 이 땅에 뭘 지을까 → "지으면 얼마 버나" 카드
// 매스(연면적)를 받아서, 컨셉 3가지로 방을 나누고
// 주변 월세 시세로 1년 수입, 땅값+공사비로 수익률을 거칠게 셉니다.
// 숫자 칸은 화면에서 바로 고칠 수 있습니다.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";

// 주변 월세 시세 (출처는 아래 RENT_SOURCE)
// 다방 2026년 7월 조사: 서울대 인근(관악구) 원룸 평균 월세 53.5만원, 관리비 약 9.1만원
// (보증금 1천만원, 전용 33㎡ 이하 기준). 서울 주요 10개 대학가 평균은 62.5만원.
export const NEAR_RENT = 53.5;  // 만원/월
export const NEAR_FEE = 9.1;    // 만원/월
export const RENT_SOURCE = "다방 서울 주요 대학가 원룸 시세 (2026년 7월, 보증금 1천만원·전용 33㎡ 이하), 세계일보·경향신문 2026-08-11 보도";

type Concept = {
  id: string;
  name: string;
  pitch: string;        // 한 줄 컨셉
  m2PerRoom: number;    // 1실이 차지하는 연면적 (개인실 + 복도·공용 몫)
  rent: number;         // 1실 월 수입 (만원, 월세+관리비)
  occ: number;          // 입주율 %
  opex: number;         // 운영비 비율 % (관리·청소·공과금·공실 외 비용)
  rentWhy: string;
  legal: string;
};

const CONCEPTS: Concept[] = [
  {
    id: "coliving", name: "코리빙 (임대형 기숙사)",
    pitch: "작은 개인실 + 넓은 공용 주방·라운지·세탁실. 서울대·신림역 청년 1인 가구 대상, 가구·청소·커뮤니티 포함.",
    m2PerRoom: 20, rent: 75, occ: 92, opex: 30,
    rentWhy: "주변 원룸(월세+관리비 약 63만원)보다 10만원 남짓 비싸게. 역세권 대형 코리빙은 90만~100만원대도 받습니다.",
    legal: "건축법상 임대형 기숙사: 임대 20실 이상, 공동취사 쓰는 세대 절반 이상.",
  },
  {
    id: "oneroom", name: "원룸 (다세대·도시형생활주택)",
    pitch: "방마다 주방·욕실을 다 넣은 보통 원룸. 가장 익숙하고 공실 걱정이 적습니다.",
    m2PerRoom: 30, rent: Math.round(NEAR_RENT + NEAR_FEE), occ: 95, opex: 15,
    rentWhy: "서울대 인근 원룸 평균 시세 그대로 (월세 53.5만 + 관리비 9.1만).",
    legal: "주차 대수 기준이 코리빙보다 빡빡해 실제로는 방이 더 줄 수 있습니다.",
  },
  {
    id: "gosi", name: "고시원형 (다중생활시설)",
    pitch: "아주 작은 방을 많이. 보증금 거의 없이 바로 들어오는 수요.",
    m2PerRoom: 12, rent: 45, occ: 90, opex: 35,
    rentWhy: "신림·봉천 고시원은 보증금 50만~100만원에 월 30만~50만원대가 흔합니다.",
    legal: "한 건물에서 500㎡ 미만일 때만 근린생활시설. 넘으면 숙박시설이라 주거지역에는 못 짓습니다.",
  },
];

// 땅값: 신림동 실거래(trades.json)에서 같은 용도지역 '대' 필지 중앙값, 없으면 공시지가 × 1.5
type Trade = { 지목: string; 용도지역: string; 면적_m2: number; 단가_원_per_m2: number; 지분거래: boolean };

export function Revenue({ site, gfa, jiga, zoneLabel }: { site: number; gfa: number; jiga: number; zoneLabel: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  useEffect(() => {
    fetch("/data/trades.json").then((r) => r.json()).then((j) => setTrades(j["거래"] ?? [])).catch(() => {});
  }, []);

  const land = useMemo(() => {
    const zone = ZONE_KEYS.find((z) => zoneLabel.replace(/\s/g, "").includes(z)) ?? "";
    const xs = trades.filter((t) => t.지목 === "대" && !t.지분거래 && t.면적_m2 >= 50 && t.용도지역 === zone).map((t) => t.단가_원_per_m2).sort((a, b) => a - b);
    if (xs.length >= 5) return { unit: xs[Math.floor(xs.length / 2)], why: `신림동 ${zone} 대지 실거래 ${xs.length}건 중앙값 (2024-11~2026-10)` };
    const all = trades.filter((t) => t.지목 === "대" && !t.지분거래 && t.면적_m2 >= 50).map((t) => t.단가_원_per_m2).sort((a, b) => a - b);
    if (all.length >= 5) return { unit: all[Math.floor(all.length / 2)], why: `신림동 대지 전체 실거래 ${all.length}건 중앙값 (같은 용도지역 거래가 적어서)` };
    if (jiga > 0) return { unit: Math.round(jiga * 1.5), why: "공시지가 × 1.5 (실거래가 적어서 대신)" };
    return { unit: 0, why: "땅값 자료 없음" };
  }, [trades, zoneLabel, jiga]);

  const [buildPy, setBuildPy] = useState(700);    // 공사비 만원/평 (평단가 700만원)
  const build = buildPy / 3.3058;                 // 만원/㎡ (1평 = 3.3058㎡)
  const [rents, setRents] = useState<Record<string, number>>(Object.fromEntries(CONCEPTS.map((c) => [c.id, c.rent])));

  const landCost = (land.unit * site) / 1e4;              // 만원
  const buildCost = build * gfa * 1.1;                    // 만원, 설계·인허가·금융 10% 얹음
  const total = landCost + buildCost;

  const rows = CONCEPTS.map((c) => {
    const area = c.id === "gosi" ? Math.min(gfa, 499) : gfa;
    const rooms = Math.floor(area / c.m2PerRoom);
    const rent = rents[c.id];
    const year = rooms * rent * 12 * (c.occ / 100);       // 만원
    const noi = year * (1 - c.opex / 100);
    const cost = c.id === "gosi" ? landCost + build * area * 1.1 : total;
    const bcost = build * area * 1.1;
    return { c, rooms, rent, year, noi, yld: cost > 0 ? (noi / cost) * 100 : 0, own: bcost > 0 ? (noi / bcost) * 100 : 0, area };
  });
  const best = rows.reduce((a, b) => (b.yld > a.yld ? b : a), rows[0]);

  const eok = (man: number) => `${(man / 1e4).toFixed(1)}억`;

  return (
    <>
      <h3>이렇게 지으면 얼마 버나 (거친 계산)</h3>
      <table><tbody>
        <tr><th>주변 원룸 시세</th><td>월세 {NEAR_RENT}만 + 관리비 {NEAR_FEE}만원 <small>(서울대 인근, 다방 2026.7)</small></td></tr>
        <tr><th>땅값</th><td>{land.unit > 0 ? <>㎡당 {Math.round(land.unit / 1e4).toLocaleString("ko-KR")}만원 → <b>{eok(landCost)}</b></> : "모름"}<br /><small>{land.why}</small></td></tr>
        <tr><th>공사비</th><td>
          평당 <input className="num" type="number" value={buildPy} onChange={(e) => setBuildPy(Number(e.target.value) || 0)} />만원 → <b>{eok(buildCost)}</b>
          <br /><small>연면적 × 공사비 × 1.1 (설계·인허가·이자) · ㎡당 약 {Math.round(build)}만원</small>
        </td></tr>
        <tr><th>총 들어가는 돈</th><td><b>{eok(total)}</b></td></tr>
      </tbody></table>

      {rows.map(({ c, rooms, rent, year, noi, yld, own, area }) => (
        <div key={c.id} className={`concept ${c.id === best.c.id ? "best" : ""}`}>
          <div className="concept-head"><b>{c.name}</b>{c.id === best.c.id && <span className="tag">수익률 1위</span>}</div>
          <p className="pitch">{c.pitch}</p>
          <div className="big">
            <div><small>방</small><b>{rooms}실</b></div>
            <div><small>1년 임대수입</small><b>{eok(year)}</b></div>
            <div><small>수익률(운영비 뺀 뒤)</small><b>{yld.toFixed(1)}%</b></div>
          </div>
          <p className="note">
            1실 월 <input className="num" type="number" value={rent} onChange={(e) => setRents({ ...rents, [c.id]: Number(e.target.value) || 0 })} />만원 · 입주율 {c.occ}% · 운영비 {c.opex}% → 순수입 연 {eok(noi)}
            {area < gfa && <> · 500㎡ 미만만 써서 {Math.round(area)}㎡ 기준</>}
            <br /><b>땅을 이미 갖고 있다면</b> 공사비만 따져 수익률 {own.toFixed(1)}%
            <br />{c.rentWhy}<br />{c.legal}
          </p>
        </div>
      ))}

      <p className="note">
        월세 출처: {RENT_SOURCE}. 고시원 시세는 신림·봉천 매물 광고 범위. 수익률 = (1년 임대수입 × 입주율 − 운영비) ÷ (땅값 + 공사비). 세금, 대출 이자, 보증금 운용, 주차·조경으로 줄어드는 방은 넣지 않았습니다.
        단기 숙박(에어비앤비 같은 외국인관광 도시민박)은 연면적 230㎡ 미만 주택에서만 되므로 이 규모에서는 뺐습니다.
      </p>
    </>
  );
}

const ZONE_KEYS = ["제1종일반주거지역", "제2종일반주거지역", "제3종일반주거지역", "준주거지역", "일반상업지역", "근린상업지역"];
