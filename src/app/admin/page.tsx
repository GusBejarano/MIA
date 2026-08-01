import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { listAllCities, listAllPrograms } from "@/lib/admin/catalog";
import CatalogExplorer from "./CatalogExplorer";

export default async function AdminDashboardPage() {
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) redirect("/admin/login");
  // Regla 11 de v2.1: el analista nunca ve el picker libre de Ciudad/
  // Benefactor (todo el catalogo) - su pantalla de inicio es "Mis tareas".
  if (currentUser.role === "analista") redirect("/admin/tasks");

  const [cities, programs] = await Promise.all([listAllCities(), listAllPrograms()]);

  return <CatalogExplorer cities={cities} programs={programs} />;
}
