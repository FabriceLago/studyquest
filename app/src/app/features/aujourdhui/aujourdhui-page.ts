import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

/** Page d'arrivée du socle : la mission du jour et la carte arrivent aux étapes 5 et 6. */
@Component({
  selector: 'sq-aujourdhui-page',
  template: `
    <h1>Salut {{ auth.profile()?.pseudo }}</h1>
    <p class="intro">Ta ville est encore vide. L’import de cours arrive à la prochaine étape.</p>
  `,
})
export class AujourdhuiPage {
  protected readonly auth = inject(AuthService);
}
