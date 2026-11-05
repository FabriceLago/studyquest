import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CoursService, Format, reduirePhoto, validerImport } from '../../core/cours/cours.service';

@Component({
  selector: 'sq-importer-page',
  imports: [RouterLink],
  template: `
    <h1>Importer un cours</h1>
    <form class="form" novalidate (submit)="envoyer($event)">
      <div class="field">
        <label for="titre">Titre du cours</label>
        <input
          #titreInput
          id="titre"
          type="text"
          maxlength="120"
          [value]="titre()"
          (input)="titre.set(titreInput.value)"
        />
      </div>

      <fieldset class="choix-format">
        <legend>Ton cours est…</legend>
        @for (option of options; track option.id) {
          <label class="case">
            <input
              type="radio"
              name="format"
              [checked]="format() === option.id"
              (change)="choisir(option.id)"
            />
            {{ option.nom }}
          </label>
        }
      </fieldset>

      @if (format() === 'texte') {
        <div class="field">
          <label for="texte">Texte du cours</label>
          <textarea
            #texteInput
            id="texte"
            rows="10"
            maxlength="60000"
            [value]="texte()"
            (input)="texte.set(texteInput.value)"
          ></textarea>
        </div>
      } @else {
        <div class="field">
          <label for="fichiers">{{
            format() === 'pdf'
              ? 'Fichier PDF, 30 pages et 20 Mo au maximum'
              : 'Photos, 30 au maximum'
          }}</label>
          <input
            id="fichiers"
            type="file"
            [accept]="format() === 'pdf' ? 'application/pdf' : 'image/*'"
            [multiple]="format() === 'photos'"
            (change)="fichiers.set(liste($event))"
          />
        </div>
      }

      <p class="hint">
        Ton document est envoyé à notre fournisseur d’IA, puis supprimé de nos serveurs une fois lu.
        Retire les informations personnelles avant de l’importer.
      </p>

      @if (erreur()) {
        <p class="field-error" role="alert">{{ erreur() }}</p>
      }
      <button type="submit" class="btn btn-primary" [disabled]="envoi()">
        {{ envoi() ? 'Envoi en cours…' : 'Créer mes questions' }}
      </button>
      <a routerLink="/">Revenir à ma journée</a>
    </form>
  `,
})
export class ImporterPage {
  private readonly cours = inject(CoursService);
  private readonly router = inject(Router);
  protected readonly options: readonly { id: Format; nom: string }[] = [
    { id: 'pdf', nom: 'Un fichier PDF' },
    { id: 'photos', nom: 'Des photos' },
    { id: 'texte', nom: 'Du texte à coller' },
  ];
  protected readonly titre = signal('');
  protected readonly format = signal<Format>('pdf');
  protected readonly fichiers = signal<File[]>([]);
  protected readonly texte = signal('');
  protected readonly erreur = signal('');
  protected readonly envoi = signal(false);

  protected choisir(format: Format): void {
    this.format.set(format);
    this.fichiers.set([]);
    this.erreur.set('');
  }

  protected liste(event: Event): File[] {
    return Array.from((event.target as HTMLInputElement).files ?? []);
  }

  protected async envoyer(event: Event): Promise<void> {
    event.preventDefault();
    if (this.envoi()) return;
    const format = this.format();
    const fichiers = this.fichiers();
    const probleme = validerImport({
      titre: this.titre(),
      format,
      texte: this.texte(),
      fichiers: fichiers.map((f) => ({ nom: f.name, taille: f.size, type: f.type })),
    });
    this.erreur.set(probleme ?? '');
    if (probleme) return;

    this.envoi.set(true);
    try {
      const blobs: Blob[] =
        format === 'photos' ? await Promise.all(fichiers.map(reduirePhoto)) : fichiers;
      const resultat = await this.cours.importer(this.titre(), format, blobs, this.texte());
      if ('id' in resultat) await this.router.navigate(['/cours', resultat.id]);
      else this.erreur.set(resultat.erreur);
    } catch {
      this.erreur.set('Une photo n’a pas pu être lue. Essaie avec un fichier JPEG ou PNG.');
    } finally {
      this.envoi.set(false);
    }
  }
}
