import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_HOSTS = [
  "images.pexels.com",
  "www.pexels.com",
  "images.unsplash.com",
  "picsum.photos",
  "fastly.picsum.photos",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    if (!target) {
      return new Response("missing url", { status: 400, headers: corsHeaders });
    }
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return new Response("invalid url", { status: 400, headers: corsHeaders });
    }
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return new Response("host not allowed", { status: 403, headers: corsHeaders });
    }

    const upstream = await fetch(parsed.toString());
    if (!upstream.ok) {
      return new Response(`upstream ${upstream.status}`, {
        status: upstream.status,
        headers: corsHeaders,
      });
    }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("image-proxy error", e);
    return new Response("proxy error", { status: 500, headers: corsHeaders });
  }
});