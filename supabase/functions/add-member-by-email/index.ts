// supabase/functions/add-member-by-email/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Usa l'apikey passata nella request (la anon public key HS256)
    const reqApiKey =
      req.headers.get("apikey") ||
      req.headers.get("x-api-key") ||
      req.headers.get("X-API-KEY") ||
      "";

    const authHeader = req.headers.get("Authorization") || "";

    // client "as user" (per capire chi sta chiamando)
    const supabaseUser = createClient(SUPABASE_URL, reqApiKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    const caller = userData?.user;

    if (userErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const project_id = String(body?.project_id || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "member").trim() || "member";

    if (!project_id || !email) {
      return new Response(JSON.stringify({ error: "Missing project_id or email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // service role client (lookup user + upsert)
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // permessi: admin_users OR owner su project_members
    const { data: adminRow } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", caller.id)
      .maybeSingle();

    let isAllowed = !!adminRow;

    if (!isAllowed) {
      const { data: ownerRow } = await supabaseAdmin
        .from("project_members")
        .select("user_id,role")
        .eq("project_id", project_id)
        .eq("user_id", caller.id)
        .eq("role", "owner")
        .maybeSingle();

      isAllowed = !!ownerRow;
    }

    if (!isAllowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // trova utente per email
    const { data: found, error: findErr } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    if (findErr || !found?.user) {
      return new Response(JSON.stringify({ error: "User not found for this email" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const targetUid = found.user.id;

    // upsert membership
    const { error: upsertErr } = await supabaseAdmin
      .from("project_members")
      .upsert([{ project_id, user_id: targetUid, role }], { onConflict: "project_id,user_id" });

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, user_id: targetUid }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
