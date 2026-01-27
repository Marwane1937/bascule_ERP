import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl, FormArray } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { InterventionService, Client, Employe, Rubrique } from '../../service/intervention.service';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-intervention-form',
  templateUrl: './intervention-form.component.html',
  styleUrls: ['./intervention-form.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('in', style({ opacity: 1, height: '*' })),
      transition('void => *', [
        style({ opacity: 0, height: 0 }),
        animate('300ms ease-in')
      ]),
      transition('* => void', [
        animate('300ms ease-out', style({ opacity: 0, height: 0 }))
      ])
    ])
  ]
})
export class InterventionFormComponent implements OnInit {
  interventionForm!: FormGroup;
  clients: Client[] = [];
  employes: Employe[] = [];
  rubriques: Rubrique[] = [];
  loading = false;
  submitting = false;
  interventionCreated = false;
  createdInterventionId: number | null = null;

  // Filtres pour les autocompletes
  filteredClients: Client[] = [];
  filteredEmployes: Employe[] = [];

  constructor(
    private fb: FormBuilder,
    private interventionService: InterventionService,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadData();
  }

  initForm(): void {
    this.interventionForm = this.fb.group({
      date: [new Date().toISOString().split('T')[0], Validators.required],
      clientSearch: ['', Validators.required],
      clientId: [null, Validators.required],
      technicienSearch: ['', Validators.required],
      technicienId: [null, Validators.required],
      rubriques: this.fb.array([], Validators.required)
    });
  }

  loadData(): void {
    this.loading = true;
    
    forkJoin({
      clients: this.interventionService.getClients(),
      employes: this.interventionService.getEmployes(),
      rubriques: this.interventionService.getRubriques()
    }).subscribe({
      next: (data) => {
        this.clients = Array.isArray(data.clients) ? data.clients : [];
        this.employes = Array.isArray(data.employes) ? data.employes : [];
        this.rubriques = Array.isArray(data.rubriques) ? data.rubriques : [];
        this.filteredClients = [...this.clients];
        this.filteredEmployes = [...this.employes];

        // Vérifier si les clients sont bien chargés
        if (this.clients.length === 0) {
          console.warn('[InterventionForm] Aucun client chargé');
        } else {
          console.log(`[InterventionForm] ${this.clients.length} clients chargés`);
        }

        this.loading = false;
      },
      error: (error) => {
        console.error('[InterventionForm] Erreur lors du chargement des données:', error);
        console.error('[InterventionForm] Détails de l\'erreur:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          error: error.error
        });
        
        // Afficher un message d'erreur plus détaillé selon le type d'erreur
        let errorMessage = 'Erreur inconnue lors du chargement des données';
        if (error.status === 401) {
          errorMessage = 'Erreur d\'authentification. Veuillez vous reconnecter.';
        } else if (error.status === 403) {
          errorMessage = 'Accès interdit. Vous n\'avez pas les permissions nécessaires.';
        } else if (error.status === 500) {
          errorMessage = error.error?.message || 'Erreur serveur. Veuillez contacter l\'administrateur.';
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        Swal.fire({
          title: 'Erreur',
          text: errorMessage,
          icon: 'error',
          confirmButtonText: 'OK'
        });
        
        this.loading = false;
        // Initialiser avec des tableaux vides pour éviter les erreurs
        this.clients = [];
        this.employes = [];
        this.rubriques = [];
        this.filteredClients = [];
        this.filteredEmployes = [];
      }
    });
  }

  // Getters pour les FormArrays
  get rubriquesFormArray(): FormArray {
    return this.interventionForm.get('rubriques') as FormArray;
  }

  // Gestion des autocompletes
  onClientSearch(event: any): void {
    const searchTerm = (event.target.value || '').toLowerCase().trim();
    
    // Vérifier si les clients sont chargés
    if (this.clients.length === 0) {
      console.warn('[InterventionForm] Tentative de recherche alors qu\'aucun client n\'est chargé');
      this.filteredClients = [];
      return;
    }
    
    if (searchTerm === '') {
      // Si le champ est vide, afficher tous les clients
      this.filteredClients = [...this.clients];
    } else {
      // Filtrer les clients selon le terme de recherche
      this.filteredClients = this.clients.filter(client =>
        client.nom.toLowerCase().includes(searchTerm)
      );
    }
  }

  onClientFocus(): void {
    // Quand le champ reçoit le focus, afficher tous les clients si le champ est vide
    const currentValue = this.interventionForm.get('clientSearch')?.value || '';
    
    // Vérifier si les clients sont chargés
    if (this.clients.length === 0) {
      console.warn('[InterventionForm] Focus sur le champ client alors qu\'aucun client n\'est chargé');
      this.filteredClients = [];
      return;
    }
    
    if (!currentValue || currentValue.trim() === '') {
      this.filteredClients = [...this.clients];
    }
  }

  onEmployeSearch(event: any): void {
    const searchTerm = (event.target.value || '').toLowerCase().trim();
    if (searchTerm === '') {
      // Si le champ est vide, afficher tous les employés
      this.filteredEmployes = [...this.employes];
    } else {
      // Filtrer les employés selon le terme de recherche
      this.filteredEmployes = this.employes.filter(employe =>
        employe.nom.toLowerCase().includes(searchTerm)
      );
    }
  }

  onEmployeFocus(): void {
    // Quand le champ reçoit le focus, afficher tous les employés si le champ est vide
    const currentValue = this.interventionForm.get('technicienSearch')?.value || '';
    if (!currentValue || currentValue.trim() === '') {
      this.filteredEmployes = [...this.employes];
    }
  }

  selectClient(client: Client): void {
    this.interventionForm.patchValue({
      clientSearch: client.nom,
      clientId: client.part_id
    });
    this.filteredClients = []; // Fermer la liste après sélection
  }

  selectEmploye(employe: Employe): void {
    this.interventionForm.patchValue({
      technicienSearch: employe.nom,
      technicienId: employe.id
    });
    this.filteredEmployes = []; // Fermer la liste après sélection
  }

  // Gestion des rubriques
  toggleRubrique(rubrique: Rubrique): void {
    const index = this.rubriquesFormArray.controls.findIndex(control =>
      control.get('rubrique_id')?.value === rubrique.id
    );

    if (index > -1) {
      this.rubriquesFormArray.removeAt(index);
    } else {
      this.rubriquesFormArray.push(this.fb.group({
        rubrique_id: [rubrique.id],
        quantite: [1, [Validators.required, Validators.min(0.01)]],
        prix: [0, [Validators.required, Validators.min(0)]],
        description: ['']
      }));
    }
  }

  isRubriqueSelected(rubriqueId: number): boolean {
    return this.rubriquesFormArray.controls.some(control =>
      control.get('rubrique_id')?.value === rubriqueId
    );
  }

  getRubriqueFormGroup(rubriqueId: number): any {
    const index = this.rubriquesFormArray.controls.findIndex(control =>
      control.get('rubrique_id')?.value === rubriqueId
    );
    return index > -1 ? this.rubriquesFormArray.at(index) : null;
  }

  getSelectedRubriquesWithIndex(): { rubrique: Rubrique, formGroup: any, index: number }[] {
    return this.rubriques
      .map((rubrique, globalIndex) => ({
        rubrique,
        formGroup: this.getRubriqueFormGroup(rubrique.id),
        index: globalIndex
      }))
      .filter(item => item.formGroup !== null);
  }

  // Soumission du formulaire
  onSubmit(): void {
    if (this.interventionForm.valid) {
      // Filtrer seulement les rubriques sélectionnées (avec quantité > 0 et prix >= 0)
      const selectedRubriques = this.interventionForm.value.rubriques.filter((r: any) =>
        r.quantite > 0 && r.prix >= 0
      );

      if (selectedRubriques.length === 0) {
        Swal.fire('Attention', 'Veuillez sélectionner au moins une rubrique avec une quantité et un prix valides', 'warning');
        return;
      }

      this.submitting = true;

      const formData = {
        date: this.interventionForm.value.date,
        part_id: this.interventionForm.value.clientId,
        employe_id: this.interventionForm.value.technicienId,
        rubriques: selectedRubriques.map((r: any) => ({
          rubrique_id: r.rubrique_id,
          quantite: r.quantite,
          prix: r.prix,
          description: r.description || ''
        }))
      };

      this.interventionService.createInterventionWithDetails(formData).subscribe({
        next: (response) => {
          this.submitting = false;
          this.interventionCreated = true;
          this.createdInterventionId = response.id;

          // Afficher le message de succès
          Swal.fire({
            title: 'Succès',
            text: `Intervention créée avec succès! Génération du PDF en cours...`,
            icon: 'success',
            showConfirmButton: false,
            timer: 2000
          }).then(() => {
            // Lancer automatiquement l'impression du PDF
            this.printInterventionPDF();
            // Réinitialiser le formulaire après l'enregistrement
            this.resetForm();
          });
        },
        error: (error) => {
          this.submitting = false;
          Swal.fire('Erreur', 'Erreur lors de la création de l\'intervention', 'error');
        }
      });
    } else {
      // Marquer tous les champs comme touchés pour afficher les erreurs
      this.interventionForm.markAllAsTouched();
      Swal.fire('Attention', 'Veuillez remplir tous les champs requis', 'warning');
    }
  }

  // Getters pour les calculs dans le template
  get totalRubriquesSelectionnees(): number {
    return this.rubriquesFormArray.value.filter((r: any) => r.quantite > 0).length;
  }

  get totalGeneral(): number {
    return this.rubriquesFormArray.value.reduce((total: number, r: any) => total + ((r.quantite || 0) * (r.prix || 0)), 0);
  }

  getTotalLigne(rubriqueId: number): number {
    const formGroup = this.getRubriqueFormGroup(rubriqueId);
    if (!formGroup) return 0;

    const quantite = formGroup.get('quantite')?.value || 0;
    const prix = formGroup.get('prix')?.value || 0;
    return quantite * prix;
  }

  // Gestion des quantités avec boutons + et -
  incrementQuantite(rubriqueId: number): void {
    const formGroup = this.getRubriqueFormGroup(rubriqueId);
    if (!formGroup) return;

    const currentValue = formGroup.get('quantite')?.value || 0;
    const newValue = Math.max(0.01, currentValue + 1);
    formGroup.get('quantite')?.setValue(newValue);
  }

  decrementQuantite(rubriqueId: number): void {
    const formGroup = this.getRubriqueFormGroup(rubriqueId);
    if (!formGroup) return;

    const currentValue = formGroup.get('quantite')?.value || 0;
    const newValue = Math.max(0.01, currentValue - 1);
    formGroup.get('quantite')?.setValue(newValue);
  }

  get isFormInvalid(): boolean {
    return this.interventionForm.invalid;
  }

  get isRubriquesInvalid(): boolean {
    return this.rubriquesFormArray.invalid;
  }

  get isRubriquesTouched(): boolean {
    return this.rubriquesFormArray.touched;
  }

  get isSubmitting(): boolean {
    return this.submitting;
  }

  get isNotSubmitting(): boolean {
    return !this.submitting;
  }

  // Imprimer le PDF de fiche de déplacement
  printInterventionPDF(): void {
    if (this.createdInterventionId) {
      const backendUrl = 'http://localhost:3500';
      const printUrl = `${backendUrl}/api/interventions/${this.createdInterventionId}/print`;

      const newWindow = window.open(printUrl, '_blank', 'noopener,noreferrer');

      if (!newWindow) {
        Swal.fire({
          title: 'Erreur d\'ouverture du PDF',
          text: 'Le navigateur a bloqué l\'ouverture de la fenêtre du PDF. Veuillez autoriser les pop-ups pour ce site, ou le PDF sera téléchargé directement.',
          icon: 'warning',
          confirmButtonText: 'Télécharger le PDF'
        }).then((result) => {
          if (result.isConfirmed) {
            // Fallback au téléchargement si le popup est bloqué
            this.downloadInterventionPDF(printUrl);
          }
        });
      } else {
        newWindow.focus();
        Swal.fire({
          title: 'PDF affiché',
          text: 'Le PDF de la fiche de déplacement a été ouvert dans une nouvelle fenêtre.',
          icon: 'success',
          timer: 3000,
          showConfirmButton: false
        });
      }
    } else {
    }
  }

  // Nouvelle méthode pour télécharger le PDF comme fallback
  private downloadInterventionPDF(url: string): void {
    this.http.get(url, {
      responseType: 'blob',
      headers: {
        'Accept': 'application/pdf'
      }
    }).subscribe({
      next: (blob: Blob) => {
        if (blob.size === 0) {
          Swal.fire('Erreur', 'Le PDF généré est vide', 'error');
          return;
        }
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `fiche-deplacement-intervention-${this.createdInterventionId}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        Swal.fire('Téléchargement réussi', 'Le PDF a été téléchargé.', 'success');
      },
      error: (error) => {
        Swal.fire('Erreur', 'Impossible de télécharger le PDF.', 'error');
      }
    });
  }

  // Test de génération PDF (pour debug)
  testPDF(): void {

    const backendUrl = 'http://localhost:3500';
    const testUrl = `${backendUrl}/api/interventions/test/pdf`;

    this.http.get(testUrl, {
      responseType: 'blob',
      headers: {
        'Accept': 'application/pdf'
      }
    }).subscribe({
      next: (blob: Blob) => {

        if (blob.size === 0) {
          Swal.fire('Erreur', 'PDF de test vide', 'error');
          return;
        }

        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = 'test-intervention.pdf';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
        }, 100);

        Swal.fire('Test réussi', 'PDF de test téléchargé', 'success');
      },
      error: (error) => {
        Swal.fire('Erreur test', 'Impossible de générer le PDF de test', 'error');
      }
    });
  }

  // Réinitialiser le formulaire
  resetForm(): void {
    // Réinitialiser le formulaire avec les valeurs par défaut
    this.interventionForm.reset({
      date: new Date().toISOString().split('T')[0],
      clientSearch: '',
      clientId: null,
      technicienSearch: '',
      technicienId: null,
      rubriques: []
    });

    // Vider le FormArray des rubriques
    while (this.rubriquesFormArray.length !== 0) {
      this.rubriquesFormArray.removeAt(0);
    }

    // Réinitialiser les filtres d'autocomplétion
    this.filteredClients = [...this.clients];
    this.filteredEmployes = [...this.employes];

    // Réinitialiser les états
    this.interventionCreated = false;
    this.createdInterventionId = null;
    this.submitting = false;

    // Marquer le formulaire comme non touché pour réinitialiser les erreurs
    this.interventionForm.markAsUntouched();
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['/Interventions']);
  }
}
