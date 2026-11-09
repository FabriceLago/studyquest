import { Injectable } from '@angular/core';
import { Etat, etatVide } from './base';

const CLE = 'studyquest';

/**
 * L'état de l'élève, gardé par ce navigateur. Si le stockage est bloqué (navigation privée stricte),
 * l'application marche quand même, mais la progression disparaît à la fermeture de l'onglet.
 */
@Injectable({ providedIn: 'root' })
export class Store {
  private etat: Etat = lire();

  lire(): Etat {
    return this.etat;
  }

  /** Applique la modification puis enregistre ; renvoie ce que renvoie la modification. */
  modifier<T>(modification: (etat: Etat) => T): T {
    const resultat = modification(this.etat);
    try {
      localStorage.setItem(CLE, JSON.stringify(this.etat));
    } catch {
      // Stockage plein ou bloqué : l'état reste en mémoire pour cette visite.
    }
    return resultat;
  }

  effacer(): void {
    this.etat = etatVide();
    try {
      localStorage.removeItem(CLE);
    } catch {
      // Rien à effacer.
    }
  }
}

function lire(): Etat {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? { ...etatVide(), ...(JSON.parse(brut) as Partial<Etat>) } : etatVide();
  } catch {
    return etatVide();
  }
}
