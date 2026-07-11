// Simula el guardado en Supabase (tablas users, affinities, user_programs,
// events) sin escribir en la base real todavia - tal como quedo acordado para
// esta primera version de prueba. Cuando se conecte Fase 4, cada funcion de
// aqui se reemplaza por su equivalente con el cliente real de Supabase
// (service_role key), sin tener que tocar la logica de onboarding.ts.

export function saveCity(city: string, method: "geolocation" | "manual") {
  console.log(`  [mock users.city] -> "${city}"`);
  console.log(
    `  [mock events] city_detected { city: "${city}", method: "${method}" }`
  );
}

export function saveCityInterest(city: string) {
  console.log(
    `  [mock events] city_interest_declared { city: "${city}" }`
  );
}

export function saveAffinity(category: string) {
  console.log(
    `  [mock affinities] { category: "${category}", source: "declarada" }`
  );
}

export function savePrograms(programs: string[]) {
  console.log(`  [mock user_programs] -> [${programs.join(", ")}]`);
}

export function saveExposure(benefitId: string) {
  console.log(`  [mock benefit_exposures] -> beneficio "${benefitId}"`);
}
