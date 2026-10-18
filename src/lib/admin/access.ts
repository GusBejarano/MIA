// Reglas de autorizacion del panel /admin, sin ninguna dependencia de
// Supabase ni de Next.js - a proposito: toda la seguridad del admin vive
// en codigo de servidor (RLS esta activo pero sin policies, ver
// docs/ADMIN.md), asi que estas reglas son la unica red real y tienen que
// poder probarse solas, con dobles, sin tocar la base.
//
// El cableado contra Supabase vive en guards.ts, que es el que usan los
// Server Actions.

export type AdminRole = "admin" | "analista";

/** Forma minima que necesitan las reglas - guards.ts pasa el CurrentAdminUser completo. */
export type AccessUser = { id: string; role: AdminRole };

/**
 * Las consultas que las reglas necesitan hacer, declaradas como puerto
 * para poder sustituirlas por dobles en las pruebas.
 */
export type AccessPort<U extends AccessUser> = {
  /** null si no hay sesion, si no hay fila en admin_users, o si esta inactiva. */
  getCurrentUser(): Promise<U | null>;
  /** El beneficio esta en admin_task_benefits de alguna tarea asignada a este analista (cualquier estado de tarea). */
  analystHasBenefit(adminUserId: string, benefitId: string): Promise<boolean>;
  /** Alguno de los beneficios de sus tareas usa este comercio. */
  analystHasMerchant(adminUserId: string, merchantId: string): Promise<boolean>;
  /** Tiene al menos una tarea asignada. */
  analystHasAnyTask(adminUserId: string): Promise<boolean>;
  /** admin_users.id al que esta asignada la tarea, o null si la tarea no existe. */
  taskAssignedTo(taskId: string): Promise<string | null>;
  /** Comercio vigente de una sede (siguiendo merged_into), o null si la sede no existe. */
  locationMerchantId(locationId: string): Promise<string | null>;
};

export const ACCESS_ERRORS = {
  notAuthenticated: "No autenticado.",
  notAdmin: "No tienes permiso para esta acción.",
  noTask: "No tienes acceso a esta tarea.",
  noBenefit: "No tienes acceso a este beneficio.",
  noMerchant: "No tienes acceso a este comercio.",
  noLocation: "No tienes acceso a esta sede.",
} as const;

export function createGuards<U extends AccessUser>(port: AccessPort<U>) {
  /** Hay sesion y la fila de admin_users esta activa. No mira el rol. */
  async function requireAdminUser(): Promise<U> {
    const user = await port.getCurrentUser();
    if (!user) throw new Error(ACCESS_ERRORS.notAuthenticated);
    return user;
  }

  /** Solo rol admin: usuarios, tareas (crear/listar todas), Pagos, catalogo completo, convenios y NIT. */
  async function requireAdminRole(): Promise<U> {
    const user = await requireAdminUser();
    if (user.role !== "admin") throw new Error(ACCESS_ERRORS.notAdmin);
    return user;
  }

  /** Un analista solo entra a las tareas que tiene asignadas, aunque escriba la URL a mano. */
  async function requireTaskAccess(taskId: string): Promise<U> {
    const user = await requireAdminUser();
    if (user.role === "admin") return user;
    const assignedTo = await port.taskAssignedTo(taskId);
    if (!assignedTo || assignedTo !== user.id) throw new Error(ACCESS_ERRORS.noTask);
    return user;
  }

  /**
   * Admin, o analista que tenga ese beneficio en alguna de sus tareas.
   * Es el guard de guardar beneficio, marcar auditado y las acciones de
   * sedes que reciben un benefit_id.
   */
  async function requireBenefitAccess(benefitId: string): Promise<U> {
    const user = await requireAdminUser();
    if (user.role === "admin") return user;
    if (!benefitId) throw new Error(ACCESS_ERRORS.noBenefit);
    const ok = await port.analystHasBenefit(user.id, benefitId);
    if (!ok) throw new Error(ACCESS_ERRORS.noBenefit);
    return user;
  }

  /**
   * Para las acciones que solo reciben un merchantId (ej. crear/editar una
   * sede): el analista entra si alguno de los beneficios de sus tareas usa
   * ese comercio.
   */
  async function requireMerchantAccess(merchantId: string): Promise<U> {
    const user = await requireAdminUser();
    if (user.role === "admin") return user;
    if (!merchantId) throw new Error(ACCESS_ERRORS.noMerchant);
    const ok = await port.analystHasMerchant(user.id, merchantId);
    if (!ok) throw new Error(ACCESS_ERRORS.noMerchant);
    return user;
  }

  /** Para las acciones que solo reciben un locationId: se resuelve por su comercio. */
  async function requireLocationAccess(locationId: string): Promise<U> {
    const user = await requireAdminUser();
    if (user.role === "admin") return user;
    const merchantId = await port.locationMerchantId(locationId);
    if (!merchantId) throw new Error(ACCESS_ERRORS.noLocation);
    const ok = await port.analystHasMerchant(user.id, merchantId);
    if (!ok) throw new Error(ACCESS_ERRORS.noLocation);
    return user;
  }

  /**
   * Admin, o analista con al menos una tarea asignada - para acciones sin
   * entidad propia que resolver (buscar comercios, resolver un link de
   * Maps). Evita que una cuenta activa sin trabajo asignado las invoque.
   */
  async function requireAnyTaskAccess(): Promise<U> {
    const user = await requireAdminUser();
    if (user.role === "admin") return user;
    const ok = await port.analystHasAnyTask(user.id);
    if (!ok) throw new Error(ACCESS_ERRORS.notAdmin);
    return user;
  }

  return {
    requireAdminUser,
    requireAdminRole,
    requireTaskAccess,
    requireBenefitAccess,
    requireMerchantAccess,
    requireLocationAccess,
    requireAnyTaskAccess,
  };
}

export type Guards<U extends AccessUser> = ReturnType<typeof createGuards<U>>;
