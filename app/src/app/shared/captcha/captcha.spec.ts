import { TestBed } from '@angular/core/testing';
import { Captcha } from './captcha';

describe('Captcha', () => {
  it('sans clé de site, ne montre rien et ne demande aucun jeton', () => {
    const fixture = TestBed.createComponent(Captcha);
    fixture.detectChanges();
    expect(fixture.componentInstance.configured).toBe(false);
    expect(fixture.componentInstance.take()).toBeUndefined();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });
});
