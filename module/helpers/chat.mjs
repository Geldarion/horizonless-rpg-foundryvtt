const TextEditor = foundry.applications.ux.TextEditor.implementation;

export function getOrdinalSuffix(value) {
  const normalized = Math.abs(Math.trunc(Number(value) || 0));
  const mod100 = normalized % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';

  switch (normalized % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

export function formatOrdinal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const abs = Math.abs(Math.trunc(n));
  return `${abs}${getOrdinalSuffix(abs)}`;
}

export async function prepareEnrichedChatContent(
  rawContent = '',
  { rollData = null, secrets = false } = {}
) {
  const source = String(rawContent ?? '');
  let html = source;

  const showdownApi = globalThis.showdown;
  if (showdownApi?.Converter) {
    const converter = new showdownApi.Converter({
      simplifiedAutoLink: true,
      strikethrough: true,
      tables: true,
    });
    html = converter.makeHtml(source);
  }

  return TextEditor.enrichHTML(html, {
    async: true,
    documents: true,
    links: true,
    rolls: true,
    rollData,
    secrets,
  });
}
