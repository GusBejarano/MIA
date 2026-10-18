import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { listPaymentRowsAction } from "../pagosActions";
import PagosView from "./PagosView";

export default async function PagosPage() {
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) redirect("/admin/login");
  // Pagos es solo de admin (item P1 de v2.3), igual que Usuarios - el
  // analista nunca ve este link en AdminNav, pero igual se re-chequea aqui
  // por si escribe la URL a mano.
  if (currentUser.role !== "admin") redirect("/admin");

  const rows = await listPaymentRowsAction({});
  const analystMap = new Map(rows.map((r) => [r.analystId, r.analystName]));
  const analysts = [...analystMap.entries()]
    .map(([id, fullName]) => ({ id, fullName }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return <PagosView initialRows={rows} analysts={analysts} />;
}
