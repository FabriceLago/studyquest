import { Page, expect, test } from '@playwright/test';
import { importer, commencer, reglerRevisions, repondreJuste, sansDefaut } from './aide';

/** Étape 6 : la carte reflète la maîtrise réelle, avec une liste textuelle équivalente. */
test.skip(({ isMobile }) => !isMobile, 'Parcours lourds : sur mobile seulement');
test.beforeEach(() => {
  test.setTimeout(240_000);
});

async function repondreAToutes(page: Page, nombre: number) {
  for (let i = 0; i < nombre; i++) {
    await expect(page.getByText(`${i + 1}/${nombre}`)).toBeVisible();
    await repondreJuste(page);
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByRole('status')).toContainText('Juste');
    await page.getByRole('button', { name: /Question suivante|Voir le résultat/ }).click();
  }
}

test('la ville reflète la maîtrise réelle, avec une liste textuelle équivalente', async ({
  page,
}) => {
  await commencer(page);
  await importer(page);

  // Avant toute réponse : trois terrains vides.
  await page.getByRole('link', { name: 'Voir ma ville' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ta ville' })).toBeVisible();
  await expect(
    page.getByRole('img', { name: /0 bâtiment construit sur 3 emplacements/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /À découvrir/ })).toHaveCount(3);
  await sansDefaut(page);

  // Découvrir 8 questions : les deux premières notions passent en chantier.
  await page.goto('/session/decouvrir');
  await repondreAToutes(page, 8);
  await page.goto('/ville');
  await expect(page.getByRole('button', { name: /En chantier/ })).toHaveCount(2);

  // Les questions de la notion 1 reviennent en révision : justes, elles passent en boîte 3.
  await reglerRevisions(page, { notion: 'Notion 1', boite: 2 });
  await page.goto('/session/reviser');
  await repondreAToutes(page, 4);
  await expect(page.getByText('« Notion 1 » s’allume dans ta ville.')).toBeVisible();

  await page.goto('/ville');
  await expect(
    page.getByRole('img', { name: /1 bâtiment construit sur 3 emplacements/ }),
  ).toBeVisible();
  const batie = page.getByRole('button', { name: /Notion 1/ });
  await batie.click();
  await expect(batie).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toHaveText('Notion 1 : Bâtiment construit');
  await sansDefaut(page);

  // Le bâtiment du jour monte, sauf si le mouvement réduit est demandé.
  const animation = () =>
    page
      .locator('.monte')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
  expect(await animation()).toBe('monte');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animation()).toBe('none');
  await page.screenshot({ path: test.info().outputPath('ville.png'), fullPage: true });

  // Une question à revoir ajoute un repère, sans détruire le bâtiment.
  await reglerRevisions(page, { notion: 'Notion 1', aujourdhui: true });
  await page.reload();
  await expect(batie).toContainText('Bâtiment construit, à revoir');

  // Sur Aujourd'hui, l'aperçu est décoratif : le lien porte le nom, la page Ma ville le détail.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Voir ma ville' }).locator('svg')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  await sansDefaut(page);
  await page.screenshot({ path: test.info().outputPath('aujourdhui.png'), fullPage: true });
});
