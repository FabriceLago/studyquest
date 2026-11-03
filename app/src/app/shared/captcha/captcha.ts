import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  InjectionToken,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { environment } from '../../../environments/environment';

/** Clé de site Cloudflare Turnstile ; vide (en local) : aucun captcha. */
export const TURNSTILE_SITE_KEY = new InjectionToken<string>('TURNSTILE_SITE_KEY', {
  providedIn: 'root',
  factory: () => environment.turnstileSiteKey,
});

/** Ce que l'application utilise de l'API de Turnstile. */
export interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}
type WithTurnstile = Window & { turnstile?: TurnstileApi };

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

/** Charge le script de Turnstile une seule fois par page. */
function loadTurnstile(document: Document): Promise<TurnstileApi> {
  const win = document.defaultView as WithTurnstile;
  if (win.turnstile) return Promise.resolve(win.turnstile);
  return (loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      win.turnstile ? resolve(win.turnstile) : reject(new Error('Turnstile absent'));
    script.onerror = () => {
      loading = null;
      reject(new Error('Turnstile injoignable'));
    };
    document.head.append(script);
  }));
}

/**
 * Vérification anti-robot (Cloudflare Turnstile) des formulaires de connexion, d'inscription et
 * de mot de passe oublié : Supabase l'exige quand le captcha y est activé. Sans clé de site, rien
 * ne s'affiche et `take()` renvoie undefined.
 */
@Component({
  selector: 'sq-captcha',
  template: `
    @if (configured) {
      <div #box></div>
      @if (failed()) {
        <p class="hint" role="alert">
          La vérification anti-robot n’a pas pu se charger : vérifie ta connexion, puis recharge la page.
        </p>
      }
    }
  `,
  styles: `
    .hint {
      margin: 0;
      color: var(--color-danger);
      font-size: var(--text-sm);
    }
  `,
})
export class Captcha {
  private readonly siteKey = inject(TURNSTILE_SITE_KEY);
  private readonly document = inject(DOCUMENT);
  private readonly box = viewChild<ElementRef<HTMLElement>>('box');
  private widget: { readonly api: TurnstileApi; readonly id: string } | null = null;

  readonly configured = this.siteKey !== '';
  /** Jeton à usage unique, donné par Turnstile une fois la vérification faite. */
  readonly token = signal<string | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    afterNextRender(() => void this.render());
    inject(DestroyRef).onDestroy(() => this.widget?.api.remove(this.widget.id));
  }

  /** Jeton pour la demande : undefined sans captcha, null tant que la vérification n'est pas faite. */
  take(): string | null | undefined {
    return this.configured ? this.token() : undefined;
  }

  /** Après chaque demande : le jeton est consommé, une nouvelle vérification commence. */
  reset(): void {
    this.token.set(null);
    if (this.widget) this.widget.api.reset(this.widget.id);
  }

  private async render(): Promise<void> {
    const box = this.box()?.nativeElement;
    if (!box) return;
    try {
      const api = await loadTurnstile(this.document);
      const id = api.render(box, {
        sitekey: this.siteKey,
        language: 'fr',
        callback: (token: string) => this.token.set(token),
        'expired-callback': () => this.token.set(null),
        'error-callback': () => this.token.set(null),
      });
      this.widget = { api, id };
    } catch {
      this.failed.set(true);
    }
  }
}

/** Message quand une demande part avant la fin de la vérification anti-robot. */
export const CAPTCHA_PENDING =
  'Vérification anti-robot en cours : patiente un instant, puis réessaie.';
