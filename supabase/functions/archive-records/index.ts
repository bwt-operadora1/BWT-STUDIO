import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function signatureFromData(data: Record<string, unknown>) {
  const sid = typeof data.archiveSessionId === "string" ? data.archiveSessionId : "";
  if (sid) return `sid:${sid}`;
  return `${data.destino ?? ""}|${data.hotel ?? ""}|${data.dataInicio ?? ""}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body?.action;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Backend not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    if (action === "upsert") {
      const entry = body?.entry;
      const data = entry?.data;
      if (!data || typeof data !== "object") {
        return new Response(JSON.stringify({ error: "entry.data is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const output = typeof body?.output === "string" ? body.output : undefined;
      const signature = signatureFromData(data);
      const { data: existing } = await supabase
        .from("content_archive")
        .select("outputs")
        .eq("signature", signature)
        .maybeSingle();

      const outputs = Array.from(new Set([...(existing?.outputs ?? entry.outputs ?? []), output].filter(Boolean)));

      // Prices are never stored in the archive. Strip them from the JSONB blob
      // (guards against stale clients) and null the dedicated columns so any
      // previously-stored price is cleared on the next upsert.
      const sanitizedData: Record<string, unknown> = { ...data };
      for (const k of ["precoTotal", "precoPorPessoa", "precoParcela", "precoAVista"]) {
        delete sanitizedData[k];
      }

      const payload = {
        signature,
        destination: String(data.destino ?? ""),
        hotel: String(data.hotel ?? ""),
        agency: data.agencia ? String(data.agencia) : null,
        campaign: data.campanha ? String(data.campanha) : null,
        room_type: data.quartoTipo ? String(data.quartoTipo) : null,
        duration: data.duracao ? String(data.duracao) : null,
        start_date: data.dataInicio ? String(data.dataInicio) : null,
        end_date: data.dataFim ? String(data.dataFim) : null,
        total_price: null,
        installment_price: null,
        cash_price: null,
        outputs,
        included_items: Array.isArray(data.inclui) ? data.inclui : [],
        data: sanitizedData,
      };

      const { error } = await supabase.from("content_archive").upsert(payload, { onConflict: "signature" });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      if (!body?.id) return new Response(JSON.stringify({ error: "id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await supabase.from("content_archive").delete().eq("id", body.id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "clear") {
      const { error } = await supabase.from("content_archive").delete().not("id", "is", null);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("archive-records error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
