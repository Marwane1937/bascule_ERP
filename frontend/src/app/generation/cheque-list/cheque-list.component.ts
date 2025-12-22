import { Component } from '@angular/core';

interface ChequeForm {
  beneficiaire: string;
  montant: number;
  montantLettre: string;
  date: string;
  emetteur: string;
  banque: string;
  numero: string;
  echeance: string;
}

@Component({
  selector: 'app-cheque-list',
  templateUrl: './cheque-list.component.html'
})
export class ChequeListComponent {
  cheque: ChequeForm = {
    beneficiaire: '',
    montant: 0,
    montantLettre: '',
    date: '',
    emetteur: '',
    banque: '',
    numero: '',
    echeance: ''
  };

  banques: string[] = ['Société Générale', 'Attijariwafa Bank', 'BMCE', 'Banque Populaire'];

  chequeCree: ChequeForm | null = null;

  creerCheque() {
    this.chequeCree = { ...this.cheque };
  }
}
