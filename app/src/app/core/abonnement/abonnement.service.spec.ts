import { estActif } from './abonnement.service';

describe('estActif', () => {
  const maintenant = new Date('2026-11-05T12:00:00Z');
  const abonnement = (status: string, fin: string | null = '2026-12-01T00:00:00Z') => ({
    status,
    currentPeriodEnd: fin,
    cancelAtPeriodEnd: false,
  });

  it('suit les mêmes règles que abonne() côté serveur', () => {
    expect(estActif(null, maintenant)).toBe(false);
    for (const status of ['active', 'trialing', 'past_due']) {
      expect(estActif(abonnement(status), maintenant)).toBe(true);
    }
    for (const status of ['canceled', 'incomplete', 'unpaid', 'paused']) {
      expect(estActif(abonnement(status), maintenant)).toBe(false);
    }
    expect(estActif(abonnement('active', '2026-11-01T00:00:00Z'), maintenant)).toBe(false);
    expect(estActif(abonnement('active', null), maintenant)).toBe(true);
  });
});
