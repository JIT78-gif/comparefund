import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function validateCnpj(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return null;
  return digits;
}

async function requireAdmin(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data, error } = await supabaseUser.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (error || !data?.claims) throw new Error("Unauthorized");

  const userId = data.claims.sub as string;

  // Check admin role
  const { data: roleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) throw new Error("Forbidden: admin role required");
  return userId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // LIST — public, no auth needed
    if (action === "list") {
      const { data, error } = await supabaseAdmin
        .from("competitors")
        .select("*, competitor_cnpjs(*)")
        .order("name");
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other actions require admin role via JWT
    await requireAdmin(req);

    if (action === "add_competitor") {
      const { name } = body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return new Response(JSON.stringify({ error: "Name is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const { data, error } = await supabaseAdmin
        .from("competitors")
        .insert({ name: name.trim(), slug })
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_competitor") {
      const { id, name, status } = body;
      if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const updates: Record<string, string> = {};
      if (name) updates.name = name.trim();
      if (status) updates.status = status;
      const { data, error } = await supabaseAdmin
        .from("competitors")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_competitor") {
      const { id } = body;
      if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await supabaseAdmin.from("competitors").delete().eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "add_cnpj") {
      const { competitor_id, cnpj, fund_name, fund_type_override } = body;
      if (!competitor_id || !cnpj) {
        return new Response(JSON.stringify({ error: "competitor_id and cnpj required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const clean = validateCnpj(cnpj);
      if (!clean) {
        return new Response(JSON.stringify({ error: "Invalid CNPJ format (must be 14 digits)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data, error } = await supabaseAdmin
        .from("competitor_cnpjs")
        .insert({ competitor_id, cnpj: clean, fund_name: fund_name || null, fund_type_override: fund_type_override || null })
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_cnpj") {
      const { id, fund_name, fund_type_override, status } = body;
      if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const updates: Record<string, unknown> = {};
      if (fund_name !== undefined) updates.fund_name = fund_name || null;
      if (fund_type_override !== undefined) updates.fund_type_override = fund_type_override || null;
      if (status) updates.status = status;
      const { data, error } = await supabaseAdmin
        .from("competitor_cnpjs")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_cnpj") {
      const { id } = body;
      if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await supabaseAdmin.from("competitor_cnpjs").delete().eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "bulk_import_cnpjs") {
      const { competitor_id, csv_text } = body;
      if (!competitor_id || !csv_text) {
        return new Response(JSON.stringify({ error: "competitor_id and csv_text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const lines = csv_text.split("\n").map((l: string) => l.trim()).filter((l: string) => l);
      const results = { inserted: 0, errors: [] as string[] };
      for (const line of lines) {
        const [rawCnpj, fundName] = line.split(",").map((s: string) => s.trim());
        const clean = validateCnpj(rawCnpj);
        if (!clean) { results.errors.push(`Invalid CNPJ: ${rawCnpj}`); continue; }
        const { error } = await supabaseAdmin
          .from("competitor_cnpjs")
          .insert({ competitor_id, cnpj: clean, fund_name: fundName || null });
        if (error) { results.errors.push(`${rawCnpj}: ${error.message}`); }
        else { results.inserted++; }
      }
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Authorized Emails Management ---
    if (action === "list_authorized_emails") {
      const { data, error } = await supabaseAdmin
        .from("authorized_emails")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "add_authorized_email") {
      const { email } = body;
      if (!email || typeof email !== "string") {
        return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data, error } = await supabaseAdmin
        .from("authorized_emails")
        .insert({ email: email.trim().toLowerCase() })
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_authorized_email") {
      const { id, status } = body;
      if (!id || !status) return new Response(JSON.stringify({ error: "id and status required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data, error } = await supabaseAdmin
        .from("authorized_emails")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_authorized_email") {
      const { id } = body;
      if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await supabaseAdmin.from("authorized_emails").delete().eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" || message.startsWith("Forbidden") ? 401 : 500;
    console.error("competitor-admin error:", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
