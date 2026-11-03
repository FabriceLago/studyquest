import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthPage, validateAuthForm } from './auth-page';

const valide = {
  pseudo: 'Lina',
  email: 'lina@example.test',
  password: 'une phrase assez longue',
  age: true,
};

describe('validateAuthForm', () => {
  it('accepte une inscription complète', () => {
    expect(validateAuthForm(valide, true)).toEqual({});
  });

  it("refuse l'inscription sans déclaration d'âge", () => {
    expect(validateAuthForm({ ...valide, age: false }, true).age).toContain('15 ans');
  });

  it('ne demande ni pseudo ni âge à la connexion', () => {
    expect(
      validateAuthForm({ pseudo: '', email: valide.email, password: 'x', age: false }, false),
    ).toEqual({});
  });

  it('refuse un pseudo vide ou trop long, un e-mail invalide, un mot de passe trop court ou trop long', () => {
    expect(validateAuthForm({ ...valide, pseudo: '   ' }, true).pseudo).toBeDefined();
    expect(validateAuthForm({ ...valide, pseudo: 'x'.repeat(31) }, true).pseudo).toBeDefined();
    expect(validateAuthForm({ ...valide, email: 'pas-une-adresse' }, true).email).toBeDefined();
    expect(validateAuthForm({ ...valide, password: 'court' }, true)['mot-de-passe']).toBeDefined();
    expect(
      validateAuthForm({ ...valide, password: 'x'.repeat(73) }, true)['mot-de-passe'],
    ).toBeDefined();
  });
});

describe('AuthPage', () => {
  function page(mode: 'connexion' | 'inscription') {
    const auth = { user: signal(null), signUp: vi.fn(), signIn: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(AuthPage);
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    return { auth, fixture, element: fixture.nativeElement as HTMLElement };
  }

  it("la case d'âge n'apparaît qu'à l'inscription", () => {
    expect(page('inscription').element.querySelector('#age')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(page('connexion').element.querySelector('#age')).toBeNull();
  });

  it("sans la case cochée, rien n'est envoyé", async () => {
    const { auth, fixture, element } = page('inscription');
    const saisir = (id: string, valeur: string) => {
      const champ = element.querySelector<HTMLInputElement>(`#${id}`);
      if (!champ) throw new Error(id);
      champ.value = valeur;
      champ.dispatchEvent(new Event('input'));
    };
    saisir('pseudo', valide.pseudo);
    saisir('email', valide.email);
    saisir('mot-de-passe', valide.password);
    element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(element.querySelector('#age-erreur')?.textContent).toContain('15 ans');
  });
});
