import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'sq-bilan',
  imports: [RouterLink],
  template: `
    <p class="sur">{{ sur() }}</p>
    <h1 tabindex="-1">{{ titre() }}</h1>
    <div class="chiffres">
      <div>
        <strong>{{ justes() }}/{{ total() }}</strong>
        <span class="hint">justes</span>
      </div>
      <div>
        <strong>+{{ gain() }}</strong>
        <span class="hint">XP</span>
      </div>
      <div>
        <strong>{{ serie() }} j</strong>
        <span class="hint">de série</span>
      </div>
    </div>
    @if (note()) {
      <p class="hint bloc">{{ note() }}</p>
    }
    <a class="btn btn-primary bloc" routerLink="/">Retour à ma journée</a>
  `,
})
export class Bilan {
  readonly sur = input.required<string>();
  readonly titre = input.required<string>();
  readonly justes = input.required<number>();
  readonly total = input.required<number>();
  readonly gain = input.required<number>();
  readonly serie = input.required<number>();
  readonly note = input('');
}
