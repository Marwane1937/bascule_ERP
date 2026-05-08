import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CaisseService } from 'src/app/service/caisse.service';
import { BaseService } from 'src/app/service/base.service';
import { CaisseModeService } from 'src/app/service/caisse-mode.service';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-caisse',
  templateUrl: './caisse.component.html',
  styleUrls: ['./caisse.component.css']
})
export class CaisseComponent implements OnInit, OnDestroy {
  activeTab: 'all' | 'recettes' | 'depenses' = 'all';
  solde: any = {
    total_fond: 0,
    total_entrees: 0,
    total_sorties: 0,
    solde: 0
  };
  selectedDate: string = new Date().toISOString().split('T')[0];
  loadingSolde: boolean = false;

  // Par défaut, afficher uniquement les caisses non clôturées du jour
  // Quand l'utilisateur sélectionne une date, afficher toutes les caisses
  isInitialLoad: boolean = true;

  // Type de caisse: 'declared' = caisse déclarée, 'black' = caisse black
  caisseType: 'declared' | 'black' = 'declared';
  private caisseModeSubscription?: Subscription;

  // Pour les rapports
  reportDateFrom: string = new Date().toISOString().split('T')[0];
  reportDateTo: string = new Date().toISOString().split('T')[0];
  generatingReport: boolean = false;

  // Pour le rapport par employé
  reportEmployeDateFrom: string = new Date().toISOString().split('T')[0];
  reportEmployeDateTo: string = new Date().toISOString().split('T')[0];
  selectedEmployeId: number | null = null;
  employes: any[] = [];
  loadingEmployes: boolean = false;
  generatingReportByEmploye: boolean = false;

  // Pour le rapport rubriques 2000/3000
  reportGroupDateFrom: string = new Date().toISOString().split('T')[0];
  reportGroupDateTo: string = new Date().toISOString().split('T')[0];
  generatingReportGroup: boolean = false;
  rubriques: any[] = [];
  selectedRubriques: any[] = [];
  loadingRubriques: boolean = false;

  constructor(
    private caisseService: CaisseService,
    private baseService: BaseService,
    private router: Router,
    private caisseModeService: CaisseModeService
  ) { }

  ngOnInit(): void {
    // S'abonner au service pour recevoir les changements de mode
    this.caisseModeSubscription = this.caisseModeService.caisseMode$.subscribe(mode => {
      this.caisseType = mode === 'black' ? 'black' : 'declared';
      this.loadSolde();
    });
    
    // Initialiser avec le mode actuel
    this.caisseType = this.caisseModeService.getCurrentMode() === 'black' ? 'black' : 'declared';
    
    this.loadSolde();
    this.loadEmployes();
    this.loadRubriques();
  }

  ngOnDestroy(): void {
    if (this.caisseModeSubscription) {
      this.caisseModeSubscription.unsubscribe();
    }
  }

  loadRubriques(): void {
    this.loadingRubriques = true;
    // Charger les rubriques Recettes (2000) et Dépenses (3000)
    // On combine les deux appels
    const p1 = this.baseService.getListesByGroupId(2000).toPromise();
    const p2 = this.baseService.getListesByGroupId(3000).toPromise();

    Promise.all([p1, p2]).then(([res1, res2]) => {
      let combined: any[] = [];
      if (res1 && res1.data) combined = [...combined, ...res1.data];
      else if (Array.isArray(res1)) combined = [...combined, ...res1];

      if (res2 && res2.data) combined = [...combined, ...res2.data];
      else if (Array.isArray(res2)) combined = [...combined, ...res2];

      // Trier par nom
      this.rubriques = combined.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
      this.loadingRubriques = false;
    }).catch(err => {
      this.loadingRubriques = false;
    });
  }

  loadEmployes(): void {
    this.loadingEmployes = true;
    this.baseService.getEmployesActifs().subscribe({
      next: (response) => {
        if (response && response.success && response.data) {
          this.employes = response.data;
        } else if (Array.isArray(response)) {
          this.employes = response;
        }
        this.loadingEmployes = false;
      },
      error: (error) => {
        this.employes = [];
        this.loadingEmployes = false;
      }
    });
  }

  loadSolde(): void {
    // Par défaut (chargement initial), afficher uniquement les caisses non clôturées du jour
    // Quand l'utilisateur sélectionne une date, afficher toutes les caisses
    const onlyNonCloturees = this.isInitialLoad;
    this.loadingSolde = true;
    const params: any = { date: this.selectedDate };
    if (this.caisseType) {
      params.type = this.caisseType;
    }
    this.caisseService.getSoldeCaisse(this.selectedDate, this.caisseType, onlyNonCloturees).subscribe({
      next: (response) => {
        if (response && response.success) {
          this.solde = response.data || {
            total_fond: 0,
            total_entrees: 0,
            total_sorties: 0,
            solde: 0
          };
        } else {
          this.solde = {
            total_fond: 0,
            total_entrees: 0,
            total_sorties: 0,
            solde: 0
          };
        }
        this.loadingSolde = false;
      },
      error: (error) => {
        this.solde = {
          total_fond: 0,
          total_entrees: 0,
          total_sorties: 0,
          solde: 0
        };
        this.loadingSolde = false;
        // Optionnel: afficher une notification à l'utilisateur
        // Swal.fire('Erreur', 'Impossible de charger le solde de la caisse', 'error');
      }
    });
  }

  onDateChange(): void {
    // L'utilisateur a sélectionné une date manuellement, afficher toutes les caisses (y compris clôturées)
    this.isInitialLoad = false;
    this.loadSolde();
  }

  // Méthode supprimée - le mode est maintenant géré par le service via le footer

  navigateToRecetteDepense(): void {
    this.router.navigate(['/Caisse-Recette-Depense']);
  }

  navigateToRecettes(): void {
    this.navigateToRecetteDepense();
  }

  navigateToDepenses(): void {
    this.navigateToRecetteDepense();
  }

  // Vérifier si le solde est négatif
  isSoldeNegatif(): boolean {
    return this.solde && this.solde.solde < 0;
  }

  // Obtenir la classe CSS pour le solde
  getSoldeClass(): string {
    if (this.isSoldeNegatif()) {
      return 'bg-danger text-white';
    }
    return 'bg-info text-white';
  }

  // Générer un rapport PDF
  generateRapport(): void {
    if (!this.reportDateFrom || !this.reportDateTo) {
      Swal.fire('Erreur', 'Veuillez sélectionner les dates de début et de fin', 'error');
      return;
    }

    if (new Date(this.reportDateFrom) > new Date(this.reportDateTo)) {
      Swal.fire('Erreur', 'La date de début doit être antérieure à la date de fin', 'error');
      return;
    }

    this.generatingReport = true;

    Swal.fire({
      title: 'Génération du rapport...',
      text: 'Veuillez patienter',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.caisseService.generateRapportPDF(this.reportDateFrom, this.reportDateTo, this.caisseType).subscribe({
      next: (response: any) => {
        this.generatingReport = false;
        if (response && response.success && response.pdfUrl) {
          Swal.fire({
            title: 'Rapport généré avec succès',
            text: 'Le PDF va s\'ouvrir dans un nouvel onglet',
            icon: 'success',
            confirmButtonText: 'OK'
          });
          window.open(response.pdfUrl, '_blank');
        } else {
          Swal.fire('Erreur', 'Erreur lors de la génération du rapport', 'error');
        }
      },
      error: (error) => {
        this.generatingReport = false;

        let errorMessage = 'Erreur lors de la génération du rapport';
        if (error.error) {
          if (error.error.message) {
            errorMessage = error.error.message;
          } else if (typeof error.error === 'string') {
            errorMessage = error.error;
          }
        } else if (error.message) {
          errorMessage = error.message;
        }

        Swal.fire({
          title: 'Erreur',
          text: errorMessage,
          icon: 'error',
          footer: error.status ? `Code d'erreur: ${error.status}` : ''
        });
      }
    });
  }

  // Générer un rapport PDF filtré par employé
  generateRapportByEmploye(): void {
    if (!this.reportEmployeDateFrom || !this.reportEmployeDateTo) {
      Swal.fire('Erreur', 'Veuillez sélectionner les dates de début et de fin', 'error');
      return;
    }

    if (!this.selectedEmployeId) {
      Swal.fire('Erreur', 'Veuillez sélectionner un employé', 'error');
      return;
    }

    if (new Date(this.reportEmployeDateFrom) > new Date(this.reportEmployeDateTo)) {
      Swal.fire('Erreur', 'La date de début doit être antérieure à la date de fin', 'error');
      return;
    }

    this.generatingReportByEmploye = true;

    Swal.fire({
      title: 'Génération du rapport...',
      text: 'Veuillez patienter',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.caisseService.generateRapportPDFByEmploye(
      this.reportEmployeDateFrom,
      this.reportEmployeDateTo,
      this.selectedEmployeId,
      this.caisseType
    ).subscribe({
      next: (response: any) => {
        this.generatingReportByEmploye = false;
        if (response && response.success && response.pdfUrl) {
          Swal.fire({
            title: 'Rapport généré avec succès',
            text: 'Le PDF va s\'ouvrir dans un nouvel onglet',
            icon: 'success',
            confirmButtonText: 'OK'
          });
          window.open(response.pdfUrl, '_blank');
        } else {
          Swal.fire('Erreur', 'Erreur lors de la génération du rapport', 'error');
        }
      },
      error: (error) => {
        this.generatingReportByEmploye = false;

        let errorMessage = 'Erreur lors de la génération du rapport';
        if (error.error) {
          if (error.error.message) {
            errorMessage = error.error.message;
          } else if (typeof error.error === 'string') {
            errorMessage = error.error;
          }
        } else if (error.message) {
          errorMessage = error.message;
        }

        Swal.fire({
          title: 'Erreur',
          text: errorMessage,
          icon: 'error',
          footer: error.status ? `Code d'erreur: ${error.status}` : ''
        });
      }
    });
  }

  // Méthodes pour la sélection des rubriques
  isSelected(id: number): boolean {
    return this.selectedRubriques.includes(id);
  }

  onRubriqueChange(id: number, event: any): void {
    if (event.target.checked) {
      if (!this.selectedRubriques.includes(id)) {
        this.selectedRubriques.push(id);
      }
    } else {
      this.selectedRubriques = this.selectedRubriques.filter(r => r !== id);
    }
  }

  toggleAllRubriques(event: any): void {
    if (event.target.checked) {
      this.selectedRubriques = this.rubriques.map(r => r.id);
    } else {
      this.selectedRubriques = [];
    }
  }

  // Générer un rapport PDF pour les rubriques 2000/3000
  generateRapportGroup2000_3000(): void {
    if (!this.reportGroupDateFrom || !this.reportGroupDateTo) {
      Swal.fire('Erreur', 'Veuillez sélectionner les dates de début et de fin', 'error');
      return;
    }

    if (new Date(this.reportGroupDateFrom) > new Date(this.reportGroupDateTo)) {
      Swal.fire('Erreur', 'La date de début doit être antérieure à la date de fin', 'error');
      return;
    }

    this.generatingReportGroup = true;

    Swal.fire({
      title: 'Génération du rapport...',
      text: 'Veuillez patienter',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.caisseService.generateRapportGroup2000_3000(
      this.reportGroupDateFrom,
      this.reportGroupDateTo,
      this.caisseType,
      this.selectedRubriques
    ).subscribe({
      next: (response: any) => {
        this.generatingReportGroup = false;
        if (response && response.success && response.pdfUrl) {
          Swal.fire({
            title: 'Rapport généré avec succès',
            text: 'Le PDF va s\'ouvrir dans un nouvel onglet',
            icon: 'success',
            confirmButtonText: 'OK'
          });
          window.open(response.pdfUrl, '_blank');
        } else {
          Swal.fire('Erreur', 'Erreur lors de la génération du rapport', 'error');
        }
      },
      error: (error) => {
        this.generatingReportGroup = false;

        let errorMessage = 'Erreur lors de la génération du rapport';
        if (error.error) {
          if (error.error.message) {
            errorMessage = error.error.message;
          } else if (typeof error.error === 'string') {
            errorMessage = error.error;
          }
        } else if (error.message) {
          errorMessage = error.message;
        }

        Swal.fire({
          title: 'Erreur',
          text: errorMessage,
          icon: 'error',
          footer: error.status ? `Code d'erreur: ${error.status}` : ''
        });
      }
    });
  }
}
