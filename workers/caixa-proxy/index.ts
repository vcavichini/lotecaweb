const CAIXA_API = "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const game = segments[0] ?? "megasena";

    if (game !== "megasena") {
      return new Response(JSON.stringify({ error: "unsupported game" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const contest = segments[1] ?? "";
    const upstream = `${CAIXA_API}${contest}`;

    const resp = await fetch(upstream, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; caixa-proxy/1.0)",
      },
    });

    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("Content-Type") ?? "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  },
};
