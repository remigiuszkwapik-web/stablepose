type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | null | undefined | false;

/** Kleiner DOM-Helfer: h('button', { class: 'btn', onclick: fn }, 'Text') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, ...children);
  return el;
}

export function append(el: Element, ...children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.firstChild.remove();
}

/** Segment-Schalter (z. B. Vorne | Hinten). */
export function segmented<T extends string>(
  label: string,
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): HTMLElement {
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((o) => {
    const b = h('button', { type: 'button', role: 'radio', class: 'seg', 'aria-checked': String(o.value === value) }, o.label);
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', 'true');
      onChange(o.value);
    });
    return b;
  });
  append(group, ...buttons);
  return h('div', { class: 'field' }, h('div', { class: 'label' }, label), group);
}

/** Ganzzahl mit Geist Mono, tabellarisch. NaN → „–“. */
export function fmtInt(x: number): string {
  return Number.isFinite(x) ? String(Math.round(x) === 0 ? 0 : Math.round(x)) : '–';
}
