import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AchatsService } from 'src/app/service/achats.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-reception',
  templateUrl: './reception.component.html',
  styleUrls: ['./reception.component.css']
})
export class ReceptionComponent implements OnInit {
  // Liste réceptions (stock.type = 1)
  receptions: any[] = [];
  loadingReceptions = true;

  // Pagination / recherche
  currentPage = 1;
  pageSize = 25;
  totalRecords = 0;
  totalPages = 1;
  searchTerm = '';
  sortColumn = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';

  loadingCommandes = false;
  showTransfertModal = false;

  commandesNonReceptionnees: any[] = [];
  commandesNonReceptionneesFiltered: any[] = [];
  modalSearchTerm = '';
  modalCurrentPage = 1;
  modalPageSize = 10;
  modalTotalPages = 1;
  commandesNonReceptionneesPaged: any[] = [];

  // Edition commande dans le popup
  selectedCommande: any | null = null;
  commandeDetails: any[] = [];
  loadingDetails = false;

  constructor(
    private achatsService: AchatsService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadReceptions(1, '');
  }

  loadReceptions(page: number = 1, search: string = ''): void {
    this.loadingReceptions = true;
    this.currentPage = page;
    this.searchTerm = search;

    this.achatsService.getReceptions({
      page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search
    }).subscribe({
      next: (response: any) => {
        const data = response?.data || [];
        const pagination = response?.pagination || {};
        this.receptions = Array.isArray(data) ? data : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        this.loadingReceptions = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingReceptions = false;
        this.receptions = [];
        this.totalRecords = 0;
        this.totalPages = 1;
        this.cdr.detectChanges();
        Swal.fire('Erreur', err.error?.message || 'Erreur lors du chargement des réceptions.', 'error');
      }
    });
  }

  onSearch(): void {
    this.loadReceptions(1, this.searchTerm);
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadReceptions(page, this.searchTerm);
    }
  }

  onPageSizeChange(event: any): void {
    const newSize = parseInt(event?.target?.value, 10);
    if (newSize > 0) {
      this.pageSize = newSize;
      this.loadReceptions(1, this.searchTerm);
    }
  }

  openTransfertModal(): void {
    this.showTransfertModal = true;
    this.modalSearchTerm = '';
    this.modalCurrentPage = 1;
    this.selectedCommande = null;
    this.commandeDetails = [];
    this.loadCommandesNonReceptionnees();
  }

  closeTransfertModal(): void {
    this.showTransfertModal = false;
    this.commandesNonReceptionnees = [];
    this.commandesNonReceptionneesFiltered = [];
    this.commandesNonReceptionneesPaged = [];
    this.modalCurrentPage = 1;
    this.modalTotalPages = 1;
    this.selectedCommande = null;
    this.commandeDetails = [];
    this.cdr.detectChanges();
  }

  loadCommandesNonReceptionnees(): void {
    this.loadingCommandes = true;
    this.achatsService.getCommandesNonReceptionnees().subscribe({
      next: (response: any) => {
        const data = response?.data || [];
        this.commandesNonReceptionnees = Array.isArray(data) ? data : [];
        this.modalCurrentPage = 1;
        this.applyModalFilter();
        this.loadingCommandes = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingCommandes = false;
        this.commandesNonReceptionnees = [];
        this.commandesNonReceptionneesFiltered = [];
        Swal.fire('Erreur', err.error?.message || 'Erreur lors du chargement des commandes.', 'error');
        this.cdr.detectChanges();
      }
    });
  }

  applyModalFilter(): void {
    const term = (this.modalSearchTerm || '').trim().toLowerCase();
    if (!term) {
      this.commandesNonReceptionneesFiltered = [...this.commandesNonReceptionnees];
      this.applyModalPagination();
      return;
    }
    this.commandesNonReceptionneesFiltered = this.commandesNonReceptionnees.filter((c: any) => {
      const numero = String(c.numero || '').toLowerCase();
      const fournisseur = String(c.fournisseur || '').toLowerCase();
      return numero.includes(term) || fournisseur.includes(term);
    });
    this.applyModalPagination();
  }

  applyModalPagination(): void {
    const total = this.commandesNonReceptionneesFiltered.length || 0;
    this.modalTotalPages = Math.max(1, Math.ceil(total / this.modalPageSize));
    if (this.modalCurrentPage > this.modalTotalPages) {
      this.modalCurrentPage = this.modalTotalPages;
    }
    const start = (this.modalCurrentPage - 1) * this.modalPageSize;
    const end = start + this.modalPageSize;
    this.commandesNonReceptionneesPaged = this.commandesNonReceptionneesFiltered.slice(start, end);
  }

  // Pagination UI (comme Client)
  getModalPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.modalCurrentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.modalTotalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
  }

  getModalDisplayRange(): string {
    const total = this.commandesNonReceptionneesFiltered.length || 0;
    if (total === 0) return '0 à 0';
    const start = ((this.modalCurrentPage - 1) * this.modalPageSize) + 1;
    const end = Math.min(this.modalCurrentPage * this.modalPageSize, total);
    return `${start} à ${end}`;
  }

  onModalPageChange(page: number): void {
    if (page >= 1 && page <= this.modalTotalPages && page !== this.modalCurrentPage) {
      this.modalCurrentPage = page;
      this.applyModalPagination();
    }
  }

  onModalPageSizeChange(event: any): void {
    const newSize = parseInt(event?.target?.value, 10);
    if (newSize > 0) {
      this.modalPageSize = newSize;
      this.modalCurrentPage = 1;
      this.applyModalPagination();
    }
  }

  selectCommandeForEdit(commande: any): void {
    this.selectedCommande = commande;
    this.commandeDetails = [];
    this.loadingDetails = true;
    this.cdr.detectChanges();

    this.achatsService.getBonCommandeById(commande.document_id).subscribe({
      next: (response: any) => {
        const data = response?.data || response;
        const details = data?.details || [];
        this.commandeDetails = Array.isArray(details) ? details.map((d: any) => ({
          article_nom: d.article_nom || '',
          article_cod: d.article_cod || '',
          article_id: d.article_id,
          quantite: +d.quantite,
          prix: +d.prix,
          taux_tva: d.taux_tva != null ? +d.taux_tva : 0,
          // Désignation: bon-commande backend normalise `designation` (depuis quill ou description)
          // fallback sur description si nécessaire
          description: d.designation || d.description || '',
          remise: d.remise != null ? +d.remise : 0,
          remise_montant: d.remise_montant != null ? +d.remise_montant : 0
        })) : [];

        this.loadingDetails = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingDetails = false;
        this.commandeDetails = [];
        this.cdr.detectChanges();
        Swal.fire('Erreur', err.error?.message || 'Impossible de charger les détails de la commande.', 'error');
      }
    });
  }

  validateReceptionFromEditedCommande(): void {
    if (!this.selectedCommande) {
      Swal.fire('Info', 'Veuillez sélectionner une commande à réceptionner.', 'info');
      return;
    }
    if (!this.commandeDetails || this.commandeDetails.length === 0) {
      Swal.fire('Info', 'Aucune ligne à réceptionner.', 'info');
      return;
    }

    Swal.fire({
      title: 'Valider la réception ?',
      text: 'Les lignes modifiées seront utilisées pour créer la réception (sans modifier la commande).',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, valider',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (!result.isConfirmed) return;

      Swal.fire({
        title: 'Création en cours...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      this.achatsService.createReceptionFromCommande(this.selectedCommande.document_id, this.commandeDetails).subscribe({
        next: (response: any) => {
          Swal.fire({
            icon: 'success',
            title: 'Réception créée !',
            text: `Réception ${response?.data?.numero || ''} créée avec succès.`
          });
          this.loadReceptions(1, this.searchTerm);
          this.loadCommandesNonReceptionnees();
          this.selectedCommande = null;
          this.commandeDetails = [];
          this.cdr.detectChanges();
        },
        error: (err) => {
          Swal.fire('Erreur', err.error?.message || 'Impossible de créer la réception.', 'error');
        }
      });
    });
  }

  transfererCommandeVersReception(commandeId: number, numero?: string): void {
    Swal.fire({
      title: 'Créer une réception ?',
      text: `Cette commande sera transformée en réception (entrée stock).`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, créer la réception',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (!result.isConfirmed) return;

      Swal.fire({
        title: 'Création en cours...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      this.achatsService.createReceptionFromCommande(commandeId).subscribe({
        next: (response: any) => {
          Swal.fire({
            icon: 'success',
            title: 'Réception créée !',
            text: `Réception ${response?.data?.numero || ''} créée avec succès.`
          });
          this.loadCommandesNonReceptionnees();
          this.loadReceptions(1, this.searchTerm);
        },
        error: (err) => {
          Swal.fire('Erreur', err.error?.message || `Impossible de créer la réception pour ${numero || 'cette commande'}.`, 'error');
        }
      });
    });
  }

  editReception(documentId: number): void {
    this.router.navigate(['/Edit-Reception', documentId]);
  }

  deleteReception(documentId: number, numero: string): void {
    Swal.fire({
      title: 'Supprimer la réception ?',
      text: `Êtes-vous sûr de vouloir supprimer la réception ${numero} ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (!result.isConfirmed) return;

      Swal.fire({
        title: 'Suppression en cours...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      this.achatsService.deleteReception(documentId).subscribe({
        next: (response: any) => {
          Swal.fire({
            icon: 'success',
            title: 'Réception supprimée !',
            text: response?.message || 'La réception a été supprimée avec succès.'
          });
          this.loadReceptions(this.currentPage, this.searchTerm);
        },
        error: (err) => {
          Swal.fire('Erreur', err.error?.message || 'Impossible de supprimer la réception.', 'error');
        }
      });
    });
  }

  imprimerReceptionPDF(documentId: number): void {
    Swal.fire({
      title: 'Génération du PDF...',
      html: '<div class="spinner-border text-primary" role="status"></div><p>Veuillez patienter</p>',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading()
    });

    this.achatsService.generateReceptionPDF(documentId).subscribe({
      next: (res) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          window.open(url, '_blank');
        } else {
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
        }
      },
      error: (err) => {
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: err.error?.message || "Erreur lors de la génération du PDF."
        });
      }
    });
  }
}

