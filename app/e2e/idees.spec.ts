import { expect, test } from '@playwright/test';
import { exigeSupabase, importer, inscrireEtConfirmer, repondreJuste, sansDefaut } from './aide';

/** Parcours réels du second lot d'ajouts du 4 novembre, avec une IA simulée : aucune dépense. */
test.beforeEach(async ({ request }, info) => {
  test.skip(info.project.name !== 'mobile', 'Parcours lourds : sur mobile seulement');
  await exigeSupabase(request);
  test.setTimeout(240_000);
});

test('les cartes se révisent librement, sans XP', async ({ page, request }) => {
  await inscrireEtConfirmer(page, request);
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
  request,
}) => {
  await inscrireEtConfirmer(page, request);
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

test('le mode écoute lit la question et ses choix en français', async ({ page, request }) => {
  await page.addInitScript(() => {
    const lectures: string[] = [];
    (window as unknown as { lectures: string[] }).lectures = lectures;
    speechSynthesis.speak = (u) => void lectures.push(`${u.lang}|${u.text}`);
  });
  await inscrireEtConfirmer(page, request);
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

test('la fiche s’imprime sans le décor de l’application', async ({ page, request }) => {
  await page.addInitScript(() => {
    window.print = () => {
      (window as unknown as { imprime: boolean }).imprime = true;
    };
  });
  await inscrireEtConfirmer(page, request);
  await importer(page);
  await page.getByRole('link', { name: /Biologie/ }).click();
  await page.getByRole('link', { name: 'Voir la fiche à imprimer' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Biologie');
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(3);
  await expect(page.locator('.carte-fiche strong').first()).toHaveText('Recto');
  await expect(page.getByText('La phrase 1 de ce cours')).toBeVisible();
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

test('un duel se joue en différé, réservé à qui a reçu le cours', async ({
  page,
  request,
  browser,
}) => {
  const lectures: string[] = [];
  page.on('response', async (r) => {
    if (/rpc\/(jouer_duel|repondre_duel)/.test(r.url()))
      lectures.push(await r.text().catch(() => ''));
  });
  await inscrireEtConfirmer(page, request);
  await importer(page);
  await page.getByRole('link', { name: /Biologie/ }).click();
  const defier = page.getByRole('button', { name: 'Défier un ami sur ce cours' });
  await expect(defier).toBeHidden();
  await page.getByLabel(/j’ai le droit de le partager/).check();
  await page.getByRole('button', { name: 'Obtenir un code' }).click();
  await expect(defier).toBeVisible();
  const codeCours = ((await page.locator('.code-partage').textContent()) ?? '').trim();
  await defier.click();

  await expect(page.getByRole('timer')).toHaveText(/^\s*[45]:\d\d\s*$/);
  await expect(page.getByText('1/10')).toBeVisible();
  await sansDefaut(page);
  await repondreJuste(page);
  await page.getByRole('button', { name: 'Question suivante' }).click();
  for (let i = 2; i <= 10; i++) {
    await expect(page.getByText(`${i}/10`)).toBeVisible();
    await page.getByRole('button', { name: 'Passer cette question' }).click();
  }
  await expect(page.getByText('Duel terminé')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '1/10' })).toBeVisible();
  await expect(page.locator('.liste-cours li')).toHaveCount(1);
  const codeDuel = ((await page.locator('.code-partage').textContent()) ?? '').trim();
  await sansDefaut(page);

  const contexte = await browser.newContext({
    baseURL: 'http://localhost:4221',
    serviceWorkers: 'block',
  });
  const ami = await contexte.newPage();
  await inscrireEtConfirmer(ami, request);
  await ami.getByRole('link', { name: 'J’ai un code de duel' }).click();
  await ami.getByLabel('Code du duel').fill(codeDuel);
  await ami.getByRole('button', { name: 'Jouer le duel' }).click();
  await expect(ami.getByRole('alert')).toContainText('recevoir ce cours');

  await ami.goto('/cours/rejoindre');
  await ami.getByLabel('Code du cours').fill(codeCours);
  await ami.getByRole('button', { name: 'Recevoir le cours' }).click();
  await expect(ami.getByText('12 questions prêtes')).toBeVisible();

  await ami.goto('/duel/rejoindre');
  await ami.getByLabel('Code du duel').fill(codeDuel.toLowerCase());
  await ami.getByRole('button', { name: 'Jouer le duel' }).click();
  for (let i = 1; i <= 10; i++) {
    await expect(ami.getByText(`${i}/10`)).toBeVisible();
    await ami.getByRole('button', { name: 'Passer cette question' }).click();
  }
  await expect(ami.getByRole('heading', { level: 1, name: '0/10' })).toBeVisible();
  await expect(ami.locator('.liste-cours li')).toHaveText([
    /1\. Lina\s*1\/10/,
    /2\. Lina \(toi\)\s*0\/10/,
  ]);
  await contexte.close();

  await page.goto('/');
  await expect(page.getByText('0 / 100 XP vers le niveau 2')).toBeVisible();
  const duel = page.locator('.liste-cours li', { hasText: '1/10, 2 joueurs' });
  await expect(duel).toBeVisible();
  await sansDefaut(page);
  await duel.getByRole('link').click();
  await expect(page.locator('.liste-cours li')).toHaveCount(2);

  expect(lectures.length).toBeGreaterThan(0);
  expect(lectures.join('')).not.toMatch(/correctes|"associations"|"ordre"|explication|extrait/);
});
