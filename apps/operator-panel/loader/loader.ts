/** Lazy-load entry for operator panel embed — mirrors widget.js architecture */
(function operatorPanelLoader() {
  const script = document.currentScript as HTMLScriptElement | null;
  const operatorKey =
    script?.dataset['operatorKey'] ?? script?.getAttribute('data-operator-key') ?? '';
  const mountId = script?.dataset['mountId'] ?? script?.getAttribute('data-mount-id') ?? 'botme-operator-panel';
  const fullscreen = script?.dataset['fullscreen'] === 'true' || script?.getAttribute('data-fullscreen') === 'true';

  const scriptOrigin = script?.src ? new URL(script.src).origin : window.location.origin;
  const apiOrigin = script?.dataset['apiOrigin'] ?? script?.getAttribute('data-api-origin') ?? scriptOrigin;
  const panelOrigin = script?.dataset['panelOrigin'] ?? script?.getAttribute('data-panel-origin') ?? scriptOrigin;

  if (document.getElementById(`${mountId}-iframe`)) return;

  function hostStyles(): string {
    if (fullscreen) {
      return 'position:fixed;inset:0;z-index:2147483640;width:100%;height:100dvh;border:none;background:#0f0f12';
    }
    return 'width:100%;height:100%;min-height:480px;border:none;background:#0f0f12';
  }

  function mountIframe(panelUrl: string): void {
    let host = document.getElementById(mountId);
    if (!host) {
      host = document.createElement('div');
      host.id = mountId;
      host.style.cssText = fullscreen
        ? 'position:fixed;inset:0;z-index:2147483640;width:100%;height:100dvh'
        : 'width:100%;height:100%;min-height:480px';
      (script?.parentElement ?? document.body).appendChild(host);
    }

    const iframe = document.createElement('iframe');
    iframe.id = `${mountId}-iframe`;
    iframe.src = panelUrl;
    iframe.title = 'Botme Operator Panel';
    iframe.style.cssText = hostStyles();
    iframe.setAttribute('allow', 'microphone; camera; fullscreen; display-capture');
    iframe.setAttribute('allowfullscreen', 'true');

    host.innerHTML = '';
    host.appendChild(iframe);
  }

  function buildPanelUrl(origin: string, key?: string): string {
    const base = `${origin.replace(/\/$/, '')}/operator-panel/`;
    if (!key) return base;
    return `${base}?operatorKey=${encodeURIComponent(key)}`;
  }

  if (!operatorKey) {
    mountIframe(buildPanelUrl(panelOrigin));
    return;
  }

  fetch(`${apiOrigin.replace(/\/$/, '')}/api/public/operator/${encodeURIComponent(operatorKey)}/init`, {
    credentials: 'omit',
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { panelOrigin?: string; operatorKey?: string } | null) => {
      const origin = data?.panelOrigin ?? panelOrigin;
      const key = data?.operatorKey ?? operatorKey;
      mountIframe(buildPanelUrl(origin, key));
    })
    .catch(() => {
      mountIframe(buildPanelUrl(panelOrigin, operatorKey));
    });
})();
