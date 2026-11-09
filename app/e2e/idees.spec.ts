import { expect, test } from '@playwright/test';
import { importer, commencer, repondreJuste, sansDefaut } from './aide';

/** Parcours réels du second lot d'ajouts du 4 novembre, avec une IA simulée : aucune dépense. */
test.skip(({ isMobile }) => !isMobile, 'Parcours lourds : sur mobile seulement');
test.beforeEach(() => {
  test.setTimeout(240_000);
});

test('les cartes se révisent librement, sans XP', async ({ page }) => {
  await commencer(page);
  await importer(page);
  await page.getByRole('link', { name: /Biologie/ }).click();
  await page.getByRole('link', { name: 'Réviser avec les cartes' }).click();

  const verso = page.locator('.verso');
  await expect(page.getByRole('heading', { level: 1, name: 'Recto' })).toBeVisible();
  await expect(page.getByText('1/3')).toBeVisible();
  await expect(verso).toBeHidden();
  await sansDefaut(page);
  await page.getByRole('button', { name: 'Voir le verso' }).click();
  await expect(verso).toHaveText('Verso');
  await sansDefaut(page);

  await page.getByRole('button', { name: 'Carte suivante' }).click();
  await expect(page.getByText('2/3')).toBeVisible();
  await expect(verso).toBeHidden();
  await page.getByRole('button', { name: 'Carte précédente' }).click();
  await expect(page.getByText('1/3')).toBeVisible();

  await page.goto('/');
  await expect(page.getByText('0 / 100 XP vers le niveau 2')).toBeVisible();
});

test('après un examen blanc, la notion la plus faible revient dans les révisions', async ({
  page,
}) => {
  await commencer(page);
  await importer(page);
  await page.getByRole('link', { name: 'Découvrir une notion' }).click();
  for (let i = 1; i <= 8; i++) {
    await expect(page.getByText(`${i}/8`)).toBeVisible();
    await repondreJuste(page);
    await page.getByRole('button', { name: 'Valider' }).click();
    await page.getByRole('button', { name: /Question suivante|Voir le résultat/ }).click();
  }
  await page.getByRole('link', { name: 'Retour à ma journée' }).click();
  await expect(page.getByRole('link', { name: /^Réviser/ })).toBeHidden();

  await page.getByRole('link', { name: /Biologie/ }).click();
  await page.getByRole('link', { name: 'Passer un examen blanc' }).click();
  for (let i = 1; i <= 12; i++) {
    await expect(page.getByText(`${i}/12`)).toBeVisible();
    await page.getByRole('button', { name: 'Passer cette question' }).click();
  }
  await page.getByRole('button', { name: 'Réviser ma notion la plus faible' }).click();
  await expect(page.getByRole('status')).toContainText(
    '4 questions de « Notion 1 » sont dans tes révisions du jour.',
  );
  await sansDefaut(page);

  await page.goto('/');
  await expect(page.getByRole('link', { name: /Réviser.*4 questions à revoir/ })).toBeVisible();
});

test('le mode écoute lit la question et ses choix en français', async ({ page }) => {
  await page.addInitScript(() => {
    const lectures: string[] = [];
    (window as unknown as { lectures: string[] }).lectures = lectures;
    speechSynthesis.speak = (u) => void lectures.push(`${u.lang}|${u.text}`);
  });
  await commencer(page);
  await importer(page);
  await page.getByRole('link', { name: 'Découvrir une notion' }).click();
  await page.getByRole('button', { name: 'Écouter la question' }).click();
  const lectures = await page.evaluate(
    () => (window as unknown as { lectures: string[] }).lectures,
  );
  expect(lectures).toHaveLength(1);
  expect(lectures[0]).toMatch(/^fr-FR\|Question 1 \?/);
  expect(lectures[0]).toContain('Réponse 1 :');
  expect(lectures[0]).toContain('Bonne');
  await sansDefaut(page);
});

test('la fiche s’imprime sans le décor de l’application', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      (window as unknown as { imprime: boolean }).imprime = true;
    };
  });
  await commencer(page);
  await importer(page);
  await page.getByRole('link', { name: /Biologie/ }).click();
  await page.getByRole('link', { name: 'Voir la fiche à imprimer' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Biologie');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
  await expect(page.locator('.carte-fiche strong').first()).toHaveText('Recto');
  await sansDefaut(page);

  await page.getByRole('button', { name: 'Imprimer ou enregistrer en PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { imprime: boolean }).imprime)).toBe(true);

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('link', { name: 'StudyQuest' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Imprimer ou enregistrer en PDF' })).toBeHidden();
  const couleurs = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return [style.backgroundColor, style.color];
  });
  expect(couleurs).toEqual(['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
});
