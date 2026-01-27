import { Component, OnInit } from '@angular/core';
import { ChequeGenerationService } from '../cheque.service';

@Component({
  selector: 'app-cheque-list',
  templateUrl: './cheque-list.component.html'
})
export class ChequeListComponent implements OnInit {
  reglements: any[] = [];
  loading = false;

  constructor(private chequeService: ChequeGenerationService) { }

  ngOnInit(): void {
    this.loadReglements();
  }

  loadReglements() {
    this.loading = true;
    this.chequeService.getReglementsCheque().subscribe({
      next: (data: any[]) => {
        this.reglements = data;
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
      }
    });
  }
}
