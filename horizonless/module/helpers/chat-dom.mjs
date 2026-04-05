export function markChatMessageWrapper(html, markerClass) {
  if (!markerClass) return;

  const addMarker = (element) => {
    if (!element?.classList?.add) return;
    element.classList.add(markerClass);
  };

  if (typeof html?.addClass === 'function' && typeof html?.find === 'function') {
    html.filter?.('.chat-message').addClass(markerClass);
    html.closest?.('.chat-message').addClass(markerClass);
    html.find?.('.chat-message').addClass(markerClass);
    return;
  }

  if (typeof html?.matches === 'function' && html.matches('.chat-message')) {
    addMarker(html);
  }
  if (typeof html?.closest === 'function') {
    addMarker(html.closest('.chat-message'));
  }
  if (typeof html?.querySelectorAll === 'function') {
    html.querySelectorAll('.chat-message').forEach(addMarker);
  }
}
