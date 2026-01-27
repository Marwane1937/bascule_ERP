import { Component, OnInit, AfterViewInit } from '@angular/core';
import { BaseService } from 'src/app/service/base.service';
import * as $ from 'jquery';
import 'datatables.net';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

declare var bootstrap: any;

@Component({
  selector: 'app-vehicule',
  templateUrl: './vehicule.component.html',
  styleUrls: ['./vehicule.component.css']
})
export class VehiculeComponent implements OnInit, AfterViewInit {
  vehicules: any[] = [];
  dataTable: any;
  loading: boolean = true; // ← par défaut on affiche le spinner
  saving: boolean = false;
  readonly urgentThresholdDays = 10;

  newVehicule: any = {
    numero: '',
    matricule: '',
    chassis: null,
    marque: '',
    modele: '',
    puissance: null,
    carburant: null,
    tonnage: null,
    tare: null,
    volume: null,
    circulation_date: null,
    acquisition_type: null,
    description: null,
    part_id: null,
    type: null,
    etat: 1,
    user_id: null,
    cr_date: null
  };

  constructor(private baseService: BaseService, private router: Router) {}

  ngOnInit(): void {
    this.getVehicules();
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici, on initialise dans getVehicules après chargement
  }

  private initDataTable(): void {
    setTimeout(() => {
      if (this.dataTable) {
        this.dataTable.destroy();
      }

      this.dataTable = $('#vehiculeTable').DataTable({
        pageLength: 10,
        ordering: true,
        order: [[0, 'desc']], // Trier par la première colonne en DESC par défaut
        searching: true,
        lengthChange: true
      });
    }, 0);
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private remainingDays(dateFin: any): number | null {
    const d = this.toDate(dateFin);
    if (!d) return null;
    const today = new Date();
    const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }

  private buildUrgentTooltip(urgentCharges: any[]): string {
    return (urgentCharges || [])
      .map((c: any) => {
        const reste = this.remainingDays(c?.date_fin);
        const typeLabel = c?.type_nom || c?.type || '-';
        const libelle = c?.libelle || '-';
        const dateFin = c?.date_fin ? new Date(c.date_fin).toLocaleDateString() : '-';
        return `${typeLabel} | ${libelle} | Fin: ${dateFin} | Reste: ${reste ?? '-'} jours`;
      })
      .join('\n');
  }

  getVehicules(): void {
    this.loading = true;

    this.baseService.getVehiculesWithUrgentCharges(this.urgentThresholdDays).subscribe({
      next: (response: any) => {
        const vehicules = response?.data || (Array.isArray(response) ? response : []);
        const normalized = (Array.isArray(vehicules) ? vehicules : []).map((v: any) => {
          const urgentCharges = Array.isArray(v?.urgentCharges) ? v.urgentCharges : [];
          return {
            ...v,
            _urgentCharges: urgentCharges,
            _hasUrgent: urgentCharges.length > 0,
            _urgentTooltip: this.buildUrgentTooltip(urgentCharges)
          };
        });

        this.vehicules = normalized;
        this.initDataTable();
        this.loading = false;
      },
      error: (err) => {
        this.vehicules = [];
        this.initDataTable();
        this.loading = false;
      }
    });
  }

  resetNewVehicule(): void {
    this.newVehicule = {
      numero: '',
      matricule: '',
      chassis: null,
      marque: '',
      modele: '',
      puissance: null,
      carburant: null,
      tonnage: null,
      tare: null,
      volume: null,
      circulation_date: null,
      acquisition_type: null,
      description: null,
      part_id: null,
      type: null,
      etat: 1,
      user_id: null,
      cr_date: null
    };
  }

  private normalizeVehiculePayload(v: any): any {
    // Forcer null plutôt que '' sur les champs optionnels, et garder les chaînes propres
    const clean = (val: any) => (typeof val === 'string' ? val.trim() : val);
    const emptyToNull = (val: any) => (val === '' ? null : val);

    return {
      numero: clean(v.numero),
      matricule: clean(v.matricule),
      chassis: emptyToNull(clean(v.chassis)),
      marque: clean(v.marque),
      modele: clean(v.modele),
      puissance: emptyToNull(v.puissance),
      carburant: emptyToNull(clean(v.carburant)),
      tonnage: emptyToNull(v.tonnage),
      tare: emptyToNull(v.tare),
      volume: emptyToNull(v.volume),
      // input type="date" -> string 'YYYY-MM-DD' (ok pour backend SQL)
      circulation_date: emptyToNull(v.circulation_date),
      acquisition_type: emptyToNull(clean(v.acquisition_type)),
      description: emptyToNull(clean(v.description)),
      part_id: emptyToNull(v.part_id),
      type: emptyToNull(clean(v.type)),
      etat: v.etat ?? 1,
      user_id: emptyToNull(v.user_id),
      cr_date: emptyToNull(v.cr_date)
    };
  }

  onSaveVehicule(): void {
    if (!this.newVehicule.numero?.trim() || !this.newVehicule.matricule?.trim()) {
      Swal.fire('Champs requis', 'Veuillez renseigner au minimum Numéro et Matricule.', 'warning');
      return;
    }

    const payload = this.normalizeVehiculePayload(this.newVehicule);

    this.saving = true;
    this.baseService.addVehicule(payload).subscribe({
      next: (res: any) => {
        // Fermer la modale
        const modalElement = document.getElementById('addVehiculeModal');
        if (modalElement) {
          try {
            const modal = bootstrap?.Modal?.getInstance(modalElement);
            if (modal) {
              modal.hide();
            } else {
              const newModal = new bootstrap.Modal(modalElement);
              newModal.hide();
            }
          } catch (e) {
          }
        }

        Swal.fire({
          icon: 'success',
          title: 'Ajouté !',
          text: 'Le véhicule a été enregistré avec succès.',
          showConfirmButton: false,
          timer: 1500
        });

        this.resetNewVehicule();
        this.getVehicules();
        this.saving = false;
      },
      error: (err) => {
        const msg = err?.error?.message || err?.message || 'Erreur lors de l’enregistrement du véhicule';
        Swal.fire('Erreur', msg, 'error');
        this.saving = false;
      }
    });
  }

  OnEdit(vehicule_id: any) {
    this.router.navigate(['/Edit-Vehicule/' + vehicule_id]);
  }
}

