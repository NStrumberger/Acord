/**
 * The selected segment is a thumb that slides, as it does on iOS. CSS cannot
 * do this alone: the thumb has to be measured against whichever label is
 * currently checked, and re-measured when the font loads or the box resizes.
 */
export function mountThumb(seg: HTMLElement): { observer: ResizeObserver; place: (animate: boolean) => void } {
  const thumb = document.createElement('div');
  thumb.className = 'seg-thumb';
  seg.prepend(thumb);

  const place = (animate: boolean) => {
    const label = seg.querySelector<HTMLInputElement>('input:checked')?.closest('label');
    thumb.hidden = !label;   // nothing chosen: no thumb, not a zero-width one
    if (!label) return;
    // Jump without animating on first paint and on resize; only a real
    // selection change should slide.
    if (!animate) thumb.style.transition = 'none';
    const track = seg.getBoundingClientRect();
    const box = label.getBoundingClientRect();
    thumb.style.setProperty('--seg-w', `${box.width}px`);
    thumb.style.setProperty('--seg-x', `${box.left - track.left}px`);
    if (!animate) { void thumb.offsetWidth; thumb.style.transition = ''; }
    thumb.classList.add('ready');
  };

  place(false);
  seg.addEventListener('change', () => place(true));
  const observer = new ResizeObserver(() => place(false));
  observer.observe(seg);
  // Inter loads after first paint and changes label widths.
  void document.fonts?.ready.then(() => place(false));
  return { observer, place };
}
