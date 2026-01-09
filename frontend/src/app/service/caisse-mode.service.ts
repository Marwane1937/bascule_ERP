import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CaisseModeService {
  // Le service utilise 'declared' pour correspondre à l'API, mais les composants utilisent 'declaree'
  private caisseModeSubject = new BehaviorSubject<'declared' | 'black'>('declared');
  public caisseMode$: Observable<'declared' | 'black'> = this.caisseModeSubject.asObservable();

  constructor() {
    // Charger le mode depuis localStorage au démarrage
    const savedMode = localStorage.getItem('caisseMode') as 'declared' | 'black' | null;
    if (savedMode === 'black' || savedMode === 'declared') {
      this.caisseModeSubject.next(savedMode);
      this.applyMode(savedMode);
    }
  }

  getCurrentMode(): 'declared' | 'black' {
    return this.caisseModeSubject.value;
  }

  toggleMode(): void {
    const newMode = this.caisseModeSubject.value === 'declared' ? 'black' : 'declared';
    this.setMode(newMode);
  }

  setMode(mode: 'declared' | 'black'): void {
    this.caisseModeSubject.next(mode);
    localStorage.setItem('caisseMode', mode);
    this.applyMode(mode);
  }

  private applyMode(mode: 'declared' | 'black'): void {
    if (mode === 'black') {
      document.body.classList.add('black-mode-active');
      document.documentElement.classList.add('black-mode-active');
    } else {
      document.body.classList.remove('black-mode-active');
      document.documentElement.classList.remove('black-mode-active');
    }
  }
}

