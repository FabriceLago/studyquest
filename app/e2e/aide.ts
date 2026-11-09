import AxeBuilder from '@axe-core/playwright';
import { Page, expect } from '@playwright/test';

/** Pas de défilement horizontal, aucune anomalie d'accessibilité détectée par axe. */
export async function sansDefaut(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
}

/**
 * Un cours « Biologie » de 3 notions de 4 questions (choix unique, vrai/faux, multiple), placé dans le
 * stockage local comme s'il avait été écrit à la main : le formulaire est testé par ecrire.spec.ts.
 */
export async function importer(page: Page) {
  await page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('studyquest') ?? '{}');
    const cours = crypto.randomUUID();
    etat.cours = [
      ...(etat.cours ?? []),
      { id: cours, titre: 'Biologie', cree: new Date().toISOString(), date_examen: null },
    ];
    etat.notions = etat.notions ?? [];
    etat.questions = etat.questions ?? [];
    for (let n = 0; n < 3; n++) {
      const notion = crypto.randomUUID();
      etat.notions.push({
        id: notion,
        cours,
        titre: `Notion ${n + 1}`,
        ordre: n,
        recto: 'Recto',
        verso: 'Verso',
        batie: null,
      });
      const formes = [
        { type: 'unique', options: ['Bonne', 'Fausse'], correctes: [0] },
        { type: 'vrai_faux', options: ['Vrai', 'Faux'], correctes: [0] },
        { type: 'multiple', options: ['Oui', 'Aussi', 'Non'], correctes: [0, 1] },
        { type: 'unique', options: ['Fausse', 'Bonne'], correctes: [1] },
      ];
      formes.forEach((f, i) =>
        etat.questions.push({
          id: crypto.randomUUID(),
          notion,
          enonce: `Question ${n * 4 + i + 1} ?`,
          explication: 'Le cours le dit.',
          ordre: i,
          ...f,
        }),
      );
    }
    localStorage.setItem('studyquest', JSON.stringify(etat));
  });
  await page.goto('/');
}

/** Les bonnes réponses de l'IA simulée. Renvoie true si le clic a suffi à répondre dans un défi. */
export async function repondreJuste(page: Page): Promise<boolean> {
  const etapes = page.locator('.ordre li span');
  if (await etapes.count()) {
    for (const [position, etape] of ['Un', 'Deux', 'Trois'].entries()) {
      let actuelle = (await etapes.allTextContents()).findIndex((t) => t.trim() === etape);
      while (actuelle > position) {
        await page.getByRole('button', { name: `Monter : ${etape}` }).click();
        actuelle--;
        await expect(etapes.nth(actuelle)).toHaveText(etape);
      }
    }
    return false;
  }
  if (await page.locator('.assoc').count()) {
    await page.locator('.assoc').nth(0).locator('select').selectOption({ label: '1' });
    await page.locator('.assoc').nth(1).locator('select').selectOption({ label: '2' });
    return false;
  }
  const multiple = page.getByRole('button', { name: 'Oui', exact: true });
  if (await multiple.count()) {
    await multiple.click();
    await page.getByRole('button', { name: 'Aussi', exact: true }).click();
    return false;
  }
  const unique = page.getByRole('button', { name: /^(Bonne|Vrai)$/ });
  await unique.click();
  return true;
}

/**
 * Avance le temps : les questions déjà vues (d'une notion, ou toutes) deviennent dues hier, ou
 * aujourd'hui, éventuellement dans une autre boîte. La page doit être rechargée ensuite.
 */
export async function reglerRevisions(
  page: Page,
  options: { notion?: string; boite?: number; aujourdhui?: boolean } = {},
) {
  await page.evaluate(({ notion, boite, aujourdhui }) => {
    const etat = JSON.parse(localStorage.getItem('studyquest') ?? '{}');
    const d = new Date(Date.now() - (aujourdhui ? 0 : 86_400_000));
    const jour = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    const notions = new Set(
      etat.notions
        .filter((n: { titre: string }) => !notion || n.titre === notion)
        .map((n: { id: string }) => n.id),
    );
    for (const q of etat.questions) {
      const r = etat.revisions[q.id];
      if (!r || !notions.has(q.notion)) continue;
      r.echeance = jour;
      if (boite) r.boite = boite;
    }
    localStorage.setItem('studyquest', JSON.stringify(etat));
  }, options);
}

export async function chiffres(page: Page, justes: string, gain: string, serie: string) {
  const valeurs = page.locator('.chiffres strong');
  await expect(valeurs).toHaveText([justes, gain, serie]);
  await sansDefaut(page);
}

/** Bienvenue, déclaration d'âge, puis Aujourd'hui. */
export async function commencer(page: Page): Promise<void> {
  await page.goto('/bienvenue');
  await page.getByLabel('J’ai 15 ans ou plus').check();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Salut Joueur' })).toBeVisible();
}
