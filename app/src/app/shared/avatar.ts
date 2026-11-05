import { Component, computed, input } from '@angular/core';
import { AVATARS } from '../core/avatars';

/** Décoratif : le texte voisin (pseudo, nom de l'avatar) porte le sens. */
@Component({
  selector: 'sq-avatar',
  template: `
    <svg class="avatar" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" />
      <path [attr.d]="d()" transform="translate(4.8 4.8) scale(0.6)" />
    </svg>
  `,
})
export class Avatar {
  readonly numero = input(0);
  protected readonly d = computed(() => (AVATARS[this.numero()] ?? AVATARS[0]).d);
}
