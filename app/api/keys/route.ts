// 서버에 키가 들어 있는지만 알려 줍니다. 키 값은 절대 내보내지 않습니다.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    vworld: !!process.env.VWORLD_KEY,
    datagokr: !!process.env.DATA_GO_KR_KEY,
  });
}
