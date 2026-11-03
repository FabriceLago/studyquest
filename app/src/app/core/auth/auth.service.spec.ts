import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../supabase/supabase';
import { AuthService, authMessage } from './auth.service';

function client(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      onAuthStateChange: (callback: (event: string, session: null) => void) =>
        callback('INITIAL_SESSION', null),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      ...overrides,
    },
    rpc: vi.fn(async () => ({ error: null })),
  };
}

function service(supabase: unknown) {
  TestBed.configureTestingModule({
    providers: [{ provide: SUPABASE, useValue: Promise.resolve(supabase) }],
  });
  return TestBed.inject(AuthService);
}

describe('AuthService', () => {
  it('whenReady se résout sans session', async () => {
    const auth = service(client());
    await auth.whenReady;
    expect(auth.userId()).toBeNull();
  });

  it('whenReady se résout aussi si la bibliothèque ne charge pas', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: SUPABASE, useValue: Promise.reject(new Error('hors ligne')) }],
    });
    await TestBed.inject(AuthService).whenReady;
  });

  it("l'inscription envoie le pseudo et la déclaration d'âge", async () => {
    const supabase = client();
    const result = await service(supabase).signUp('a@example.test', 'mot de passe long', 'Lina');
    expect(result).toEqual({ ok: true, needsConfirmation: true });
    const appel = supabase.auth.signUp.mock.calls[0] as unknown as [{ options: { data: unknown } }];
    expect(appel[0].options.data).toEqual({ pseudo: 'Lina', declares_15_plus: true });
  });

  it('une adresse déjà inscrite reçoit la même réponse qu’une nouvelle', async () => {
    const supabase = client({
      signUp: vi.fn(async () => ({
        data: { session: null },
        error: { code: 'user_already_exists' },
      })),
    });
    expect(await service(supabase).signUp('a@example.test', 'mot de passe long', 'Lina')).toEqual({
      ok: true,
      needsConfirmation: true,
    });
  });

  it('une adresse non confirmée est signalée à la connexion', async () => {
    const supabase = client({
      signInWithPassword: vi.fn(async () => ({ error: { code: 'email_not_confirmed' } })),
    });
    const result = await service(supabase).signIn('a@example.test', 'x');
    expect(result).toMatchObject({ ok: false, unconfirmed: true });
  });

  it('un échec réseau donne un message compréhensible', async () => {
    const supabase = client({
      signInWithPassword: vi.fn(async () => {
        throw new Error('réseau');
      }),
    });
    const result = await service(supabase).signIn('a@example.test', 'x');
    expect(result).toEqual({ ok: false, message: authMessage({ status: 0 }) });
  });

  it('la suppression du compte appelle le serveur puis ferme la session', async () => {
    const supabase = client();
    expect((await service(supabase).deleteAccount()).ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('un refus du serveur à la suppression garde la session', async () => {
    const supabase = client();
    supabase.rpc = vi.fn(async () => ({ error: { code: '42501' } })) as never;
    expect((await service(supabase).deleteAccount()).ok).toBe(false);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });
});
