import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { InterventionService, Intervention, Client, Employe } from '../service/intervention.service';
import Swal from 'sweetalert2';
declare var bootstrap: any;

@Component({
  selector: 'app-intervention-list',
  templateUrl: './intervention-list.component.html',
  styleUrls: ['./intervention-list.component.css']
})
export class InterventionListComponent implements OnInit {
  interventions: Intervention[] = [];
  loading: boolean = true;
  searchTerm: string = '';
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;
  sortColumn: string = 'date_intervention';
  sortDirection: 'ASC' | 'DESC' = 'DESC';

  // Filtres
  selectedEtat: string = '';
  selectedTechnicien: string = '';
  selectedClient: string = '';
  dateFrom: string = '';
  dateTo: string = '';

  // Modal d'édition
  editForm!: FormGroup;
  currentIntervention: Intervention | null = null;
  clients: Client[] = [];
  employes: Employe[] = [];
  filteredClients: Client[] = [];
  filteredEmployes: Employe[] = [];
  loadingEditData: boolean = false;

  constructor(
    private interventionService: InterventionService,
    private fb: FormBuilder
  ) { }

  ngOnInit(): void {
    this.initEditForm();
    this.loadClientsAndEmployes();
    this.getInterventions();
  }

  initEditForm(): void {
    this.editForm = this.fb.group({
      date: ['', Validators.required],
      clientSearch: [''],
      clientId: [null, Validators.required],
      technicienSearch: [''],
      technicienId: [null, Validators.required],
      description: ['']
    });
  }

  loadClientsAndEmployes(): void {
    this.interventionService.getClients().subscribe({
      next: (clients) => {
        this.clients = clients || [];
        this.filteredClients = [...this.clients];
      },
      error: (error) => {
        console.error('Erreur chargement clients:', error);
      }
    });

    this.interventionService.getEmployes().subscribe({
      next: (employes) => {
        this.employes = employes || [];
        this.filteredEmployes = [...this.employes];
      },
      error: (error) => {
        console.error('Erreur chargement employés:', error);
      }
    });
  }

  onClientSearch(event: any): void {
    const searchTerm = event.target.value.toLowerCase();
    this.filteredClients = this.clients.filter(client =>
      client.nom.toLowerCase().includes(searchTerm)
    );
  }

  onEmployeSearch(event: any): void {
    const searchTerm = event.target.value.toLowerCase();
    this.filteredEmployes = this.employes.filter(employe =>
      employe.nom.toLowerCase().includes(searchTerm)
    );
  }

  selectClient(client: Client): void {
    this.editForm.patchValue({
      clientSearch: client.nom,
      clientId: client.part_id
    });
    this.filteredClients = [];
  }

  selectEmploye(employe: Employe): void {
    this.editForm.patchValue({
      technicienSearch: employe.nom,
      technicienId: employe.id
    });
    this.filteredEmployes = [];
  }

  getInterventions(): void {
    this.loading = true;

    const options: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm
    };

    // Ajouter les filtres
    if (this.selectedEtat) options.etat = this.selectedEtat;
    if (this.selectedTechnicien) options.employe_id = this.selectedTechnicien;
    if (this.selectedClient) options.part_id = this.selectedClient;
    if (this.dateFrom) options.dateFrom = this.dateFrom;
    if (this.dateTo) options.dateTo = this.dateTo;

    this.interventionService.getInterventions(options).subscribe({
      next: (response: any) => {
        this.interventions = response.data || [];
        this.totalRecords = response.pagination?.total || 0;
        this.totalPages = response.pagination?.totalPages || 0;
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur chargement interventions:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement des interventions', 'error');
        this.loading = false;
      }
    });
  }

  onSearch(): void {
    this.currentPage = 1;
    this.getInterventions();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.getInterventions();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.getInterventions();
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.currentPage = 1;
    this.getInterventions();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  getDisplayRange(): string {
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} - ${end}`;
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0) + ' dh';
  }

  formatDate(date: string): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR');
  }

  getStatutBadge(statut: string): { label: string; class: string } {
    return this.interventionService.formatStatut(statut);
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedEtat = '';
    this.selectedTechnicien = '';
    this.selectedClient = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.currentPage = 1;
    this.getInterventions();
  }

  viewIntervention(intervention: Intervention): void {
    if (!intervention.id) {
      Swal.fire('Erreur', 'Impossible d\'afficher le PDF de cette intervention', 'error');
      return;
    }
    // Ouvrir le PDF dans une nouvelle fenêtre
    this.printIntervention(intervention);
  }

  editIntervention(intervention: Intervention): void {
    if (!intervention.id) {
      Swal.fire('Erreur', 'Impossible de modifier cette intervention', 'error');
      return;
    }

    this.currentIntervention = intervention;
    this.loadingEditData = true;

    // Charger les détails complets de l'intervention
    this.interventionService.getIntervention(intervention.id).subscribe({
      next: (data) => {
        this.loadingEditData = false;
        
        // Remplir le formulaire avec les données
        const interventionData = data as any;
        const clientName = intervention.client || intervention.client_nom || '';
        const technicienName = intervention.technicien || intervention.technicien_nom || '';
        
        this.editForm.patchValue({
          date: interventionData.date ? new Date(interventionData.date).toISOString().split('T')[0] : '',
          clientSearch: clientName,
          clientId: interventionData.part_id || null,
          technicienSearch: technicienName,
          technicienId: interventionData.employe_id || null,
          description: interventionData.description || ''
        });

        // Ouvrir le modal
        const modalElement = document.getElementById('editInterventionModal');
        if (modalElement) {
          const modal = new bootstrap.Modal(modalElement);
          modal.show();
        }
      },
      error: (error) => {
        this.loadingEditData = false;
        console.error('Erreur chargement intervention:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement des données de l\'intervention', 'error');
      }
    });
  }

  saveIntervention(): void {
    if (this.editForm.invalid || !this.currentIntervention?.id) {
      this.editForm.markAllAsTouched();
      Swal.fire('Attention', 'Veuillez remplir tous les champs requis', 'warning');
      return;
    }

    const formData = {
      date: this.editForm.value.date,
      part_id: this.editForm.value.clientId,
      employe_id: this.editForm.value.technicienId,
      description: this.editForm.value.description || ''
    };

    Swal.fire({
      title: 'Enregistrement...',
      text: 'Modification en cours',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.interventionService.updateIntervention(this.currentIntervention.id, formData).subscribe({
      next: () => {
        Swal.fire('Succès', 'Intervention modifiée avec succès', 'success');
        this.closeEditModal();
        this.getInterventions();
      },
      error: (error) => {
        console.error('Erreur modification:', error);
        Swal.fire('Erreur', 'Erreur lors de la modification de l\'intervention', 'error');
      }
    });
  }

  closeEditModal(): void {
    const modalElement = document.getElementById('editInterventionModal');
    if (modalElement) {
      const modal = bootstrap.Modal.getInstance(modalElement);
      if (modal) {
        modal.hide();
      }
    }
    this.editForm.reset();
    this.currentIntervention = null;
    this.filteredClients = [...this.clients];
    this.filteredEmployes = [...this.employes];
  }

  printIntervention(intervention: Intervention): void {
    if (!intervention.id) {
      Swal.fire('Erreur', 'Impossible d\'imprimer cette intervention', 'error');
      return;
    }
    
    const backendUrl = 'http://localhost:3500';
    const printUrl = `${backendUrl}/api/interventions/${intervention.id}/print`;
    
    const newWindow = window.open(printUrl, '_blank', 'noopener,noreferrer');
    
    if (!newWindow) {
      Swal.fire({
        title: 'Erreur d\'ouverture du PDF',
        text: 'Le navigateur a bloqué l\'ouverture de la fenêtre du PDF. Veuillez autoriser les pop-ups pour ce site.',
        icon: 'warning',
        confirmButtonText: 'OK'
      });
    } else {
      newWindow.focus();
    }
  }

  deleteIntervention(intervention: Intervention): void {
    if (!intervention.id) return;

    Swal.fire({
      title: 'Confirmation',
      text: `Êtes-vous sûr de vouloir supprimer l'intervention ${intervention.numero} ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.interventionService.deleteIntervention(intervention.id!).subscribe({
          next: () => {
            Swal.fire('Succès', 'Intervention supprimée avec succès', 'success');
            this.getInterventions();
          },
          error: (error) => {
            console.error('Erreur suppression:', error);
            Swal.fire('Erreur', 'Erreur lors de la suppression', 'error');
          }
        });
      }
    });
  }
}
