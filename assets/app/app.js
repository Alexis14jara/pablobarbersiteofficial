/**
 * ============================================================
 * PABLO BARBER — app.js
 * Lógica principal: navegación, animaciones, sistema de reservas
 * ============================================================
 */

import {
  fetchOccupiedSlots,
  fetchWeekConfig,
  createBooking,
  IS_CONFIGURED
} from './supabase.js';

// ─── UTILS ───────────────────────────────────────────────────

/**
 * Muestra una notificación toast
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const icon  = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span> ${message}`;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => toast.classList.remove('show'), 4000);
}

/**
 * Formatea una fecha Date a "YYYY-MM-DD"
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Obtiene el lunes de la semana de una fecha dada
 */
function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Dom, 1=Lun, ...
  const diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Nombre del día de la semana en español
 */
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

/**
 * Slots de tiempo disponibles
 */
const SLOTS_MORNING   = ['10:00', '11:00'];
const SLOTS_AFTERNOON = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

const SERVICE_LABELS = {
  'corte':       'Corte de Cabello',
  'barba':       'Arreglo de Barba',
  'cejas':       'Depilación de Cejas',
  'corte-barba': 'Corte + Barba',
  'corte-cejas': 'Corte + Cejas',
  'combo':       'Combo Completo',
};

// ─── NAVBAR ──────────────────────────────────────────────────

function initNavbar() {
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');

  // Scroll effect
  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Hamburger toggle
  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('active');
    hamburger.setAttribute('aria-expanded', isOpen);
    mobileMenu.classList.toggle('open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close mobile menu on link click
  document.querySelectorAll('[data-mobile-link]').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      mobileMenu.classList.remove('open');
      document.body.style.overflow = '';
    });
  });
}

// ─── PARALLAX ────────────────────────────────────────────────

function initParallax() {
  const heroBg = document.getElementById('heroBg');
  if (!heroBg) return;

  const onScroll = () => {
    const scrolled = window.scrollY;
    const rate = scrolled * 0.35;
    heroBg.style.transform = `translateY(${rate}px)`;
  };

  window.addEventListener('scroll', onScroll, { passive: true });
}

// ─── SCROLL REVEAL ───────────────────────────────────────────

function initScrollReveal() {
  const revealEls = document.querySelectorAll('.reveal, .stagger');

  if (!('IntersectionObserver' in window)) {
    // Fallback: show all immediately
    revealEls.forEach(el => el.classList.add('revealed'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -60px 0px'
  });

  revealEls.forEach(el => observer.observe(el));
}

// ─── BOOKING SYSTEM ──────────────────────────────────────────

const bookingState = {
  currentWeekOffset: 0,  // 0 = semana actual, 1 = próxima semana, etc.
  selectedDate:  null,   // Date object
  selectedTime:  null,   // "HH:MM"
  weekConfig:    null,
  occupiedSlots: [],
  currentStep:   1,
  formData:      {}
};

function initBooking() {
  renderWeek();
  bindStepNavigation();
}

// ── Week rendering ──────────────────────────────

function getWeekDates(offset = 0) {
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = getMondayOf(today);
  monday.setDate(monday.getDate() + offset * 7);

  // Viernes, Sábado, Domingo de esa semana
  const fri = new Date(monday); fri.setDate(monday.getDate() + 4);
  const sat = new Date(monday); sat.setDate(monday.getDate() + 5);
  const sun = new Date(monday); sun.setDate(monday.getDate() + 6);

  return { monday, fri, sat, sun };
}

async function renderWeek() {
  const { monday, fri, sat, sun } = getWeekDates(bookingState.currentWeekOffset);

  // Week label
  const weekLabel = document.getElementById('weekLabel');
  weekLabel.textContent = `${fri.getDate()} – ${sun.getDate()} ${MONTH_NAMES[sun.getMonth()]} ${sun.getFullYear()}`;

  // Prev button disabled if we're at current week
  document.getElementById('weekPrev').disabled = bookingState.currentWeekOffset <= 0;

  // Fetch config
  bookingState.weekConfig = await fetchWeekConfig(formatDate(monday));

  // Build day buttons
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = [
    { date: fri, key: 'viernes_activo',  label: 'Vie' },
    { date: sat, key: 'sabado_activo',   label: 'Sáb' },
    { date: sun, key: 'domingo_activo',  label: 'Dom' },
  ];

  const container = document.getElementById('daySelector');
  container.innerHTML = '';

  days.forEach(({ date, key, label }) => {
    const isPast    = date < today;
    const isActive  = bookingState.weekConfig[key] && !isPast;
    const isSelected = bookingState.selectedDate && formatDate(date) === formatDate(bookingState.selectedDate);

    const btn = document.createElement('button');
    btn.className = `day-btn${isSelected ? ' selected' : ''}`;
    btn.disabled  = !isActive;
    btn.dataset.date = formatDate(date);
    btn.setAttribute('aria-label', `${DAY_NAMES_FULL[date.getDay()]} ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`);
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    btn.innerHTML = `
      <span class="day-name">${label}</span>
      <span class="day-num">${date.getDate()}</span>
      <span style="font-size:0.65rem; color: var(--color-text-muted)">${MONTH_NAMES[date.getMonth()]}</span>
    `;

    if (isActive) {
      btn.addEventListener('click', () => selectDay(date, btn));
    }

    container.appendChild(btn);
  });

  // If a day was previously selected, re-render its slots
  if (bookingState.selectedDate) {
    const dateStr = formatDate(bookingState.selectedDate);
    const stillValid = days.some(d => formatDate(d.date) === dateStr);
    if (!stillValid) {
      bookingState.selectedDate = null;
      bookingState.selectedTime = null;
      document.getElementById('slotsContainer').innerHTML = `
        <p style="font-size:0.85rem; color:var(--color-text-muted); text-align:center; padding:var(--space-xl) 0;">
          Seleccioná un día para ver los horarios disponibles.
        </p>`;
    }
  }
}

async function selectDay(date, btnEl) {
  // Update UI
  document.querySelectorAll('.day-btn').forEach(b => {
    b.classList.remove('selected');
    b.setAttribute('aria-pressed', 'false');
  });
  btnEl.classList.add('selected');
  btnEl.setAttribute('aria-pressed', 'true');

  bookingState.selectedDate = date;
  bookingState.selectedTime = null;
  document.getElementById('step1Next').disabled = true;

  await renderSlots(date);
}

async function renderSlots(date) {
  const container = document.getElementById('slotsContainer');

  // Show skeleton
  container.innerHTML = `
    <p class="slots-label">Mañana</p>
    <div class="slots-grid">${'<div class="slot-skeleton"></div>'.repeat(2)}</div>
    <p class="slots-label" style="margin-top:1rem">Tarde</p>
    <div class="slots-grid">${'<div class="slot-skeleton"></div>'.repeat(6)}</div>
  `;

  // Fetch occupied
  const dateStr = formatDate(date);
  bookingState.occupiedSlots = await fetchOccupiedSlots(dateStr);

  // Apply blocked slots from week config
  const blocked = (bookingState.weekConfig?.slots_bloqueados ?? [])
    .filter(s => s.startsWith(dateStr))
    .map(s => s.split(' ')[1]);

  const allOccupied = [...bookingState.occupiedSlots, ...blocked];

  // Build slots HTML
  function buildSlotGroup(slots, label) {
    const btns = slots.map(time => {
      const isOccupied = allOccupied.includes(time);
      const isSelected = bookingState.selectedTime === time;
      return `
        <button
          class="slot-btn${isOccupied ? ' occupied' : ''}${isSelected ? ' selected' : ''}"
          data-time="${time}"
          ${isOccupied ? 'disabled aria-label="' + time + ' — ocupado"' : 'aria-label="Seleccionar ' + time + '"'}
        >${time}</button>
      `;
    }).join('');

    return `
      <div class="slots-group">
        <p class="slots-label">${label}</p>
        <div class="slots-grid">${btns}</div>
      </div>
    `;
  }

  container.innerHTML =
    buildSlotGroup(SLOTS_MORNING,   'Mañana') +
    buildSlotGroup(SLOTS_AFTERNOON, 'Tarde');

  // Bind slot click events
  container.querySelectorAll('.slot-btn:not(.occupied)').forEach(btn => {
    btn.addEventListener('click', () => selectSlot(btn.dataset.time, btn));
  });
}

function selectSlot(time, btnEl) {
  document.querySelectorAll('.slot-btn').forEach(b => {
    b.classList.remove('selected');
  });
  btnEl.classList.add('selected');
  bookingState.selectedTime = time;
  document.getElementById('step1Next').disabled = false;
}

// ── Step navigation ─────────────────────────────

function bindStepNavigation() {
  // Week nav
  document.getElementById('weekPrev').addEventListener('click', () => {
    if (bookingState.currentWeekOffset > 0) {
      bookingState.currentWeekOffset--;
      renderWeek();
    }
  });

  document.getElementById('weekNext').addEventListener('click', () => {
    bookingState.currentWeekOffset++;
    renderWeek();
  });

  // Step 1 → 2
  document.getElementById('step1Next').addEventListener('click', () => {
    if (!bookingState.selectedDate || !bookingState.selectedTime) return;
    goToStep(2);
  });

  // Step 2 → back to 1
  document.getElementById('step2Back').addEventListener('click', () => goToStep(1));

  // Step 2 → 3 (validate form)
  document.getElementById('step2Next').addEventListener('click', () => {
    const form    = document.getElementById('bookingForm');
    const name    = document.getElementById('booking-name').value.trim();
    const phone   = document.getElementById('booking-phone').value.trim();
    const service = document.getElementById('booking-service').value;

    if (!name || !phone || !service) {
      showToast('Por favor completá todos los campos obligatorios.', 'error');
      return;
    }
    if (phone.replace(/\D/g, '').length < 6) {
      showToast('Ingresá un número de teléfono válido.', 'error');
      return;
    }

    bookingState.formData = {
      name,
      phone,
      service,
      notes: document.getElementById('booking-notes').value.trim()
    };

    fillSummary();
    goToStep(3);
  });

  // Step 3 → back to 2
  document.getElementById('step3Back').addEventListener('click', () => goToStep(2));

  // Confirm booking
  document.getElementById('confirmBookingBtn').addEventListener('click', submitBooking);

  // New booking
  document.getElementById('newBookingBtn').addEventListener('click', resetBooking);
}

function goToStep(step) {
  // Update step visibility
  document.querySelectorAll('.booking-step').forEach(el => el.classList.remove('active'));
  document.getElementById(`step-${step}`).classList.add('active');

  // Update progress dots
  document.querySelectorAll('.progress-dot').forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i + 1 === step) dot.classList.add('active');
    if (i + 1 < step)  dot.classList.add('done');
  });

  bookingState.currentStep = step;

  // Scroll booking card into view on mobile
  if (window.innerWidth < 768) {
    setTimeout(() => {
      document.getElementById('bookingFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

function fillSummary() {
  const date = bookingState.selectedDate;
  const dayName = DAY_NAMES_FULL[date.getDay()];
  const fullDate = `${dayName} ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;

  document.getElementById('summary-day').textContent     = fullDate;
  document.getElementById('summary-time').textContent    = bookingState.selectedTime + ' hs';
  document.getElementById('summary-service').textContent = SERVICE_LABELS[bookingState.formData.service] ?? bookingState.formData.service;
  document.getElementById('summary-name').textContent    = bookingState.formData.name;
  document.getElementById('summary-phone').textContent   = bookingState.formData.phone;
}

async function submitBooking() {
  const btn     = document.getElementById('confirmBookingBtn');
  const btnText = document.getElementById('confirmBtnText');
  const spinner = document.getElementById('confirmBtnSpinner');

  // Loading state
  btn.disabled       = true;
  btnText.style.display = 'none';
  spinner.style.display = 'inline';

  const booking = {
    fecha:    formatDate(bookingState.selectedDate),
    hora:     bookingState.selectedTime,
    nombre:   bookingState.formData.name,
    telefono: bookingState.formData.phone,
    servicio: bookingState.formData.service,
    notas:    bookingState.formData.notes,
  };

  const result = await createBooking(booking);

  // Restore button
  btn.disabled       = false;
  btnText.style.display = '';
  spinner.style.display = 'none';

  if (result.success) {
    // Show success step
    const date   = bookingState.selectedDate;
    const dayFull = `${DAY_NAMES_FULL[date.getDay()]} ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;
    document.getElementById('success-day').textContent  = dayFull;
    document.getElementById('success-time').textContent = bookingState.selectedTime;

    document.querySelectorAll('.booking-step').forEach(el => el.classList.remove('active'));
    document.getElementById('step-success').classList.add('active');

    // Hide progress dots
    document.getElementById('bookingProgress').style.visibility = 'hidden';

    const mode = IS_CONFIGURED ? '' : ' (modo demo)';
    showToast(`¡Cita reservada correctamente!${mode}`, 'success');
  } else {
    showToast('Error al guardar la reserva. Intentá nuevamente.', 'error');
    console.error('[Booking] Error:', result.error);
  }
}

function resetBooking() {
  bookingState.selectedDate  = null;
  bookingState.selectedTime  = null;
  bookingState.occupiedSlots = [];
  bookingState.currentStep   = 1;
  bookingState.formData      = {};

  // Reset form
  document.getElementById('bookingForm').reset();

  // Reset progress
  document.getElementById('bookingProgress').style.visibility = 'visible';

  // Go to step 1
  document.querySelectorAll('.booking-step').forEach(el => el.classList.remove('active'));
  document.getElementById('step-1').classList.add('active');
  document.getElementById('step1Next').disabled = true;

  // Reset progress dots
  document.querySelectorAll('.progress-dot').forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i === 0) dot.classList.add('active');
  });

  // Re-render week
  renderWeek();
}

// ─── INIT ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initParallax();
  initScrollReveal();
  initBooking();

  // Show Supabase status
  if (!IS_CONFIGURED) {
    console.info(
      '%c[Pablo Barber] Modo Demo%c\n' +
      'Supabase no configurado. Las reservas no se guardarán.\n' +
      'Configura supabase.js para activar el sistema real.',
      'background:#c8a97e;color:#0d0c0b;padding:4px 8px;border-radius:3px;font-weight:bold',
      'color:#7a6e61'
    );
  }
});
