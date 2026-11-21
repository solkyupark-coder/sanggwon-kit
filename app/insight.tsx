"use client";

// ─────────────────────────────────────────────────────────────
// 상권 분석 → "한눈에 보기" 카드
// 방금 센 상가 목록만 가지고 규칙으로 뽑습니다. (AI를 부르지 않습니다)
// ① 어떤 상권인지 한 줄  ② 해 볼 만한 업종  ③ 이미 많은 업종
// 규칙과 숫자는 아래 CHECK, 기준값에서 바로 고칠 수 있습니다.
// ─────────────────────────────────────────────────────────────

type S = { 대분류: string; 소분류: string; lon: number; lat: number };

// 동네에서 흔히 찾는 업종. test는 소분류 이름으로 고릅니다.
const CHECK: { name: string; test: (s: string) => boolean }[] = [
  { name: "카페", test: (s) => s === "카페" },
  { name: "편의점", test: (s) => s.includes("편의점") },
  { name: "빵집·디저트", test: (s) => /빵|도넛|아이스크림|떡/.test(s) },
  { name: "치킨", test: (s) => s.includes("치킨") },
  { name: "분식", test: (s) => s.includes("분식") },
  { name: "버거·샌드위치", test: (s) => /버거|샌드위치/.test(s) },
  { name: "약국", test: (s) => s.includes("약국") },
  { name: "의원·치과", test: (s) => /의원|병원/.test(s) && !s.includes("동물") },
  { name: "미용실", test: (s) => s.includes("미용실") },
  { name: "세탁소·빨래방", test: (s) => /세탁소|빨래방/.test(s) },
  { name: "헬스·필라테스", test: (s) => /헬스|필라테스/.test(s) },
  { name: "스터디카페", test: (s) => s.includes("스터디") },
  { name: "반찬가게", test: (s) => s.includes("반찬") },
  { name: "정육·과일가게", test: (s) => /정육|채소/.test(s) },
  { name: "꽃집", test: (s) => s.includes("꽃집") },
  { name: "동물병원·펫숍", test: (s) => /동물병원|애완/.test(s) },
  { name: "서점·문구", test: (s) => /서점|문구/.test(s) },
];

function meters(a: [number, number], b: [number, number]) {
  const R = 6371000, t = Math.PI / 180;
  const dLat = (b[1] - a[1]) * t, dLon = (b[0] - a[0]) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function Insight({ stores, center, radius }: { stores: S[]; center: [number, number]; radius: number }) {
  const total = stores.length;
  if (total < 20) return <div className="verdict mid">반경 안 상가가 {total}곳뿐이라 판단하기 이릅니다. 반경을 넓혀 보세요.</div>;

  const share = (cat: string) => stores.filter((s) => s.대분류 === cat).length / total;
  const count = (re: RegExp) => stores.filter((s) => re.test(s.소분류)).length;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  // ① 어떤 상권인지
  const major = new Map<string, number>();
  for (const s of stores) major.set(s.대분류, (major.get(s.대분류) ?? 0) + 1);
  const [m1, m2] = [...major.entries()].sort((a, b) => b[1] - a[1]);
  const office = share("과학·기술") + share("시설관리·임대") + share("부동산");
  const kind =
    share("교육") >= 0.12 ? "학원가 성격이 강한 상권"
    : share("음식") >= 0.35 ? "먹자골목에 가까운 상권"
    : office >= 0.3 ? "사무실·서비스업이 많이 섞인 상권"
    : share("음식") + share("소매") >= 0.45 ? "밥집과 가게가 중심인 동네 생활 상권"
    : "여러 업종이 고르게 섞인 상권";
  const ha = (Math.PI * radius * radius) / 10000;

  // ② 업종별로 세고, 가장 가까운 곳까지 거리
  const rows = CHECK.map((c) => {
    const hit = stores.filter((s) => c.test(s.소분류));
    const near = hit.length ? Math.round(Math.min(...hit.map((s) => meters(center, [s.lon, s.lat])))) : null;
    return { name: c.name, n: hit.length, near };
  });

  // 주변 사정으로 가산점: 손님이 있을 만한 근거
  const 학원 = count(/학원/), 숙박 = stores.filter((s) => s.대분류 === "숙박").length, 의원 = count(/의원/) , 밥집 = share("음식");
  const why: Record<string, string> = {};
  if (학원 >= 15) for (const k of ["스터디카페", "분식", "버거·샌드위치", "서점·문구"]) why[k] = `학원이 ${학원}곳이라 학생 손님이 있습니다.`;
  if (숙박 >= 10) for (const k of ["세탁소·빨래방", "편의점", "반찬가게"]) why[k] = `숙박·고시원이 ${숙박}곳이라 혼자 사는 사람 수요가 있습니다.`;
  if (밥집 >= 0.25) for (const k of ["빵집·디저트", "카페"]) why[k] ??= `음식점이 ${pct(밥집)}라 밥 먹고 들르는 손님이 있습니다.`;
  if (의원 >= 10) why["약국"] = `의원이 ${의원}곳 있습니다.`;

  // 빈자리(0곳)와 적은 업종(전체의 0.6% 미만이고 3곳 이하)을 고르고, 근거가 있는 것을 앞으로
  const scarce = rows.filter((r) => r.n === 0 || (r.n <= 3 && r.n / total < 0.006));
  const picks = scarce.sort((a, b) => (why[b.name] ? 1 : 0) - (why[a.name] ? 1 : 0) || a.n - b.n).slice(0, 3);

  // ③ 이미 많은 업종 (전체의 3% 이상)
  const crowded = rows.filter((r) => r.n / total >= 0.03).sort((a, b) => b.n - a.n).slice(0, 4);

  return (
    <>
      <h3>한눈에 보기</h3>
      <div className="verdict ok">
        <b>{kind}</b>입니다. {m1[0]} {pct(m1[1] / total)}{m2 && `, ${m2[0]} ${pct(m2[1] / total)}`} 순으로 많고, 1만㎡(100m×100m)에 가게가 {(total / ha).toFixed(1)}곳꼴로 있습니다.
      </div>

      <h3>여기 해 볼 만한 업종</h3>
      {picks.length === 0 && <p className="note">흔한 업종은 이미 다 들어와 있어요. 빈자리가 딱히 안 보입니다.</p>}
      {picks.map((r, i) => (
        <div key={r.name} className={`concept ${i === 0 ? "best" : ""}`}>
          <div className="concept-head"><b>{r.name}</b><span className="tag">{r.n === 0 ? "빈자리" : `${r.n}곳뿐`}</span></div>
          <p className="pitch">
            {r.n === 0 ? "반경 안에 한 곳도 없습니다." : `반경 안에 ${r.n}곳뿐이고, 가장 가까운 곳이 ${r.near}m 떨어져 있습니다.`}
            {why[r.name] && ` ${why[r.name]}`}
          </p>
        </div>
      ))}

      {crowded.length > 0 && <>
        <h3>이미 많은 업종 (새로 내면 경쟁이 셉니다)</h3>
        <ol className="top">
          {crowded.map((r) => <li key={r.name}><span>{r.name} · 가장 가까운 곳 {r.near}m</span><b>{r.n}</b></li>)}
        </ol>
      </>}

      <p className="note">
        가게 수만 보고 규칙으로 뽑은 1차 힌트입니다. 유동인구, 임대료, 매출, 가게 크기는 안 봤고, 없는 업종은 수요가 없어서 없는 것일 수도 있습니다.
      </p>
    </>
  );
}
