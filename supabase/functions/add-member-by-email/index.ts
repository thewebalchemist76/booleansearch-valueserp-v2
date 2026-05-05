/**
 * Aggiunge un utente al progetto per email.
 *
 * - Se l'utente non esiste in Auth: inviteUserByEmail (email da Supabase Auth → template "Invite").
 * - Se esiste già: solo aggiorna project_members; email custom via Resend se RESEND_API_KEY è impostato.
 *
 * Secrets consigliati sulla funzione:
 * - SITE_URL: URL frontend (es. https://tu-app.onrender.com) per redirect dopo invito
 * - RESEND_API_KEY + RESEND_FROM_EMAIL (opzionale): notifica utenti già registrati
 *
 * Supabase Dashboard → Authentication: disabilitare "Sign ups" pubblici per coerenza con il frontend.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  emailNorm: string,
): Promise<string | null> {
  let page = 1;
  const perPage = 1000;
  for (; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const row = data.users.find((u) => (u.email || "").toLowerCase() === emailNorm);
    if (row?.id) return row.id;
    if (!data.users.length || data.users.length < perPage) break;
  }
  return null;
}

async function callerCanManageProject(
  admin: ReturnType<typeof createClient>,
  callerId: string,
  project_id: string,
): Promise<boolean> {
  const { data: adm } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", callerId)
    .maybeSingle();
  if (adm?.user_id) return true;

  const { data: own } = await admin
    .from("project_members")
    .select("user_id")
    .eq("project_id", project_id)
    .eq("user_id", callerId)
    .eq("role", "owner")
    .maybeSingle();
  return !!own?.user_id;
}

async function notifyExistingUser(params: {
  to: string;
  roleLabel: string;
  projectName: string | null;
}): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
  const proj = params.projectName ? ` nel progetto «${params.projectName}»` : "";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: "Accesso al tool di ricerca",
      html:
        `<p>Ti è stato concesso l'accesso${proj} come <strong>${params.roleLabel}</strong>.</p>` +
        `<p>Puoi effettuare il login con la tua email e la password già impostata.</p>` +
        `<p>Se non ricordi la password, usa il recupero dalla pagina di login.</p>`,
    }),
  });
  return res.ok;
}

serve(async (req) => {
  try {
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
    const ANON_KEY =
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!ANON_KEY || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured: missing Auth keys for Edge Function" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const authHeader = req.headers.get("Authorization") || "";

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
    const emailRaw = String(body?.email || "").trim().toLowerCase();
    let role = String(body?.role || "member").trim() || "member";

    if (!project_id || !emailRaw) {
      return new Response(JSON.stringify({ error: "Missing project_id or email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (role !== "member" && role !== "owner") {
      return new Response(JSON.stringify({ error: "Invalid role (use member or owner)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const allowed = await callerCanManageProject(supabaseAdmin, caller.id, project_id);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
    if (!siteUrl) {
      return new Response(
        JSON.stringify({
          error:
            "SITE_URL non configurato sulla Edge Function (URL frontend per redirect inviti)",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // setup=1 forza schermata "Imposta password" dopo Accept invite
    const redirectTo = `${siteUrl}/login?setup=1`;
    const roleLabel = role === "owner" ? "amministratore di progetto (dashboard)" : "membro (solo ricerca)";

    let targetUid = await findUserIdByEmail(supabaseAdmin, emailRaw);
    let invitedNewUser = false;

    if (!targetUid) {
      const { data: invData, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        emailRaw,
        {
          redirectTo,
          data: {
            access_role: role,
            access_role_label: roleLabel,
          },
        },
      );

      if (invErr) {
        const msg = (invErr.message || "").toLowerCase();
        const retry =
          msg.includes("already") ||
          msg.includes("registered") ||
          msg.includes("exists") ||
          (invErr as { status?: number }).status === 422;
        if (retry) {
          targetUid = await findUserIdByEmail(supabaseAdmin, emailRaw);
        }
        if (!targetUid) {
          return new Response(JSON.stringify({ error: invErr.message || String(invErr) }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (invData?.user?.id) {
        targetUid = invData.user.id;
        invitedNewUser = true;
      } else {
        // Risposta invite senza user.id: attendi replica Auth e risolvi per email
        invitedNewUser = true;
        await new Promise((r) => setTimeout(r, 500));
        targetUid = await findUserIdByEmail(supabaseAdmin, emailRaw);
      }
    }

    if (!targetUid) {
      return new Response(JSON.stringify({ error: "Impossibile risolvere utente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: profErr } = await supabaseAdmin.from("profiles").upsert(
      { id: targetUid, email: emailRaw },
      { onConflict: "id" },
    );
    if (profErr) {
      console.warn("profiles upsert:", profErr.message);
    }

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

    let notifySkipped = false;
    let emailSent = invitedNewUser;

    if (!invitedNewUser) {
      const { data: proj } = await supabaseAdmin
        .from("projects")
        .select("name")
        .eq("id", project_id)
        .maybeSingle();

      const sent = await notifyExistingUser({
        to: emailRaw,
        roleLabel,
        projectName: proj?.name ?? null,
      });
      emailSent = sent;
      notifySkipped = !sent && !Deno.env.get("RESEND_API_KEY");
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: targetUid,
        invited: invitedNewUser,
        email_sent: emailSent,
        notify_skipped: notifySkipped,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
