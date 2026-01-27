import { Component, OnInit } from '@angular/core';
import { ChequeGenerationService } from '../cheque.service';

@Component({
    selector: 'app-calibration',
    template: `
    <div class="container mt-4">
      <h2 class="text-info mb-4" style="font-family: serif;">Calibration de l'Imprimante</h2>
      <div class="alert alert-info">
        <i class="fas fa-info-circle me-2"></i>
        Utilisez cette interface pour définir des décalages globaux (X/Y) si votre imprimante coupe les bords.
        Ces réglages s'appliqueront à <strong>tous</strong> les chèques imprimés sur ce poste.
      </div>
      
      <div class="card shadow-sm p-4">
          <div class="row g-3">
              <div class="col-12">
                  <label class="form-label">Banque</label>
                  <select class="form-select" [(ngModel)]="banqueId" (change)="onBanqueChange()">
                      <option *ngFor="let b of banques" [ngValue]="b.id">{{ b.nom }}</option>
                  </select>
              </div>
              <div class="col-md-6">
                  <label class="form-label">Décalage Horizontal (X mm)</label>
                  <input type="number" class="form-control" placeholder="0.0" [(ngModel)]="offset_x_mm">
                  <div class="form-text">Positif : vers la droite. Négatif : vers la gauche.</div>
              </div>
              <div class="col-md-6">
                  <label class="form-label">Décalage Vertical (Y mm)</label>
                  <input type="number" class="form-control" placeholder="0.0" [(ngModel)]="offset_y_mm">
                  <div class="form-text">Positif : vers le bas. Négatif : vers le haut.</div>
              </div>
              <div class="col-12 mt-4 text-end">
                  <button class="btn btn-primary" (click)="saveCalibration()" [disabled]="loading || !banqueId">
                      <i class="fas fa-save me-2"></i> Enregistrer Calibration
                  </button>
              </div>
          </div>
      </div>
    </div>
  `,
    styles: []
})
export class CalibrationComponent implements OnInit {
    loading = false;
    banques: any[] = [];
    banqueId: number | null = null;

    calibrationId: number = 0;
    offset_x_mm: number = 0;
    offset_y_mm: number = 0;

    constructor(private chequeService: ChequeGenerationService) { }

    ngOnInit(): void {
        this.chequeService.getBanques().subscribe(b => {
            this.banques = b || [];
            if (!this.banqueId && this.banques.length > 0) {
                this.banqueId = this.banques[0].id;
            }
            if (this.banqueId) this.loadCalibration();
        });
    }

    onBanqueChange() {
        this.loadCalibration();
    }

    loadCalibration() {
        if (!this.banqueId) return;
        this.loading = true;
        this.chequeService.getCalibration(this.banqueId).subscribe({
            next: (c) => {
                this.calibrationId = c?.id || 0;
                this.offset_x_mm = c?.offset_x_mm || 0;
                this.offset_y_mm = c?.offset_y_mm || 0;
                this.loading = false;
            },
            error: (err) => {
                this.loading = false;
                alert("Erreur chargement calibration.");
            }
        });
    }

    saveCalibration() {
        if (!this.banqueId) return;
        this.loading = true;
        this.chequeService.saveCalibration({
            id: this.calibrationId || 0,
            banqueId: this.banqueId,
            offset_x_mm: Number(this.offset_x_mm || 0),
            offset_y_mm: Number(this.offset_y_mm || 0)
        }).subscribe({
            next: (res) => {
                const c = res?.calibration;
                this.calibrationId = c?.id || this.calibrationId;
                this.loading = false;
                alert('Calibration enregistrée.');
            },
            error: (err) => {
                this.loading = false;
                alert("Erreur enregistrement calibration.");
            }
        });
    }
}
