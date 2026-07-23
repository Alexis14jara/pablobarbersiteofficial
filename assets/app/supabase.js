/**
 * ============================================================
 * PABLO BARBER — Módulo de integración Supabase
 * ============================================================
 *
 * GUÍA DE CONFIGURACIÓN:
 * ─────────────────────────────────────────────────────────────
 * 1. Crear proyecto en https://supabase.com (gratis)
 * 2. Ir a Settings → API
 * 3. Copiar "Project URL" → pegarlo en SUPABASE_URL
 * 4. Copiar "anon public key" → pegarlo en SUPABASE_ANON_KEY
 * 5. Ejecutar el SQL de abajo en Supabase → SQL Editor
 * ─────────────────────────────────────────────────────────────
 *
 * SQL PARA CREAR LAS TABLAS:
 * ─────────────────────────────────────────────────────────────
 *
 * -- Tabla de reservas
 * CREATE TABLE bookings (
 *   id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   fecha       DATE NOT NULL,
 *   hora        TIME NOT NULL,
 *   nombre      TEXT NOT NULL,
 *   telefono    TEXT NOT NULL,
 *   servicio    TEXT NOT NULL,
 *   notas       TEXT DEFAULT '',
 *   estado      TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','completado','cancelado')),
 *   created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 *
 * -- Tabla de configuración de semanas
 * CREATE TABLE week_config (
 *   id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   semana_inicio   DATE NOT NULL UNIQUE,  -- Lunes de la semana
 *   viernes_activo  BOOLEAN DEFAULT TRUE,
 *   sabado_activo   BOOLEAN DEFAULT TRUE,
 *   domingo_activo  BOOLEAN DEFAULT TRUE,
 *   slots_bloqueados JSONB DEFAULT '[]',   -- Array de "YYYY-MM-DD HH:MM"
 *   created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 *
 * -- Política de seguridad (Row Level Security)
 * ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE week_config ENABLE ROW LEVEL SECURITY;
 *
 * -- ── PÚBLICAS (clientes del sitio) ──────────────────────────
 *
 * -- Leer slots ocupados (para mostrar disponibilidad en el sitio)
 * CREATE POLICY "bookings_public_read_slots" ON bookings
 *   FOR SELECT USING (true);
 *
 * -- Crear reservas (formulario público del sitio)
 * CREATE POLICY "bookings_public_insert" ON bookings
 *   FOR INSERT WITH CHECK (true);
 *
 * -- Leer configuración de semana (para mostrar días activos)
 * CREATE POLICY "week_config_public_read" ON week_config
 *   FOR SELECT USING (true);
 *
 * -- ── ADMIN (solo desde el dashboard, requiere login) ────────
 *
 * -- Cambiar estado de reservas (completado / cancelado)
 * CREATE POLICY "bookings_admin_update" ON bookings
 *   FOR UPDATE
 *   USING (auth.uid() IS NOT NULL)
 *   WITH CHECK (auth.uid() IS NOT NULL);
 *
 * -- Guardar configuración de semana nueva
 * CREATE POLICY "week_config_admin_insert" ON week_config
 *   FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
 *
 * -- Actualizar configuración de semana existente
 * CREATE POLICY "week_config_admin_update" ON week_config
 *   FOR UPDATE
 *   USING (auth.uid() IS NOT NULL)
 *   WITH CHECK (auth.uid() IS NOT NULL);
 *
 * NOTA: Si ya creaste las políticas públicas de UPDATE/INSERT para el
 * dashboard, eliminá primero las anteriores antes de crear las de admin:
 *   DROP POLICY IF EXISTS "bookings_public_update"    ON bookings;
 *   DROP POLICY IF EXISTS "week_config_public_insert" ON week_config;
 *   DROP POLICY IF EXISTS "week_config_public_update" ON week_config;
 * ─────────────────────────────────────────────────────────────
 */

// ─── CONFIGURACIÓN ───────────────────────────────────────────
const SUPABASE_URL      = 'https://wggfrgxmuxvgwuhfhkde.supabase.co';   // 👈 Pegar tu Project URL aquí
const SUPABASE_ANON_KEY = 'sb_publishable_d6pH7_PgGKJsG0Dn0FFRcA_t_JsQUfq';   // 👈 Pegar tu anon public key aquí
// ─────────────────────────────────────────────────────────────

const IS_CONFIGURED = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

let supabaseClient = null;

/**
 * Inicializa el cliente de Supabase (lazy loading para evitar error si no está configurado)
 */
async function getClient() {
  if (!IS_CONFIGURED) return null;
  if (supabaseClient) return supabaseClient;

  try {
    // Carga la librería de Supabase desde CDN cuando esté configurado
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.info('[Supabase] Cliente inicializado ✓');
    return supabaseClient;
  } catch (err) {
    console.error('[Supabase] Error al inicializar:', err);
    return null;
  }
}

// ─── API PÚBLICA ─────────────────────────────────────────────

/**
 * Obtiene los slots ocupados para una fecha específica.
 * @param {string} fecha - Formato "YYYY-MM-DD"
 * @returns {Promise<string[]>} - Array de horas ocupadas, ej: ["10:00", "14:00"]
 */
export async function fetchOccupiedSlots(fecha) {
  const client = await getClient();
  if (!client) return [];   // Modo demo: ningún slot ocupado

  const { data, error } = await client
    .from('bookings')
    .select('hora')
    .eq('fecha', fecha)
    .neq('estado', 'cancelado');

  if (error) {
    console.error('[Supabase] fetchOccupiedSlots error:', error);
    return [];
  }

  return data.map(b => b.hora.substring(0, 5)); // "HH:MM:SS" → "HH:MM"
}

/**
 * Obtiene la configuración de días activos para la semana que contiene una fecha.
 * @param {string} fechaLunes - Formato "YYYY-MM-DD" (lunes de la semana)
 * @returns {Promise<{viernes_activo, sabado_activo, domingo_activo, slots_bloqueados}>}
 */
export async function fetchWeekConfig(fechaLunes) {
  const client = await getClient();
  if (!client) {
    // Modo demo: todos los días activos, sin slots bloqueados
    return {
      viernes_activo:  true,
      sabado_activo:   true,
      domingo_activo:  true,
      slots_bloqueados: []
    };
  }

  const { data, error } = await client
    .from('week_config')
    .select('*')
    .eq('semana_inicio', fechaLunes)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] fetchWeekConfig error:', error);
  }

  // Si no hay configuración para esta semana, todos los días están activos
  return data ?? {
    viernes_activo:  true,
    sabado_activo:   true,
    domingo_activo:  true,
    slots_bloqueados: []
  };
}

/**
 * Crea una nueva reserva.
 * @param {Object} booking - { fecha, hora, nombre, telefono, servicio, notas }
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
export async function createBooking(booking) {
  const client = await getClient();

  if (!client) {
    // Modo demo: simular éxito con delay
    await new Promise(r => setTimeout(r, 1000));
    console.info('[Demo] Reserva simulada:', booking);
    return { success: true, id: 'demo-' + Date.now() };
  }

  const { data, error } = await client
    .from('bookings')
    .insert([{
      fecha:    booking.fecha,
      hora:     booking.hora,
      nombre:   booking.nombre,
      telefono: booking.telefono,
      servicio: booking.servicio,
      notas:    booking.notas ?? '',
      estado:   'pendiente'
    }])
    .select('id')
    .single();

  if (error) {
    console.error('[Supabase] createBooking error:', error);
    return { success: false, error: error.message };
  }

  return { success: true, id: data.id };
}

// ─── DASHBOARD API ────────────────────────────────────────────

/**
 * Obtiene todas las reservas de una semana (para el dashboard).
 * @param {string} fechaLunes - "YYYY-MM-DD"
 * @param {string} fechaDomingo - "YYYY-MM-DD"
 */
export async function fetchWeekBookings(fechaLunes, fechaDomingo) {
  const client = await getClient();
  if (!client) return [];

  const { data, error } = await client
    .from('bookings')
    .select('*')
    .gte('fecha', fechaLunes)
    .lte('fecha', fechaDomingo)
    .order('fecha', { ascending: true })
    .order('hora', { ascending: true });

  if (error) {
    console.error('[Supabase] fetchWeekBookings error:', error);
    return [];
  }

  return data;
}

/**
 * Actualiza el estado de una reserva (dashboard).
 */
export async function updateBookingStatus(id, estado) {
  const client = await getClient();
  if (!client) return { success: false, error: 'No configurado' };

  const { error } = await client
    .from('bookings')
    .update({ estado })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Guarda la configuración de una semana (dashboard).
 */
export async function saveWeekConfig(config) {
  const client = await getClient();
  if (!client) return { success: false, error: 'No configurado' };

  const { error } = await client
    .from('week_config')
    .upsert([config], { onConflict: 'semana_inicio' });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── AUTH (Dashboard Admin) ───────────────────────────────────

/**
 * Inicia sesión con email y contraseña.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function signIn(email, password) {
  const client = await getClient();
  if (!client) return { success: false, error: 'Supabase no configurado' };

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('[Supabase] signIn error:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Cierra la sesión activa.
 * @returns {Promise<void>}
 */
export async function signOut() {
  const client = await getClient();
  if (!client) return;
  await client.auth.signOut();
}

/**
 * Verifica si hay una sesión de admin activa.
 * @returns {Promise<boolean>}
 */
export async function getSession() {
  const client = await getClient();
  if (!client) return false;

  const { data } = await client.auth.getSession();
  return data?.session !== null && data?.session !== undefined;
}

export { IS_CONFIGURED };
