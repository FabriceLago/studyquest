import { Locator, Page, expect, test } from '@playwright/test';
import { exigeSupabase, commencer, sansDefaut } from './aide';

/** Ajout du 7 novembre : un cours écrit à la main, sans IA ni quota, joué comme les autres. */
test.beforeEach(async ({ request }) => {
  await exigeSupabase(request);
  test.setTimeout(180_000);
});

const REPONSES: Record<string, string> = {
  'Année de la prise de la Bastille ?': '1789',
  'Louis XVI régnait en 1789.': 'Vrai',
  'Année du sacre de Napoléon ?': '1804',
};

const groupe = (dans: Page | Locator, nom: string) =>
  dans.getByRole('group', { name: nom, exact: true });

async function remplirNotion(notion: Locator, titre: string, retenir: string) {
  await notion.getByLabel('Titre de la notion').fill(titre);
  await notion.getByLabel('À retenir').fill(retenir);
}

async function vraiFaux(question: Locator, enonce: string) {
  await question.getByLabel('Énoncé').fill(enonce);
  await question.getByLabel('Question vrai ou faux').check();
  await expect(question.getByLabel('Vrai', { exact: true })).toBeChecked();
}

test('écrire un cours à la main, le jouer, puis lui ajouter une notion', async ({ page }) => {
  await commencer(page);
  await page.goto('/cours/importer');
  await expect(page.getByRole('link', { name: 'Écrire mes questions moi-même' })).toBeVisible();

  // Sans aucun cours, Aujourd'hui propose aussi d'écrire ses questions.
  await page.goto('/');
  await page.getByRole('link', { name: 'Écrire mes questions moi-même' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Écrire mes questions' })).toBeVisible();
  await sansDefaut(page);

  await page.getByRole('button', { name: 'Enregistrer le cours' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Donne un titre à ce cours (120 caractères au plus).',
  );
  await page.getByLabel('Titre du cours').fill('Histoire');

  // Notion 1 : un choix unique (le troisième choix reste vide) et un vrai/faux.
  const notion1 = groupe(page, 'Notion 1');
  await remplirNotion(notion1, 'Révolution', '1789 : prise de la Bastille.');
  const q1 = groupe(notion1, 'Question 1');
  await q1.getByLabel('Énoncé').fill('Année de la prise de la Bastille ?');
  await q1.getByLabel('Choix 1', { exact: true }).fill('1789');
  await q1.getByLabel('Bonne réponse (choix 1)').check();
  await q1.getByLabel('Choix 2', { exact: true }).fill('1815');
  await q1.getByLabel('Explication (facultative)').fill('Le 14 juillet 1789.');
  await notion1.getByRole('button', { name: 'Ajouter une question' }).click();
  await vraiFaux(groupe(notion1, 'Question 2'), 'Louis XVI régnait en 1789.');

  // Notion 2 : la bonne réponse oubliée est signalée à sa place.
  await page.getByRole('button', { name: 'Ajouter une notion' }).click();
  const notion2 = groupe(page, 'Notion 2');
  await remplirNotion(notion2, 'Empire', 'Napoléon est sacré en 1804.');
  const q3 = groupe(notion2, 'Question 1');
  await q3.getByLabel('Énoncé').fill('Année du sacre de Napoléon ?');
  await q3.getByLabel('Choix 1', { exact: true }).fill('1804');
  await q3.getByLabel('Choix 2', { exact: true }).fill('1799');
  await page.getByRole('button', { name: 'Enregistrer le cours' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Notion 2, question 1 : coche au moins une bonne réponse.',
  );
  await q3.getByLabel('Bonne réponse (choix 1)').check();
  await sansDefaut(page);
  await page.screenshot({ path: test.info().outputPath('ecrire.png'), fullPage: true });

  await page.getByRole('button', { name: 'Enregistrer le cours' }).click();
  await expect(page.getByText('3 questions prêtes.', { exact: true })).toBeVisible();
  const adresse = page.url();
  await expect(page.getByText('Retire celles')).toHaveCount(0);
  await expect(page.locator('blockquote')).toHaveCount(0);
  await expect(page.getByText('Carte : Révolution → 1789 : prise de la Bastille.')).toBeVisible();
  await sansDefaut(page);

  // Joué comme un cours importé : pas de citation, l'explication écrite s'affiche.
  await page.goto('/session/decouvrir');
  for (let i = 0; i < 3; i++) {
    await expect(page.getByText(`${i + 1}/3`)).toBeVisible();
    const enonce = ((await page.getByRole('heading', { level: 1 }).textContent()) ?? '').trim();
    await page.getByRole('button', { name: REPONSES[enonce], exact: true }).click();
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByRole('status')).toContainText('Juste');
    await expect(page.locator('cite')).toHaveCount(0);
    if (enonce === 'Année de la prise de la Bastille ?')
      await expect(page.getByText('Le 14 juillet 1789.')).toBeVisible();
    await page.getByRole('button', { name: /Question suivante|Voir le résultat/ }).click();
  }

  // Le quartier du cours est dans la ville, ses deux notions en chantier.
  await page.goto('/ville');
  await expect(
    page.getByRole('img', { name: /0 bâtiment construit sur 2 emplacements/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /En chantier/ })).toHaveCount(2);

  // Plus tard, l'auteur ajoute une notion.
  await page.goto(adresse);
  await page.getByRole('link', { name: 'Ajouter des notions' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ajouter des notions' })).toBeVisible();
  await expect(page.getByText('Histoire', { exact: true })).toBeVisible();
  const ajout = groupe(page, 'Notion 1');
  await remplirNotion(ajout, 'Restauration', 'Louis XVIII revient en 1814.');
  await vraiFaux(groupe(ajout, 'Question 1'), 'Louis XVIII régnait en 1814.');
  await sansDefaut(page);
  await page.getByRole('button', { name: 'Enregistrer le cours' }).click();
  await expect(page.getByText('4 questions prêtes.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Restauration' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('cours.png'), fullPage: true });
});
