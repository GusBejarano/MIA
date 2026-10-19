# Política de versionamiento — Admin

## 1. Dos versiones independientes

El repo tiene **un solo build/deploy**, pero **dos números de versión que no se mueven juntos**:

| | Dónde vive | Para qué | Hoy |
|---|---|---|---|
| **App pública** | `package.json` (`version`), `NEXT_PUBLIC_APP_VERSION` | Chat de MIA, usuarios finales | `2.5.0` |
| **Admin** | `src/lib/admin/version.ts` (`ADMIN_VERSION`) | Panel `/admin`, equipo interno | `2.3.0` |

Un cambio en una **no** implica un cambio en la otra. El header de `/admin` siempre muestra la versión del Admin (`Admin vX.Y.Z · <hash>`), nunca la de la app pública — antes de la v2.3 mostraba por error `NEXT_PUBLIC_APP_VERSION` (ver `docs/ADMIN.md`).

**No existe un release 2.2.0.** Lo que se había planeado para él se decidió incluir completo dentro de 2.3.0, para no abrir un release intermedio sin lanzar. Si en el futuro vuelve a pasar algo similar, documéntalo igual (una línea en `CHANGELOG.md` explicando por qué se saltó el número), no lo dejes implícito.

## 2. Cuándo sube cada número (`ADMIN_VERSION`, semver)

- **MAJOR (`X.0.0`):** cambia el modelo de datos de forma incompatible (una tabla/columna que el código viejo ya no podría leer), o se quita/reemplaza un módulo completo del panel.
- **MINOR (`X.Y.0`):** se agrega un módulo o pantalla nueva (ej. v2.0 agregó comercio compartido y Sedes; v2.1 agregó auditoría/tareas/usuarios; v2.3 agregó Pagos, NIT/fusión y "+ Nuevo Convenio"), o un cambio de permisos que afecta qué puede hacer un rol.
- **PATCH (`X.Y.Z`):** fix de un bug, texto, o ajuste de UI que no agrega una capacidad nueva ni cambia el modelo de datos.

En la práctica, hasta ahora cada versión del Admin ha sido un paquete grande de ítems (v2.0, v2.1, v2.3) en vez de versiones PATCH frecuentes — está bien seguir así mientras el ritmo de trabajo sea por "rondas" grandes, pero un fix aislado y urgente puede salir como PATCH sin esperar a la siguiente ronda.

## 3. Tags (`admin-vX.Y.Z`)

- Un tag **anotado** (`git tag -a admin-vX.Y.Z <hash> -m "..."`) por cada versión publicada — nunca uno ligero (`git tag admin-vX.Y.Z` sin `-a`), para que quede un mensaje y una fecha propia en el objeto del tag, no solo en el commit.
- El tag se crea **sobre el commit que queda publicado en `main`** al momento del lanzamiento — no sobre un commit intermedio de `dev`.
- **Push de tags siempre con autorización explícita**, por separado del push de la rama — un tag mal empujado es más difícil de corregir silenciosamente (otros clones ya lo habrán descargado).
- Tags existentes: `admin-v2.0.0` (`9c5aef9`), `admin-v2.1.0` (`102eb0d`), `admin-v2.3.0` (se mueve al commit final de esta versión — ver sección 6).

## 4. El hash de build

`NEXT_PUBLIC_BUILD_HASH` (ver `next.config.ts`) es el hash corto del commit que se está construyendo — viene de `COMMIT_REF` en Netlify, o de `git rev-parse --short HEAD` en build local, o `"local"` si no hay repo git disponible. Es independiente de `ADMIN_VERSION`: el header combina ambos (`Admin v2.3.0 · <hash>`) para poder identificar exactamente qué commit está corriendo, incluso entre dos builds de la misma versión (ej. un hotfix de un typo que no amerita subir el número).

`NEXT_PUBLIC_ENV_PREFIX` antepone `dev-` al hash en cualquier contexto que no sea `production` real en Netlify (rama `main`) — así se distingue a simple vista si lo que se está viendo es `dev` o producción.

## 5. La carpeta `version/` y el formato de las notas

Cada versión publicada tiene **un archivo de notas** en `version/` (raíz del repo, no dentro de `docs/`), con este formato **exacto** de nombre — incluyendo los espacios, literalmente:

```
version/AAAA.MM.DD - Admin X.Y.Z - Notas de version.md
```

Ejemplo real: `version/2026.10.18 - Admin 2.3.0 - Notas de version.md`.

- La fecha es la de **publicación en producción** (cuando `main` avanza a ese commit), no la de inicio del trabajo.
- El contenido mínimo de cada archivo: resumen y alcance, qué cambió por ítem (con commit y archivos clave), matriz de permisos si cambió, decisiones de negocio acordadas, limitaciones conocidas, fuera de alcance/backlog, verificación realizada, cómo revertir, y cómo comprobar la versión en producción — ver el archivo de 2.3.0 como plantilla.
- **Diferencia con `docs/`:** `version/` son notas de una versión puntual, congeladas en el tiempo (no se editan después de publicadas, salvo para corregir un error de hecho). `docs/` son documentos **vivos** (`ADMIN.md`, `BD-CAMBIOS.md`, este mismo archivo) que se actualizan cada vez que algo cambia, sin importar en qué versión.

## 6. Checklist de lanzamiento

1. Desarrollar y verificar en `dev` (`tsc`, `eslint`, `build` limpios; idealmente también verificación manual en el sitio `dev` de Netlify).
2. Si hay cambios de base de datos: mostrárselos a quien tenga la autorización antes de ejecutarlos; registrar cada uno en `docs/BD-CAMBIOS.md` apenas se ejecute (ver sección 7).
3. Escribir las notas de versión en `version/AAAA.MM.DD - Admin X.Y.Z - Notas de version.md`, completar `CHANGELOG.md` y actualizar `docs/ADMIN.md`/README si corresponde — commit de documentación **aparte** del código.
4. Push de `dev` a `origin` (sin tocar `main` todavía).
5. **Con autorización explícita:** fast-forward de `main` al mismo commit de `dev`, push de `main`.
6. Confirmar el deploy de producción en Netlify (hash publicado = hash de `main`).
7. Crear el tag `admin-vX.Y.Z` **sobre el commit final ya en `main`** (anotado, con mensaje) — recién en este punto, no antes. Push del tag con autorización explícita y por separado.
8. Verificación manual en producción (clic a clic) — confirmar que quede registrada como hecha, no asumida.

**Importante del orden:** si la documentación de una versión se termina de escribir *después* de que el código ya se promovió a `main` (como pasó en 2.3.0: el código llegó a `main` en `9fdf940`, y las notas de versión/políticas se escribieron en un commit posterior en `dev`), el tag `admin-vX.Y.Z` se crea sobre el **commit final** una vez ese commit de documentación también se promueva — no sobre el commit de código solo. Un tag que no incluye su propia documentación de versión queda incompleto.

## 7. Dónde se registra cada cambio

| Qué cambió | Dónde se documenta |
|---|---|
| Código (Server Actions, UI, lib) | Mensaje de commit (un ítem por commit) + `CHANGELOG.md` + notas de la versión en `version/` |
| Modelo de permisos | `docs/ADMIN.md` sección "Matriz de permisos" (vivo, siempre al día) + notas de la versión que lo cambió |
| Base de datos (con o sin archivo `.sql` versionado) | `docs/BD-CAMBIOS.md` (vivo, de solo agregar) — **siempre**, incluso si ya hay un archivo en `supabase/`; el archivo tiene el SQL exacto, `BD-CAMBIOS.md` tiene el efecto real verificado y cómo revertir |
| Vocabulario / modelo de datos / decisiones de negocio | `docs/ADMIN.md` (vivo) |
| Versión y fecha de publicación | `CHANGELOG.md` + archivo de `version/` de esa versión |

## 8. Esta versión (2.3.0) — por qué el orden fue distinto al checklist

El código de 2.3.0 se promovió a `main` (`9fdf940`) con autorización explícita antes de que existieran `version/` ni este mismo archivo (`docs/VERSIONING.md`) — ese commit de documentación se escribió **después**, en `dev`. Por eso:

1. `main` ya tiene el código completo de 2.3.0 desde `9fdf940`.
2. Este commit de documentación (notas de versión, `BD-CAMBIOS.md`, este archivo, `CHANGELOG.md` completo) queda en `dev`, por encima de `9fdf940`.
3. Cuando se promueva también a `main` (con autorización explícita, por separado), el tag `admin-v2.3.0` — que hoy existe localmente apuntando a `9fdf940` — se vuelve a crear sobre ese commit final, para que el tag incluya su propia documentación.

Este archivo (`docs/VERSIONING.md`) deja la política para que las próximas versiones sí sigan el checklist completo desde el principio.
