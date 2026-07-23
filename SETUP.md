# 🪒 Pablo Barber — Guía de Configuración Completa

Guía paso a paso para dejar el sitio 100% funcional con Supabase.

---

## ✅ Checklist de Estado

| # | Paso | Estado |
|---|------|--------|
| 1 | Crear proyecto en Supabase | ✅ Hecho |
| 2 | Ejecutar SQL (crear tablas) | ✅ Hecho |
| 3 | Pegar `SUPABASE_URL` en supabase.js | ✅ Hecho |
| 4 | Pegar `SUPABASE_ANON_KEY` en supabase.js | ✅ Hecho |
| 5 | Verificar formato de URL (sin `/rest/v1/`) | ✅ Corregido automáticamente |
| 6 | Verificar RLS policies en Supabase | 👉 Pendiente — ver Sección 2 |
| 7 | Verificar CORS en Supabase | 👉 Pendiente — ver Sección 3 |
| 8 | Probar reserva desde el sitio | 👉 Pendiente |
| 9 | Configurar autenticación del dashboard | 👉 Pendiente — ver Sección 4 |
| 10 | Desplegar el sitio (hosting) | 👉 Opcional — ver Sección 5 |

---

## 🔑 Sección 1 — Credenciales de Supabase

> **Archivo:** `assets/app/supabase.js` (líneas 64–65)

### ¿Qué poner en cada campo?

Ir a tu proyecto en supabase.com → **Settings → API**

```
SUPABASE_URL      → "Project URL"
                    Ejemplo: https://wggfrgxmuxvgwuhfhkde.supabase.co
                    ⚠️  NO agregar /rest/v1/ al final

SUPABASE_ANON_KEY → "anon public" (bajo "Project API keys")
                    Ejemplo: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### ⚠️ Error común: URL con `/rest/v1/`

El SDK de `@supabase/supabase-js` necesita la URL **base** del proyecto. Si incluís `/rest/v1/` al final, el cliente no se inicializa correctamente.

✅ Correcto:   https://wggfrgxmuxvgwuhfhkde.supabase.co
❌ Incorrecto: https://wggfrgxmuxvgwuhfhkde.supabase.co/rest/v1/

---

## 🛡️ Sección 2 — Row Level Security (RLS) — VERIFICAR

Cuando ejecutaste el SQL, debería haberse creado esto. Verificalo en Supabase → **Authentication → Policies**.

### Tabla `bookings`

| Nombre de Policy             | Operación | Condición                     |
|------------------------------|-----------|-------------------------------|
| `bookings_public_insert`     | INSERT    | `true` (cualquiera reserva)   |
| `bookings_public_read_slots` | SELECT    | `true` (ver horarios ocupados)|

### Tabla `week_config`

| Nombre de Policy          | Operación | Condición                        |
|---------------------------|-----------|----------------------------------|
| `week_config_public_read` | SELECT    | `true` (leer config de la semana)|

### Si las policies no existen, ejecutar este SQL en Supabase → SQL Editor:

```sql
-- Habilitar RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_config ENABLE ROW LEVEL SECURITY;

-- Policies para bookings
CREATE POLICY "bookings_public_insert" ON bookings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "bookings_public_read_slots" ON bookings
  FOR SELECT USING (true);

-- Policy para week_config
CREATE POLICY "week_config_public_read" ON week_config
  FOR SELECT USING (true);
```

---

## 🌐 Sección 3 — CORS (Allowed Origins)

Si el sitio está en un dominio propio o en localhost, Supabase necesita saber desde dónde puede recibir peticiones.

### Configurar CORS:

1. Ir a **Settings → API** en tu proyecto de Supabase
2. Buscar la sección **"Allowed origins"**
3. Agregar las URLs desde donde se va a abrir el sitio:

```
http://localhost:5500          ← si usás Live Server en VS Code
http://127.0.0.1:5500          ← alternativa para Live Server
https://tudominio.com          ← cuando esté publicado
https://www.tudominio.com      ← con www también
```

> **Nota:** Si abrís el archivo directamente (`file:///...`) en el navegador, CORS puede fallar.
> Siempre usá un servidor local (Live Server) o subí el sitio a un hosting.

---

## 🔐 Sección 4 — Dashboard y Autenticación

El `dashboard.html` actualmente **no tiene protección de acceso**. Para protegerlo:

### Opción A: Supabase Auth (recomendado)

1. Ir a **Authentication → Users** en Supabase
2. Crear un usuario para Pablo (email + contraseña)
3. Agregar estas policies para operaciones admin:

```sql
-- Solo admins autenticados pueden actualizar reservas
CREATE POLICY "bookings_admin_update" ON bookings
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Solo admins autenticados pueden gestionar week_config
CREATE POLICY "week_config_admin_write" ON week_config
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
```

### Opción B: Contraseña simple local

Proteger el dashboard con un prompt de contraseña básico en JavaScript (sin Supabase Auth). Más simple pero menos seguro.

---

## 🗄️ Sección 5 — Estructura de las Tablas

### `bookings`

| Columna    | Tipo      | Descripción                                              |
|------------|-----------|----------------------------------------------------------|
| `id`       | UUID      | PK generado automáticamente                              |
| `fecha`    | DATE      | Fecha de la cita (YYYY-MM-DD)                            |
| `hora`     | TIME      | Hora de la cita (HH:MM:SS)                               |
| `nombre`   | TEXT      | Nombre del cliente                                       |
| `telefono` | TEXT      | Teléfono del cliente                                     |
| `servicio` | TEXT      | corte / barba / cejas / corte-barba / corte-cejas / combo|
| `notas`    | TEXT      | Notas opcionales                                         |
| `estado`   | TEXT      | pendiente / completado / cancelado                       |
| `created_at`| TIMESTAMP| Fecha de creación (automático)                           |

### `week_config`

| Columna            | Tipo      | Descripción                               |
|--------------------|-----------|-------------------------------------------|
| `id`               | UUID      | PK generado automáticamente               |
| `semana_inicio`    | DATE      | Lunes de la semana (UNIQUE)               |
| `viernes_activo`   | BOOLEAN   | Si el viernes está habilitado             |
| `sabado_activo`    | BOOLEAN   | Si el sábado está habilitado              |
| `domingo_activo`   | BOOLEAN   | Si el domingo está habilitado             |
| `slots_bloqueados` | JSONB     | Array de "YYYY-MM-DD HH:MM" bloqueados    |
| `created_at`       | TIMESTAMP | Fecha de creación (automático)            |

---

## 🧪 Sección 6 — Probar el sitio localmente

### Con VS Code + Live Server (recomendado)

1. Instalar extensión **Live Server** en VS Code
2. Click derecho en `index.html` → **Open with Live Server**
3. Se abre en `http://127.0.0.1:5500`

### Verificar que Supabase funciona:

1. Abrir la consola del navegador (F12 → Console)
2. Ir a la sección de reservas del sitio
3. Deberías ver: `[Supabase] Cliente inicializado ✓`
4. Hacer una reserva de prueba
5. Verificar en **Supabase → Table Editor → bookings** que apareció

---

## 📁 Sección 7 — Estructura del Proyecto

```
PabloBarber/
├── index.html              ← Sitio público con sistema de reservas
├── dashboard.html          ← Panel de administración
├── SETUP.md                ← Esta guía
└── assets/
    ├── app/
    │   ├── app.js          ← Lógica de UI y sistema de reservas
    │   └── supabase.js     ← Integración con Supabase ← CONFIGURAR AQUÍ
    ├── styles/
    │   └── styles.css      ← Estilos globales
    └── images/             ← Imágenes del sitio
```

---

## 🌍 Sección 8 — Opciones de Hosting

Como el sitio es HTML/CSS/JS puro, se puede publicar gratis en cualquiera de estas plataformas:

| Plataforma          | Plan gratuito | Facilidad     | Dominio personalizado |
|---------------------|---------------|---------------|-----------------------|
| **Netlify**         | ✅ Ilimitado  | ⭐⭐⭐⭐⭐  | ✅ Sí                |
| **GitHub Pages**    | ✅ Ilimitado  | ⭐⭐⭐⭐    | ✅ Sí                |
| **Vercel**          | ✅ Ilimitado  | ⭐⭐⭐⭐⭐  | ✅ Sí                |
| **Cloudflare Pages**| ✅ Ilimitado  | ⭐⭐⭐⭐    | ✅ Sí                |

### Publicar en Netlify (más fácil):

1. Ir a https://netlify.com → crear cuenta gratis
2. Arrastrar la carpeta `PabloBarber/` al área de deploy
3. Netlify te da una URL como `pablobarber.netlify.app`
4. Agregar esa URL en **CORS de Supabase** (ver Sección 3)

---

## 🐛 Sección 9 — Solución de Problemas

### "Las reservas no se guardan" / "modo demo"
- Verificar que `SUPABASE_URL` y `SUPABASE_ANON_KEY` estén correctos en `supabase.js`
- Verificar que la URL **no** tenga `/rest/v1/` al final
- Abrir consola del navegador y buscar errores `[Supabase]`

### "Error de CORS"
- El origen del sitio no está en la lista de CORS de Supabase
- Agregar la URL en **Supabase → Settings → API → Allowed origins**

### "Error 401 Unauthorized"
- La `ANON_KEY` está mal o expiró
- Copiar de nuevo desde **Supabase → Settings → API → anon public**

### "Error 403 Forbidden"
- Las RLS policies no están bien configuradas
- Ejecutar el SQL de la Sección 2

### "Error 404" al leer/escribir tablas
- Las tablas no existen o tienen nombres distintos
- Verificar en **Supabase → Table Editor** que existen `bookings` y `week_config`

---

## 📋 Resumen del Flujo

1. **Cliente reserva** → elige día/hora en `index.html` → llena el formulario → confirma
2. **Supabase guarda** → la reserva queda en `bookings` con estado `pendiente`
3. **Pablo ve las citas** → entra a `dashboard.html` → ve todas las citas de la semana
4. **Pablo gestiona** → puede marcar citas como `completado` o `cancelado`
5. **Pablo bloquea turnos** → puede deshabilitar días o bloquear horarios específicos

---

*Última actualización: Julio 2026*
