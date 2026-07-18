import { createFileRoute } from "@tanstack/react-router";

const DEMO_PASSWORD = "Seaphore!Demo2026";

const DEMO_USERS = {
  admin: {
    email: "admin@seaphore.dev",
    display_name: "Ada Okonkwo",
    role: "admin" as const,
    title: "Administrator",
  },
  director: {
    email: "director@seaphore.dev",
    display_name: "Chidi Balogun",
    role: "director" as const,
    title: "Director of Intelligence",
  },
  officer: {
    email: "officer@seaphore.dev",
    display_name: "Ifeoma Adewale",
    role: "officer" as const,
    title: "Intelligence Officer",
  },
  analyst: {
    email: "analyst@seaphore.dev",
    display_name: "Tunde Eze",
    role: "analyst" as const,
    title: "Maritime Analyst",
  },
} as const;

type RoleKey = keyof typeof DEMO_USERS;

export const Route = createFileRoute("/api/public/dev/seed-role")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.NODE_ENV === "production") {
          return new Response("Not available", { status: 404 });
        }
        const body = (await request.json().catch(() => ({}))) as {
          role?: string;
        };
        const roleKey = body.role as RoleKey | undefined;
        if (!roleKey || !(roleKey in DEMO_USERS)) {
          return new Response(JSON.stringify({ error: "invalid role" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        const demo = DEMO_USERS[roleKey];

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Find or create the auth user.
        let userId: string | undefined;
        const { data: list, error: listErr } =
          await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (listErr) throw listErr;
        userId = list.users.find((u) => u.email === demo.email)?.id;

        if (!userId) {
          const { data: created, error: createErr } =
            await supabaseAdmin.auth.admin.createUser({
              email: demo.email,
              password: DEMO_PASSWORD,
              email_confirm: true,
              user_metadata: {
                display_name: demo.display_name,
                title: demo.title,
                seed: "seaphore-demo",
              },
            });
          if (createErr) throw createErr;
          userId = created.user!.id;
        } else {
          // Ensure the password matches the demo password on every call.
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: DEMO_PASSWORD,
            email_confirm: true,
            user_metadata: {
              display_name: demo.display_name,
              title: demo.title,
              seed: "seaphore-demo",
            },
          });
        }

        // Upsert profile.
        await supabaseAdmin.from("profiles").upsert(
          {
            id: userId,
            full_name: demo.display_name,
            email: demo.email,
            rank: demo.title,
          },
          { onConflict: "id" },
        );

        // Ensure role assignment.
        await supabaseAdmin
          .from("user_roles")
          .upsert(
            { user_id: userId, role: demo.role },
            { onConflict: "user_id,role" },
          );

        return new Response(
          JSON.stringify({
            email: demo.email,
            password: DEMO_PASSWORD,
            role: demo.role,
            display_name: demo.display_name,
            title: demo.title,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
