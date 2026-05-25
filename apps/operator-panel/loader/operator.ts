/** Production operator embed SDK — https://agent.neeklo.ru/operator.js */
(function botmeOperatorLoader() {
  const script = document.currentScript as HTMLScriptElement | null;
  const workspace =
    script?.dataset['workspace'] ?? script?.getAttribute('data-workspace') ?? '';
  const operatorToken =
    script?.dataset['operatorToken'] ??
    script?.getAttribute('data-operator-token') ??
    '';
  const theme = script?.dataset['theme'] ?? script?.getAttribute('data-theme') ?? 'dark';
  const position =
    script?.dataset['position'] ?? script?.getAttribute('data-position') ?? 'fullscreen';
  const mountId =
    script?.dataset['mountId'] ?? script?.getAttribute('data-mount-id') ?? 'botme-operator-root';
  const legacyKey =
    script?.dataset['operatorKey'] ?? script?.getAttribute('data-operator-key') ?? '';

  const scriptOrigin = script?.src ? new URL(script.src).origin : window.location.origin;
  const apiOrigin = script?.dataset['apiOrigin'] ?? script?.getAttribute('data-api-origin') ?? scriptOrigin;
  const panelOrigin =
    script?.dataset['panelOrigin'] ?? script?.getAttribute('data-panel-origin') ?? scriptOrigin;
  const fullscreen = position === 'fullscreen';

  if (document.getElementById(`${mountId}-iframe`)) return;

  function hostStyles(): string {
    if (fullscreen) {
      return 'position:fixed;inset:0;z-index:2147483640;width:100%;height:100dvh;border:none;background:#0f1419';
    }
    return 'width:100%;height:100%;min-height:480px;border:none;background:#0f1419';
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
    iframe.setAttribute(
      'allow',
      'camera; microphone; fullscreen; autoplay; display-capture; clipboard-read; clipboard-write',
    );
    iframe.setAttribute('allowfullscreen', 'true');

    host.innerHTML = '';
    host.appendChild(iframe);
  }

  function buildRuntimeUrl(origin: string, token: string, ws?: string): string {
    const base = `${origin.replace(/\/$/, '')}/operator-runtime/`;
    const params = new URLSearchParams();
    params.set('token', token);
    if (ws) params.set('workspace', ws);
    if (theme) params.set('theme', theme);
    return `${base}?${params.toString()}`;
  }

  function buildLegacyPanelUrl(origin: string, key?: string): string {
    const base = `${origin.replace(/\/$/, '')}/operator-panel/`;
    if (!key) return base;
    return `${base}?operatorKey=${encodeURIComponent(key)}`;
  }

  if (operatorToken && operatorToken !== 'YOUR_OPERATOR_TOKEN') {
    mountIframe(buildRuntimeUrl(panelOrigin, operatorToken, workspace || undefined));
    return;
  }

  if (legacyKey) {
    fetch(`${apiOrigin.replace(/\/$/, '')}/api/public/operator/${encodeURIComponent(legacyKey)}/init`, {
      credentials: 'omit',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { panelOrigin?: string; operatorKey?: string } | null) => {
        const origin = data?.panelOrigin ?? panelOrigin;
        const key = data?.operatorKey ?? legacyKey;
        mountIframe(buildLegacyPanelUrl(origin, key));
      })
      .catch(() => {
        mountIframe(buildLegacyPanelUrl(panelOrigin, legacyKey));
      });
    return;
  }

  mountIframe(buildRuntimeUrl(panelOrigin, operatorToken || 'YOUR_OPERATOR_TOKEN', workspace || undefined));
})();
