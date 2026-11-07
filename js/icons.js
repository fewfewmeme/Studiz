// One consistent stroke icon set (24x24 grid, 1.6 px stroke, round caps) as an inline SVG sprite.
const P = {
  'chevron-left': '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  'chevron-right': '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  'chevron-down': '<path d="M5.5 9.5 12 16l6.5-6.5"/>',
  'chevron-up': '<path d="M5.5 14.5 12 8l6.5 6.5"/>',
  'list': '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="4.6" cy="6.5" r=".6"/><circle cx="4.6" cy="12" r=".6"/><circle cx="4.6" cy="17.5" r=".6"/>',
  'bookmark': '<path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1Z"/>',
  'marker': '<path d="m14.2 4.6 5.2 5.2-8.1 8.1H6.8v-4.5z"/><path d="m12.4 6.4 5.2 5.2M4.5 20.5h6"/>',
  'underline': '<path d="M7 4.5v7a5 5 0 0 0 10 0v-7M5 20h14"/>',
  'strike': '<path d="M5 12h14M16.5 7.2C15.6 5.9 14 5 12 5c-2.5 0-4.2 1.3-4.2 3.1 0 1.6 1.2 2.4 3.2 2.9M7.5 16.8C8.4 18.1 10 19 12.2 19c2.5 0 4.3-1.3 4.3-3.2 0-.7-.3-1.3-.8-1.8"/>',
  'pen': '<path d="m4.5 19.5.9-4 9.6-9.6a2 2 0 0 1 2.8 0l.3.3a2 2 0 0 1 0 2.8L8.5 18.6z"/><path d="m13.5 7.5 3 3"/>',
  'eraser': '<path d="m8.3 18.5-4-4a1.5 1.5 0 0 1 0-2.1l8.1-8.1a1.5 1.5 0 0 1 2.1 0l4.5 4.5a1.5 1.5 0 0 1 0 2.1L11.6 19.5H20M9 19.5l-.7-1"/><path d="m9.5 8 6.5 6.5"/>',
  'text': '<path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5"/>',
  'photo': '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 4.6-4.4 3.4 3.2 2.6-2.4 5.4 4.6"/>',
  'undo': '<path d="M8.5 6 4.5 10l4 4"/><path d="M5 10h8.5a5 5 0 0 1 0 10H9"/>',
  'redo': '<path d="m15.5 6 4 4-4 4"/><path d="M19 10h-8.5a5 5 0 0 0 0 10H15"/>',
  'more': '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  'note': '<path d="M5 4.5h14v11l-4.5 4.5H5z"/><path d="M14.5 20v-4.5H19M8.5 9h7M8.5 12.5h4"/>',
  'copy': '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  'trash': '<path d="M5 7h14M10 4.5h4M7 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7M10 11v5M14 11v5"/>',
  'check': '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'x': '<path d="m6 6 12 12M18 6 6 18"/>',
  'play': '<path d="M8 5.5v13l10.5-6.5z"/>',
  'pause': '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  'plus': '<path d="M12 5v14M5 12h14"/>',
  'minus': '<path d="M5 12h14"/>',
  'clock': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  'home': '<path d="M4.5 11 12 4.5l7.5 6.5V19a1 1 0 0 1-1 1h-4v-5.5h-5V20h-4a1 1 0 0 1-1-1z"/>',
  'book': '<path d="M12 6.5C10 5 7 4.6 4.5 5v13c2.5-.4 5.5 0 7.5 1.5 2-1.5 5-1.9 7.5-1.5V5c-2.5-.4-5.5 0-7.5 1.5zM12 6.5v13"/>',
  'blocks': '<rect x="4" y="4.5" width="7" height="7" rx="2"/><rect x="13" y="4.5" width="7" height="7" rx="2"/><rect x="4" y="13.5" width="7" height="6" rx="2"/><rect x="13" y="13.5" width="7" height="6" rx="2"/>',
  'scroll': '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  'settings': '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"/>',
  'receipt': '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  'search': '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  'flame': '<path d="M12 20.5c3.6 0 6-2.4 6-5.6 0-2.4-1.4-4-2.6-5.4-.4 1.2-1 2-2 2.4.5-2.6-.4-5.6-3.4-7.4.3 3.4-1.6 4.6-3 6.4C5.8 12.4 5.8 13.6 6 14.9c.4 3.3 2.4 5.6 6 5.6Z"/>',
  'upload': '<path d="M12 15.5V5M7.5 9.5 12 5l4.5 4.5M5 15v3a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-3"/>',
  'folder': '<path d="M3.8 7.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2h7.4a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5.3a1.5 1.5 0 0 1-1.5-1.5z"/>',
  'file': '<path d="M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M13.5 3.5V8H18"/>',
  'recall': '<path d="M3.5 12s3.3-6 8.5-6 8.5 6 8.5 6-3.3 6-8.5 6-8.5-6-8.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
  'sparkle': '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2 2M15 15l2 2M17 7l-2 2M9 15l-2 2"/>',
  'moon': '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18"/>',
  'tooth': '<path d="M8 4.5c-2.2 0-3.6 1.7-3.6 4 0 2 .8 3.4 1.2 5.2.4 1.9.6 5.8 2 5.8 1.2 0 1.2-3.2 2.2-3.2h2.4c1 0 1 3.2 2.2 3.2 1.4 0 1.6-3.9 2-5.8.4-1.8 1.2-3.2 1.2-5.2 0-2.3-1.4-4-3.6-4-1.4 0-1.8.8-4 .8s-2.6-.8-4-.8z"/>',
  'shell': '<path d="M12 20c-4.4 0-7.5-3-7.5-7.5C4.5 8 8 4.5 12 4.5s7.5 3.5 7.5 8c0 4.5-3.1 7.5-7.5 7.5zM12 20 12 4.5M12 20 8 6M12 20l4-14M12 20 5 9.5M12 20l7-10.5"/>',
  'info': '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
  'fullscreen': '<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>',
  'jump': '<path d="M5 12h10M11 7l5 5-5 5M19 5v14"/>',
  'app-window': '<rect x="3.5" y="5" width="17" height="14" rx="2.4"/><path d="M3.5 9.5h17M7 7.3h.01M10 7.3h.01"/>',
  'menu': '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  'lines': '<path d="M5 6.5h14M5 10.5h14M5 14.5h9M5 18.5h12"/>',
  'book-open': '<path d="M12 7c-1.9-1.5-4.6-2-7.5-1.6v12c2.9-.4 5.6.1 7.5 1.6 1.9-1.5 4.6-2 7.5-1.6v-12C16.6 5 13.9 5.5 12 7zM12 7v12"/>',
  'fit': '<path d="M4 12h16M7 8.5 3.5 12 7 15.5M17 8.5l3.5 3.5-3.5 3.5"/>',
  'focus': '<path d="M4.5 9V5.5a1 1 0 0 1 1-1H9M15 4.5h3.5a1 1 0 0 1 1 1V9M19.5 15v3.5a1 1 0 0 1-1 1H15M9 19.5H5.5a1 1 0 0 1-1-1V15"/><circle cx="12" cy="12" r="2.2"/>',
  'crop': '<path d="M7 3.5V17a1 1 0 0 0 1 1h12.5M3.5 7H17a1 1 0 0 1 1 1v12.5"/>',
  'zoom-in': '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5M10.5 8v5M8 10.5h5"/>',
  'zoom-out': '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5M8 10.5h5"/>',
  'timer': '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.8l2.4 1.4M9.5 3.5h5"/>',
  'list-check': '<path d="m4 6.5 1.6 1.6L8.5 5M4 12.5l1.6 1.6 2.9-3.1M4 18.5l1.6 1.6 2.9-3.1M12 6.5h8M12 12.5h8M12 18.5h8"/>',
  'help': '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.6M12 16.6v.1"/>',
  'share': '<path d="M12 4.5v11M8 8.5l4-4 4 4M6 13v5a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 18v-5"/>',
  'download': '<path d="M12 4.5v11M8 11.5l4 4 4-4M5 19.5h14"/>',
  'star': '<path d="m12 4.5 2.3 4.8 5.2.7-3.8 3.7.9 5.2L12 16.4 7.4 18.9l.9-5.2L4.5 10l5.2-.7z"/>',
};
export function icon(name, size = 22) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'ic');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.6'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = P[name] || P.info;
  return s;
}
export const hasIcon = n => n in P;
