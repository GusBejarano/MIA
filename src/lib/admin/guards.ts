import { supabase } from "@/lib/mia/supabaseClient";
import { getCurrentAdminUser, type CurrentAdminUser } from "./currentAdminUser";
import { createGuards, type AccessPort } from "./access";

// Cableado real de las reglas de access.ts contra Supabase (service_role).
// Un unico lugar con los guards de todo el panel, para que la matriz de
// permisos se pueda auditar de un vistazo (ver docs/ADMIN.md).

const port: AccessPort<CurrentAdminUser> = {
  getCurrentUser: getCurrentAdminUser,

  async analystHasBenefit(adminUserId, benefitId) {
    const { data, error } = await supabase
      .from("admin_task_benefits")
      .select("benefit_id, admin_tasks!inner(assigned_to)")
      .eq("benefit_id", benefitId)
      .eq("admin_tasks.assigned_to", adminUserId)
      .limit(1);
    if (error) throw new Error(`No se pudo verificar el acceso al beneficio: ${error.message}`);
    return (data ?? []).length > 0;
  },

  async analystHasMerchant(adminUserId, merchantId) {
    const { data, error } = await supabase
      .from("admin_task_benefits")
      .select("benefit_id, admin_tasks!inner(assigned_to), benefits!inner(merchant_id)")
      .eq("admin_tasks.assigned_to", adminUserId)
      .eq("benefits.merchant_id", merchantId)
      .limit(1);
    if (error) throw new Error(`No se pudo verificar el acceso al comercio: ${error.message}`);
    return (data ?? []).length > 0;
  },

  async analystHasAnyTask(adminUserId) {
    const { data, error } = await supabase
      .from("admin_tasks")
      .select("id")
      .eq("assigned_to", adminUserId)
      .limit(1);
    if (error) throw new Error(`No se pudieron verificar las tareas: ${error.message}`);
    return (data ?? []).length > 0;
  },

  async taskAssignedTo(taskId) {
    const { data, error } = await supabase
      .from("admin_tasks")
      .select("assigned_to")
      .eq("id", taskId)
      .maybeSingle();
    if (error) throw new Error(`No se pudo verificar la tarea: ${error.message}`);
    return (data?.assigned_to as string) ?? null;
  },

  async locationMerchantId(locationId) {
    const { data, error } = await supabase
      .from("benefit_locations")
      .select("merchant_id")
      .eq("id", locationId)
      .maybeSingle();
    if (error) throw new Error(`No se pudo verificar la sede: ${error.message}`);
    const merchantId = (data?.merchant_id as string) ?? null;
    if (!merchantId) return null;
    return resolveActiveMerchantId(merchantId);
  },
};

/**
 * Sigue merged_into hasta el comercio vigente. Un comercio fusionado nunca
 * se borra (regla de v2.3), solo deja de aparecer - pero un puntero viejo
 * debe resolverse al que lo absorbio. El tope de saltos evita quedarse
 * girando si alguna vez quedara un ciclo en los datos.
 */
export async function resolveActiveMerchantId(merchantId: string): Promise<string> {
  let current = merchantId;
  for (let hop = 0; hop < 10; hop++) {
    const { data, error } = await supabase
      .from("merchants")
      .select("merged_into")
      .eq("id", current)
      .maybeSingle();
    if (error) throw new Error(`No se pudo resolver el comercio: ${error.message}`);
    const next = (data?.merged_into as string) ?? null;
    if (!next) return current;
    current = next;
  }
  return current;
}

export const {
  requireAdminUser,
  requireAdminRole,
  requireTaskAccess,
  requireBenefitAccess,
  requireMerchantAccess,
  requireLocationAccess,
  requireAnyTaskAccess,
} = createGuards<CurrentAdminUser>(port);
