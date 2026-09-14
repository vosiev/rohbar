export const dynamic = "force-dynamic";

export function GET() {
  const apiKey = process.env.YANDEX_TILES_API_KEY?.trim() || "";
  return Response.json(
    {
      enabled: Boolean(apiKey),
      apiKey,
      attribution: "Yandex Maps",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
