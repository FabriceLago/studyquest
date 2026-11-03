import {
  Component,
  DOCUMENT,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CAPTCHA_PENDING, Captcha } from '../../shared/captcha/captcha';

type Field = 'pseudo' | 'email' | 'mot-de-passe' | 'age';
export type FieldErrors = Partial<Record<Field, string>>;

/** Contrôles faits avant l'envoi ; le serveur revérifie, y compris la déclaration d'âge. */
export function validateAuthForm(
  values: {
    readonly pseudo: string;
    readonly email: string;
    readonly password: string;
    readonly age: boolean;
  },
  signup: boolean,
): FieldErrors {
  const errors: FieldErrors = {};
  const pseudo = values.pseudo.trim();
  if (signup && (pseudo.length === 0 || pseudo.length > 30)) {
    errors.pseudo = 'Choisis un pseudo (30 caractères au plus).';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Indique une adresse e-mail valide, par exemple nom@exemple.fr.';
  }
  if (values.password.length === 0) {
    errors['mot-de-passe'] = 'Indique ton mot de passe.';
  } else if (signup && values.password.length < 10) {
    errors['mot-de-passe'] = 'Choisis un mot de passe d’au moins 10 caractères.';
  } else if (signup && values.password.length > 72) {
    errors['mot-de-passe'] = 'Le mot de passe ne doit pas dépasser 72 caractères.';
  }
  if (signup && !values.age) {
    errors.age = 'StudyQuest est réservé aux personnes de 15 ans et plus.';
  }
  return errors;
}

/** Connexion ou création de compte, selon la route. */
@Component({
  selector: 'sq-auth-page',
  imports: [RouterLink, Captcha],
  templateUrl: './auth-page.html',
})
export class AuthPage {
  /** Fourni par les données de la route. */
  readonly mode = input<'connexion' | 'inscription'>('connexion');

  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly summary = viewChild<ElementRef<HTMLElement>>('summary');
  private readonly captcha = viewChild(Captcha);

  protected readonly signup = computed(() => this.mode() === 'inscription');
  protected readonly pseudo = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly age = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly pending = signal(false);
  protected readonly fieldErrors = signal<FieldErrors>({});
  protected readonly serverError = signal('');
  protected readonly confirmationSent = signal(false);
  protected readonly unconfirmed = signal(false);
  protected readonly resendMessage = signal('');
  protected readonly errors = computed(() => [
    ...(Object.entries(this.fieldErrors()) as [Field, string][]).map(([field, text]) => ({
      field,
      text,
    })),
    ...(this.serverError() ? [{ field: null, text: this.serverError() }] : []),
  ]);
  protected readonly passwordDescription = computed(
    () =>
      [
        this.signup() ? 'mot-de-passe-aide' : '',
        this.fieldErrors()['mot-de-passe'] ? 'mot-de-passe-erreur' : '',
      ]
        .filter(Boolean)
        .join(' ') || null,
  );

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.pending()) return;
    const values = {
      pseudo: this.pseudo(),
      email: this.email(),
      password: this.password(),
      age: this.age(),
    };
    const errors = validateAuthForm(values, this.signup());
    this.fieldErrors.set(errors);
    this.serverError.set('');
    this.unconfirmed.set(false);
    if (Object.keys(errors).length > 0) {
      this.focusSummary();
      return;
    }

    const captchaToken = this.captcha()?.take();
    if (captchaToken === null) {
      this.serverError.set(CAPTCHA_PENDING);
      this.focusSummary();
      return;
    }

    this.pending.set(true);
    const email = values.email.trim();
    const result = this.signup()
      ? await this.auth.signUp(email, values.password, values.pseudo.trim(), captchaToken)
      : await this.auth.signIn(email, values.password, captchaToken);
    this.pending.set(false);
    this.captcha()?.reset();

    if (!result.ok) {
      this.serverError.set(result.message);
      this.unconfirmed.set(result.unconfirmed === true);
      this.focusSummary();
    } else if (result.needsConfirmation) {
      this.confirmationSent.set(true);
    } else {
      await this.router.navigateByUrl('/');
    }
  }

  protected async resend(): Promise<void> {
    if (this.pending()) return;
    const captchaToken = this.captcha()?.take();
    if (captchaToken === null) {
      this.resendMessage.set(CAPTCHA_PENDING);
      return;
    }
    this.pending.set(true);
    this.resendMessage.set('');
    const result = await this.auth.resendConfirmation(this.email().trim(), captchaToken);
    this.pending.set(false);
    this.captcha()?.reset();
    if (!result.ok) {
      this.resendMessage.set(result.message);
    } else if (this.confirmationSent()) {
      this.resendMessage.set(`Nouveau message envoyé à ${this.email().trim()}.`);
    } else {
      this.serverError.set('');
      this.unconfirmed.set(false);
      this.confirmationSent.set(true);
    }
  }

  /** Lien du résumé d'erreurs : place le focus sur le champ. */
  protected focusField(event: Event, field: Field): void {
    event.preventDefault();
    this.document.getElementById(field)?.focus();
  }

  private focusSummary(): void {
    afterNextRender(() => this.summary()?.nativeElement.focus(), { injector: this.injector });
  }
}
