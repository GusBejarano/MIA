import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin/currentAdminUser";
import { listAllCities, listAllPrograms } from "@/lib/admin/catalog";
import CatalogExplorer from "./CatalogExplorer";

export default async function AdminDashboardPage() {
  const currentUser = await getCurrentAdminUser();
  if (!currentUser) redirect("/admin/login");

  const [cities, programs] = await Promise.all([listAllCities(), listAllPrograms()]);

  return <CatalogExplorer cities={cities} programs={programs} />;
}
