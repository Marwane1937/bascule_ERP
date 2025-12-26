import { AfterViewInit, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-edit-vehicule',
  templateUrl: './edit-vehicule.component.html',
  styleUrls: ['./edit-vehicule.component.css']
})
export class EditVehiculeComponent implements OnInit, AfterViewInit {
  charges: any[] = [];
  chargeTypes: any[] = [];
  newCharges: any[] = [];
  savingNewCharges: boolean = false;
  loadingChargeTypes: boolean = false;
  vehicule_id: any;
  vehicule: any = null;

  constructor(
    private baseService: BaseService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadChargeTypes();
    this.route.params.subscribe(params => {
      this.vehicule_id = params['vehicule_id'];
      if (this.vehicule_id) {
        this.getVehiculeDetails(this.vehicule_id);
        this.getVehiculeCharges(this.vehicule_id);
      }
    });
  }

  ngAfterViewInit(): void {}

  getVehiculeDetails(vehicule_id: string): void {
    this.baseService.getVehiculeById(vehicule_id).subscribe((data: any) => {
      this.vehicule = data;
    });
  }

  getVehiculeCharges(vehicule_id: string): void {
    this.baseService.getVehiculeCharges(vehicule_id).subscribe((response: any) => {
      this.charges = response?.data || (Array.isArray(response) ? response : []);
    });
  }

  loadChargeTypes(): void {
    this.loadingChargeTypes = true;
    this.baseService.getListesByGroupId(4000).subscribe({
      next: (response: any) => {
        this.chargeTypes = response?.data || (Array.isArray(response) ? response : []);
        this.loadingChargeTypes = false;
      },
      error: (err) => {
        this.loadingChargeTypes = false;
      }
    });
  }

  getChargeTypeLabel(typeValue: any): string {
    if (typeValue === null || typeValue === undefined || typeValue === '') return '-';

    // Si on stocke l'id (number ou string numérique)
    const numeric = typeof typeValue === 'string' ? Number(typeValue) : typeValue;
    if (!Number.isNaN(numeric) && typeof numeric === 'number') {
      const found = this.chargeTypes?.find((t: any) => Number(t?.id) === numeric);
      if (found?.nom) return String(found.nom);
    }

    // Fallback: si c'est déjà le nom
    return String(typeValue);
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  remainingDays(dateFin: any): number | null {
    const d = this.toDate(dateFin);
    if (!d) return null;
    const today = new Date();
    // Normaliser à minuit
    const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  addChargeRow(): void {
    this.newCharges.push({
      type: null, // id depuis listes
      date_debut: '',
      date_fin: '',
      montant: 0,
      libelle: ''
    });
  }

  removeChargeRow(index: number): void {
    this.newCharges.splice(index, 1);
  }

  saveNewCharges(): void {
    if (!this.vehicule_id) {
      this.showError('vehicule_id manquant');
      return;
    }
    if (!this.newCharges.length) {
      this.showError('Aucune charge à enregistrer');
      return;
    }

    // Validation basique
    const invalid = this.newCharges.find((c: any) => !c?.type || !c?.date_debut || !c?.date_fin || !c?.libelle);
    if (invalid) {
      this.showError('Veuillez renseigner Type, Date Début, Date Fin et Libellé pour toutes les charges.');
      return;
    }

    this.savingNewCharges = true;
    const requests = this.newCharges.map((c: any) => {
      const montant = Number(c.montant || 0);
      const payload = {
        libelle: c.libelle,
        date_debut: c.date_debut,
        date_fin: c.date_fin,
        // On n'affiche pas Quantité/Prix dans l'UI: on fixe des valeurs cohérentes
        quantite: 1,
        prix: montant,
        montant,
        sens: null,
        description: null,
        etat: 1,
        type: c.type
      };
      return this.baseService.saveVehiculeCharge(String(this.vehicule_id), payload);
    });

    forkJoin(requests).subscribe({
      next: (results) => {
        this.showSuccess('Charges enregistrées avec succès.');
        this.newCharges = [];

        // Optimistic update (au cas où le GET est lent / cache) : on prepend dans la liste
        if (Array.isArray(results) && results.length) {
          const created = results
            .filter((r: any) => r)
            .map((r: any) => ({
              id: r.id,
              vehicule_id: r.vehicule_id,
              ...r
            }));
          this.charges = [...created, ...(this.charges || [])];
        }

        this.getVehiculeCharges(String(this.vehicule_id));
        this.savingNewCharges = false;
      },
      error: (err) => {
        const msg = err?.error?.message || err?.message || 'Erreur lors de l’enregistrement des charges';
        this.showError(msg);
        this.savingNewCharges = false;
      }
    });
  }

  onDeleteExistingCharge(charge: any): void {
    if (!charge?.id) return;

    Swal.fire({
      title: 'Supprimer ?',
      text: 'Voulez-vous supprimer cette charge ?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (!result.isConfirmed) return;

      this.baseService.deleteVehiculeCharge(charge.id).subscribe({
        next: (res) => {
          this.showSuccess('Charge supprimée avec succès.');
          this.getVehiculeCharges(String(this.vehicule_id));
        },
        error: (err) => {
          this.showError('Erreur lors de la suppression de la charge');
        }
      });
    });
  }

  // ✅ Alertes
  showSuccess(message: string) {
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: message,
      confirmButtonText: 'OK',
      customClass: {
        confirmButton: 'btn btn-success'
      },
      buttonsStyling: false
    });
  }

  showError(message: string) {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message,
      confirmButtonText: 'Fermer',
      customClass: {
        confirmButton: 'btn btn-danger'
      },
      buttonsStyling: false
    });
  }

}

