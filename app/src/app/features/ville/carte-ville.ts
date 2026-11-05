import { Component, computed, input } from '@angular/core';
import { CoursVille, dessinerVille } from '../../core/ville/ville';

/** Affiche la ville calculée par dessinerVille. En aperçu (decor), elle est cachée aux lecteurs d'écran. */
@Component({
  selector: 'sq-carte-ville',
  template: `
    @let v = ville();
    <svg
      class="carte"
      [attr.viewBox]="v.viewBox"
      [attr.role]="decor() ? null : 'img'"
      [attr.aria-label]="decor() ? null : resume()"
      [attr.aria-hidden]="decor() ? 'true' : null"
    >
      @for (f of v.formes; track $index) {
        @switch (f.k) {
          @case ('poly') {
            <svg:polygon
              [attr.points]="f.points"
              [attr.fill]="f.fill"
              [attr.stroke]="f.stroke"
              [attr.stroke-width]="f.sw"
              [attr.stroke-dasharray]="f.dash"
              [class.monte]="f.anime"
            />
          }
          @case ('ligne') {
            <svg:line
              [attr.x1]="f.x1"
              [attr.y1]="f.y1"
              [attr.x2]="f.x2"
              [attr.y2]="f.y2"
              [attr.stroke]="f.stroke"
              [attr.stroke-width]="f.sw"
              [class.monte]="f.anime"
            />
          }
          @case ('cercle') {
            <svg:circle
              [attr.cx]="f.cx"
              [attr.cy]="f.cy"
              [attr.r]="f.r"
              [attr.fill]="f.fill"
              [attr.stroke]="f.stroke"
              [class.monte]="f.anime"
            />
          }
          @case ('chemin') {
            <svg:path [attr.d]="f.d" [attr.fill]="f.fill" [class.monte]="f.anime" />
          }
          @case ('ellipse') {
            <svg:ellipse
              [attr.cx]="f.cx"
              [attr.cy]="f.cy"
              [attr.rx]="f.rx"
              [attr.ry]="f.ry"
              [attr.fill]="f.fill"
              [attr.opacity]="f.opacite"
              [class.monte]="f.anime"
            />
          }
          @case ('texte') {
            <svg:text
              [attr.x]="f.x"
              [attr.y]="f.y"
              text-anchor="middle"
              font-weight="700"
              [attr.font-size]="f.taille"
              [attr.fill]="f.fill"
              [attr.stroke]="f.stroke"
              [attr.stroke-width]="f.sw"
              paint-order="stroke"
              [class.monte]="f.anime"
            >
              {{ f.texte }}
            </svg:text>
          }
        }
      }
    </svg>
  `,
})
export class CarteVille {
  readonly cours = input.required<readonly CoursVille[]>();
  readonly niveau = input(1);
  readonly choisi = input<string>();
  /** Aperçu dans un lien : la page Ma ville donne le détail en texte. */
  readonly decor = input(false);

  protected readonly ville = computed(() =>
    dessinerVille(this.cours(), this.niveau(), this.choisi()),
  );
  protected readonly resume = computed(() => {
    const { baties, emplacements } = this.ville();
    return `Ta ville : ${baties} ${baties > 1 ? 'bâtiments construits' : 'bâtiment construit'} sur ${emplacements} ${emplacements > 1 ? 'emplacements' : 'emplacement'}. La liste des notions donne le détail.`;
  });
}
