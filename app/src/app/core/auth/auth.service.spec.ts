import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../supabase/supabase';
import { AuthService, authMessage } from './auth.service';

function client(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      onAuthStateChange: (callback: (event: string, session: null) => void) =>
        callback('INITIAL_SESSION', null),
      signInAnonymously: vi.fn(async () => ({ data: {}, error: null })),
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

  it("la session anonyme envoie la déclaration d'âge", async () => {
    const supabase = client();
    expect(await service(supabase).commencer()).toEqual({ ok: true });
    const appel = supabase.auth.signInAnonymously.mock.calls[0] as unknown as [
      { options: { data: unknown } },
    ];
    expect(appel[0].options.data).toEqual({ declares_15_plus: true });
  });

  it('un accès libre fermé côté serveur est expliqué', async () => {
    const supabase = client({
      signInAnonymously: vi.fn(async () => ({
        data: {},
        error: { code: 'anonymous_provider_disabled' },
      })),
    });
    expect(await service(supabase).commencer()).toEqual({
      ok: false,
      message: authMessage({ code: 'anonymous_provider_disabled' }),
    });
  });

  it('un échec réseau donne un message compréhensible', async () => {
    const supabase = client({
      signInAnonymously: vi.fn(async () => {
        throw new Error('réseau');
      }),
    });
    expect(await service(supabase).commencer()).toEqual({
      ok: false,
      message: authMessage({ status: 0 }),
    });
  });

  it('la suppression des données appelle le serveur puis oublie la session', async () => {
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
