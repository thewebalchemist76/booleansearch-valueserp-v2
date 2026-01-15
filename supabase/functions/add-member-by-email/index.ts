import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";

    // client "as user" per capire chi chiama
    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    const caller = userData?.user;

    if (userErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const project_id = String(body?.project_id || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "member").trim() || "member";

    if (!project_id || !email) {
      return new Response(JSON.stringify({ error: "Missing project_id or email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // service role client
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // permessi: SOLO owner sul progetto
    const { data: ownerRow, error: ownerErr } = await supabaseAdmin
      .from("project_members")
      .select("user_id,role")
      .eq("project_id", project_id)
      .eq("user_id", caller.id)
      .eq("role", "owner")
      .maybeSingle();

    if (ownerErr || !ownerRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // lookup utente via tabella profiles (id = uuid auth user)
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();

    if (profErr || !prof?.id) {
      return new Response(JSON.stringify({ error: "User not found for this email" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUid = prof.id;

    const { error: upsertErr } = await supabaseAdmin
      .from("project_members")
      .upsert([{ project_id, user_id: targetUid, role }], {
        onConflict: "project_id,user_id",
      });

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, user_id: targetUid }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
