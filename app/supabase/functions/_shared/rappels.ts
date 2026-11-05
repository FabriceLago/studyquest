// Règles d'envoi des rappels, sans dépendance (testées avec `node --test`).

/**
 * Services de notification des navigateurs (Chrome, Firefox, Edge, Safari). L'adresse vient du
 * navigateur : sans cette liste, on pourrait faire écrire le serveur n'importe où.
 */
const SERVICES = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
];

/** `local` : un hôte de test, joignable en http, réglé seulement sur le poste de développement. */
export function hoteAutorise(endpoint: string, local = ''): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (local && url.host === local) return true;
  return (
    url.protocol === 'https:' &&
    SERVICES.some((service) => url.hostname === service || url.hostname.endsWith(`.${service}`))
  );
}

/** Format attendu par le service worker d'Angular. Pas de reproche : une simple invitation. */
export const NOTIFICATION = {
  notification: {
    title: 'StudyQuest',
    body: 'Ta mission du jour t’attend. Quelques minutes suffisent.',
    icon: 'icons/icon-192.png',
    data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: '/' } } },
  },
};
