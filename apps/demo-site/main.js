const navToggle = document.getElementById('navToggle');
const nav = document.querySelector('.nav');
navToggle?.addEventListener('click', () => nav?.classList.toggle('open'));

document.getElementById('leadForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Спасибо! AI-ассистент в чате поможет записаться на приём.');
});

async function loadWidget() {
  let widgetKey = import.meta.env.VITE_DEMO_WIDGET_KEY;
  if (!widgetKey) {
    try {
      const cfg = await fetch('/demo-config.json').then((r) => (r.ok ? r.json() : null));
      widgetKey = cfg?.widgetPublicKey;
    } catch {
      /* demo-config optional until seed */
    }
  }
  if (!widgetKey) {
    console.warn('[Neeklo Dental Demo] widget key not configured — run seed-dental-demo');
    return;
  }

  const script = document.createElement('script');
  script.src = '/widget.js';
  script.async = true;
  script.dataset.widgetKey = widgetKey;
  script.dataset.apiOrigin = window.location.origin;
  script.dataset.widgetOrigin = window.location.origin;
  document.body.appendChild(script);
}

void loadWidget();
