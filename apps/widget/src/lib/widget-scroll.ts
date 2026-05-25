const NEAR_BOTTOM_PX = 96;

export function isNearBottom(container: HTMLElement | null): boolean {
  if (!container) return true;
  const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
  return distance <= NEAR_BOTTOM_PX;
}

/** Set scroll position directly — never scrollIntoView (avoids iframe parent scroll). */
export function scrollMessagesToBottom(container: HTMLElement | null, force = false): void {
  if (!container) return;
  if (!force && !isNearBottom(container)) return;
  container.scrollTop = container.scrollHeight;
}

export function bindScrollAnchor(container: HTMLElement | null, onNearBottomChange: (near: boolean) => void): () => void {
  if (!container) return () => undefined;
  let near = isNearBottom(container);
  onNearBottomChange(near);
  const onScroll = () => {
    const next = isNearBottom(container);
    if (next !== near) {
      near = next;
      onNearBottomChange(near);
    }
  };
  container.addEventListener('scroll', onScroll, { passive: true });
  return () => container.removeEventListener('scroll', onScroll);
}
