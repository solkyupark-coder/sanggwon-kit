import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "주변 상권 분석 키트",
  description: "가운데와 반경을 정하면 주변 상가를 업종별로 세어 주는 Next.js 키트",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
      </head>
      <body>
        {/* 지도 라이브러리(MapLibre)는 인터넷에서 바로 불러옵니다 */}
        <Script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
