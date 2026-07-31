"use server";

import { redirect } from "next/navigation";
import { createAdminAuthServerClient } from "@/lib/admin/supabaseAuthServer";

export async function logoutAction() {
  const supabase = await createAdminAuthServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
