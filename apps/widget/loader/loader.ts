(function botmeLoader() {
  const script = document.currentScript as HTMLScriptElement | null;
  const widgetKey = script?.dataset['widgetKey'] ?? script?.getAttribute('data-widget-key');
  if (!widgetKey) {
    console.error('[Botme] data-widget-key обязателен');
    return;
  }

  const scriptOrigin = script?.src ? new URL(script.src).origin : window.location.origin;
  const apiOrigin = script?.dataset['apiOrigin'] ?? scriptOrigin;
  const widgetOrigin = script?.dataset['widgetOrigin'] ?? scriptOrigin;

  const hostId = 'botme-widget-host';
  if (document.getElementById(hostId)) return;

  const defaults = {
    primaryColor: '#39ff14',
    textColor: '#000000',
    launcherIcon: '💬',
    launcherIconUrl: '',
    assetVersion: '',
    borderRadius: 16,
    iframeWidth: 380,
    iframeHeight: 520,
    launcherPosition: 'bottom-right' as const,
    fullscreenMobile: true,
    animations: true,
  };

  function posStyles(position: string) {
    if (position === 'bottom-left') return { launcher: 'left:20px;right:auto;', iframe: 'left:20px;right:auto;' };
    return { launcher: 'right:20px;left:auto;', iframe: 'right:20px;left:auto;' };
  }

  function iframeOrigin(iframeEl: HTMLIFrameElement): string {
    try {
      return new URL(iframeEl.src, window.location.href).origin;
    } catch {
      return window.location.origin;
    }
  }

  function desktopIframeStyle(cfg: typeof defaults, pos: ReturnType<typeof posStyles>): string {
    return [
      'position:fixed;bottom:88px;z-index:2147483645;display:none;border:none;',
      pos.iframe,
      `width:${cfg.iframeWidth}px;height:${cfg.iframeHeight}px;`,
      'max-width:calc(100vw - 24px);max-height:calc(100dvh - 100px);',
      `border-radius:${cfg.borderRadius}px;`,
      'box-shadow:0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06);',
      'background:#0a0a0b;',
      'overflow:hidden;',
    ].join('');
  }

  function applyMobileFullscreen(iframeEl: HTMLIFrameElement) {
    const viewport = window.visualViewport;
    const height = Math.max(320, Math.round(viewport?.height ?? window.innerHeight));
    const offsetTop = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
    iframeEl.style.inset = 'auto';
    iframeEl.style.top = `${offsetTop}px`;
    iframeEl.style.left = '0';
    iframeEl.style.right = 'auto';
    iframeEl.style.width = '100vw';
    iframeEl.style.height = `${height}px`;
    iframeEl.style.maxWidth = '100vw';
    iframeEl.style.maxHeight = `${height}px`;
    iframeEl.style.borderRadius = '0';
    iframeEl.style.bottom = 'auto';
  }

  function shouldUseMobileFullscreen(cfg: typeof defaults) {
    return cfg.fullscreenMobile && window.matchMedia('(max-width: 640px)').matches;
  }

  function render(cfg: typeof defaults) {
    const host = document.createElement('div');
    host.id = hostId;
    const pos = posStyles(cfg.launcherPosition);

    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Открыть чат Botme');
    launcher.className = 'botme-launcher';
    const launcherIcon = document.createElement('span');
    launcherIcon.className = 'botme-launcher-icon';
    if (cfg.launcherIconUrl) {
      const launcherImage = document.createElement('img');
      launcherImage.className = 'botme-launcher-img';
      launcherImage.src = cfg.launcherIconUrl;
      launcherImage.alt = '';
      launcherIcon.append(launcherImage);
    } else {
      launcherIcon.textContent = cfg.launcherIcon;
    }
    const launcherGlow = document.createElement('span');
    launcherGlow.className = 'botme-launcher-glow';
    launcher.append(launcherIcon, launcherGlow);
    launcher.style.cssText = [
      'position:fixed;bottom:calc(20px + env(safe-area-inset-bottom, 0px));z-index:2147483646;',
      pos.launcher,
      'width:60px;height:60px;border:none;padding:0;',
      `border-radius:${Math.min(cfg.borderRadius + 40, 50)}%;`,
      `background:linear-gradient(135deg, ${cfg.primaryColor}, color-mix(in srgb, ${cfg.primaryColor} 60%, #6366f1));`,
      `color:${cfg.textColor};`,
      'font-size:1.35rem;cursor:pointer;',
      'display:grid;place-items:center;',
      cfg.animations ? 'animation:botme-float 3s ease-in-out infinite;' : '',
    ].join('');

    if (cfg.animations && !document.getElementById('botme-launcher-styles')) {
      const style = document.createElement('style');
      style.id = 'botme-launcher-styles';
      style.textContent = `
        @keyframes botme-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes botme-pulse { 0%{box-shadow:0 0 0 0 rgba(99,102,241,0.5)} 70%{box-shadow:0 0 0 14px rgba(99,102,241,0)} 100%{box-shadow:0 0 0 0 rgba(99,102,241,0)} }
        .botme-launcher { box-shadow:0 8px 32px rgba(99,102,241,0.45); transition:transform 0.2s ease, box-shadow 0.2s ease; animation:botme-pulse 2.5s ease-out infinite, botme-float 3s ease-in-out infinite; }
        .botme-launcher:hover { transform:scale(1.08); box-shadow:0 12px 40px rgba(99,102,241,0.55); }
        .botme-launcher-icon { position:relative; z-index:1; display:grid; place-items:center; width:100%; height:100%; }
        .botme-launcher-img { width:70%; height:70%; object-fit:contain; display:block; }
        .botme-launcher-glow { position:absolute; inset:-4px; border-radius:inherit; background:radial-gradient(circle, rgba(255,255,255,0.25), transparent 70%); opacity:0.6; }
      `;
      document.head.appendChild(style);
    }

    const iframe = document.createElement('iframe');
    iframe.title = 'Botme AI';
    const versionParam = cfg.assetVersion ? `&v=${encodeURIComponent(cfg.assetVersion)}` : '';
    iframe.src = `${widgetOrigin}/widget/?widgetKey=${encodeURIComponent(widgetKey)}${versionParam}`;
    iframe.style.cssText = desktopIframeStyle(cfg, pos);
    iframe.setAttribute(
      'allow',
      'camera *; microphone *; autoplay *; fullscreen *; display-capture *; clipboard-write',
    );
    iframe.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads',
    );

    let open = false;

    const syncOpenFrame = () => {
      if (!open) return;
      if (shouldUseMobileFullscreen(cfg)) {
        applyMobileFullscreen(iframe);
        return;
      }
      iframe.style.cssText = desktopIframeStyle(cfg, pos);
      iframe.style.display = 'block';
    };

    const setWidgetOpen = (next: boolean) => {
      open = next;
      iframe.style.display = open ? 'block' : 'none';
      // Hide launcher while open — on mobile it sits above the iframe and blocks input/footer.
      launcher.style.display = open ? 'none' : 'grid';
      launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
      launcher.setAttribute('aria-label', open ? 'Чат открыт' : 'Открыть чат Botme');

      if (!open) {
        iframe.style.cssText = desktopIframeStyle(cfg, pos);
        return;
      }

      if (shouldUseMobileFullscreen(cfg)) {
        applyMobileFullscreen(iframe);
      }
    };

    launcher.addEventListener('click', () => {
      setWidgetOpen(!open);
    });

    window.visualViewport?.addEventListener('resize', syncOpenFrame);
    window.visualViewport?.addEventListener('scroll', syncOpenFrame);
    window.addEventListener('resize', syncOpenFrame);
    window.addEventListener('orientationchange', () => {
      window.setTimeout(syncOpenFrame, 120);
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type !== 'BOTME_CLOSE') return;
      // Iframe may be served from a different origin than the loader script (e.g. demo → agent).
      if (event.origin !== iframeOrigin(iframe)) return;
      setWidgetOpen(false);
    });

    host.append(launcher, iframe);
    document.body.append(host);
  }

  fetch(`${apiOrigin}/api/public/widget/${encodeURIComponent(widgetKey)}/init`, {
    credentials: 'omit',
    cache: 'no-store',
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { theme?: typeof defaults; widgetOrigin?: string; embedPath?: string; assetVersion?: string } | null) => {
      if (data?.theme) {
        const t = data.theme;
        const assetVersion = data.assetVersion ?? t.assetVersion ?? defaults.assetVersion;
        render({
          primaryColor: t.primaryColor ?? defaults.primaryColor,
          textColor: t.darkMode === false ? '#111' : (t.textColor ?? defaults.textColor),
          launcherIcon: t.launcherIcon ?? defaults.launcherIcon,
          launcherIconUrl: t.launcherIconUrl ?? defaults.launcherIconUrl,
          assetVersion,
          borderRadius: t.borderRadius ?? defaults.borderRadius,
          iframeWidth: t.iframeWidth ?? defaults.iframeWidth,
          iframeHeight: t.iframeHeight ?? defaults.iframeHeight,
          launcherPosition: t.launcherPosition ?? defaults.launcherPosition,
          fullscreenMobile: t.fullscreenMobile ?? defaults.fullscreenMobile,
          animations: t.animations ?? defaults.animations,
        });
        if (data.widgetOrigin && data.embedPath) {
          const iframe = document.querySelector(`#${hostId} iframe`) as HTMLIFrameElement | null;
          if (iframe) {
            const versionParam = assetVersion ? `&v=${encodeURIComponent(assetVersion)}` : '';
            iframe.src = `${data.widgetOrigin}${data.embedPath}?widgetKey=${encodeURIComponent(widgetKey)}${versionParam}`;
          }
        }
      } else {
        render(defaults);
      }
    })
    .catch(() => render(defaults));
})();

export {};
