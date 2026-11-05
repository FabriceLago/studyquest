import { Injector, afterNextRender } from '@angular/core';

/** Le nouvel écran est annoncé aux lecteurs d'écran et reprend en haut de page. */
export function concentrerTitre(injector: Injector): void {
  afterNextRender(
    () => {
      window.scrollTo(0, 0);
      document.querySelector<HTMLElement>('main h1')?.focus();
    },
    { injector },
  );
}
