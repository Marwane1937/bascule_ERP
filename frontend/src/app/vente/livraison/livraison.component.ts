import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import { EmailService } from 'src/app/service/email.service';
import Swal from 'sweetalert2';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';


@Component({
  selector: 'app-livraison',
  templateUrl: './livraison.component.html',
  styleUrls: ['./livraison.component.css']
})
export class LivraisonComponent implements OnInit, AfterViewInit, OnDestroy {
  livraisons: any[] = [];
  dataTableLivraison: any;
  loading: boolean = true;
  loadingLivraisons: boolean = false;
  loadingCommandes: boolean = false;
  loadingCommandesFacturation: boolean = false;
  dataTableCommandes: any;
  dataTableCommandesFacturation: any;
  searchTerm = '';
  searchTermLivraisons: string = '';
  clients: any[] = [];
  filteredClients: any[] = [];
  selectedClient: any = null;
  searchCommercial = '';
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  selectedCommercial: any = null;
  LivraisonForm!: FormGroup;
  successMessage: string | null = null;
  isError: boolean = false;
  nextLivraisonNumero: string = 'BL25-0001';
  
  // Commandes pour transfert vers livraison
  commandes: any[] = [];
  filteredCommandes: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  totalCommandes = 0;
  startIndex = 0;
  endIndex = 0;
  sortColumn: string = 'numero';
  sortDirection: 'asc' | 'desc' = 'desc';
  
  // Commandes pour transfert vers facturation
  commandesFacturation: any[] = [];
  filteredCommandesFacturation: any[] = [];
  currentPageFacturation = 1;
  pageSizeFacturation = 10;
  totalPagesFacturation = 1;
  totalCommandesFacturation = 0;
  startIndexFacturation = 0;
  endIndexFacturation = 0;
  sortColumnFacturation: string = 'numero';
  sortDirectionFacturation: 'asc' | 'desc' = 'desc';
  
  // Pagination pour les livraisons
  currentPageLivraisons: number = 1;
  pageSizeLivraisons: number = 25;
  totalRecordsLivraisons: number = 0;
  totalPagesLivraisons: number = 0;
  
  // Tri pour les livraisons
  sortColumnLivraisons: string = 'date';
  sortDirectionLivraisons: 'ASC' | 'DESC' = 'DESC';
  
  // Filtres avancés pour les livraisons
  showAdvancedFiltersLivraisons: boolean = false;
  filterDateFromLivraisons: string = '';
  filterDateToLivraisons: string = '';
  filterClientLivraisons: string = '';
  
  // Liste des clients pour le filtre
  clientsListLivraisons: string[] = [];
  
  private clientSearchSub?: Subscription;
  private commercialSearchSub?: Subscription;

  constructor(
    private ventesService: VentesService, 
    private router: Router,
    private baseService: BaseService, 
    private fb: FormBuilder, 
    private emailService: EmailService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.getLivraisons();
    this.getCommandesNonLivrees();
    this.AllClients();
    this.AllCommerciaux();
    this.initForm();
    this.resetFormState();
    this.loadNextLivraisonNumero();
  }

  initForm(): void {
    // Récupérer la date du jour au format YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    
    this.LivraisonForm = this.fb.group({
      date: [today], // Date du jour par défaut, automatiquement renseignée
      description: [''], // Non obligatoire
      part_id: [0, Validators.required], // Client obligatoire uniquement
      contact_id: [0], // Commercial non obligatoire
      date_fin: [''], // Non obligatoire
      etat: [3],
      clientSearch: [''],
      commercialSearch: ['']
    });

    this.setupFormListeners();
  }

  private setupFormListeners(): void {
    // Les listeners ne sont plus nécessaires car on utilise directement (input) dans le template
    // On garde cette méthode vide pour éviter les erreurs si elle est appelée ailleurs
  }

  private resetFormState(): void {
    if (!this.LivraisonForm) {
      return;
    }

    // Récupérer la date du jour au format YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    this.LivraisonForm.reset({
      date: today, // Date du jour par défaut
      description: '',
      part_id: 0,
      contact_id: 0,
      date_fin: '',
      etat: 3,
      clientSearch: '',
      commercialSearch: ''
    }, { emitEvent: false });

    this.filteredClients = [];
    this.filteredCommerciaux = [];
    this.searchTerm = '';
    this.searchCommercial = '';
  }

  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private normalizeValue(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return value
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private matchTerm(haystack: string, searchTerm: string): boolean {
    const normalizedHaystack = this.normalizeValue(haystack);
    const tokens = this.normalizeValue(searchTerm)
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) {
      return false;
    }

    return tokens.every(token => normalizedHaystack.includes(token));
  }

  ngAfterViewInit(): void {
    const anyWindow = window as any;
    // @ts-ignore
    if (typeof ($) !== 'undefined') {
      // @ts-ignore
      $('#modalCommandeLivraisonXL').on('shown.bs.modal', () => {
        this.getCommandesNonLivrees();
      });

      // @ts-ignore
      $('#modalCommandeFacturationXL').on('shown.bs.modal', () => {
        this.getCommandesNonLivrees();
      });

      // @ts-ignore
      $('#modalCommandeLivraisonXL').on('hidden.bs.modal', () => {
        if (this.dataTableCommandes) {
          // @ts-ignore
          this.dataTableCommandes.destroy();
          this.dataTableCommandes = null;
        }
      });

      // @ts-ignore
      $('#modalCommandeFacturationXL').on('hidden.bs.modal', () => {
        if (this.dataTableCommandesFacturation) {
          // @ts-ignore
          this.dataTableCommandesFacturation.destroy();
          this.dataTableCommandesFacturation = null;
        }
      });

      // @ts-ignore
      $('#addLivraisonModal').on('shown.bs.modal', () => {
        this.resetFormState();
        this.loadNextLivraisonNumero();
        // S'assurer que les clients et commerciaux sont chargés à chaque ouverture du modal
        this.AllClients();
        this.AllCommerciaux();
        // Réinitialiser les listes filtrées
        this.filteredClients = [];
        this.filteredCommerciaux = [];
        this.searchTerm = '';
        this.searchCommercial = '';
      });

      // @ts-ignore
      $('#addLivraisonModal').on('hidden.bs.modal', () => {
        this.resetFormState();
      });
    }
  }

  loadNextLivraisonNumero(): void {
    this.ventesService.getNextLivraisonNumero().subscribe({
      next: (response: any) => {
        if (response && response.numero) {
          this.nextLivraisonNumero = response.numero;
        }
      },
      error: (err) => {
        // Erreur silencieuse
      }
    });
  }

  loadLivraisons(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loadingLivraisons = true;
    this.currentPageLivraisons = page;
    this.searchTermLivraisons = search;
    
    if (resetFilters) {
      this.filterDateFromLivraisons = '';
      this.filterDateToLivraisons = '';
      this.filterClientLivraisons = '';
    }

    this.ventesService.getLivraisons({
      page: page,
      pageSize: this.pageSizeLivraisons,
      orderBy: this.sortColumnLivraisons,
      orderDirection: this.sortDirectionLivraisons,
      search: search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        // Les données sont déjà filtrées et paginées par le serveur
        this.livraisons = Array.isArray(result) ? result : [];
        this.totalRecordsLivraisons = pagination.total || 0;
        this.totalPagesLivraisons = pagination.totalPages || 1;
        
        // Extraire la liste des clients uniques pour le filtre (depuis la page actuelle uniquement)
        this.extractClientsListLivraisons(this.livraisons);
        
        this.loadingLivraisons = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.showError("❌ Une erreur s'est produite lors du chargement des livraisons.");
        this.loadingLivraisons = false;
        this.livraisons = [];
        this.cdr.detectChanges();
      }
    });
  }

  getLivraisons(): void {
    // Toujours utiliser loadLivraisons avec pagination dès le démarrage
    this.loadLivraisons(1, '', false);
  }

  private initializeDataTable(): void {
    try {
      // @ts-ignore
      if (typeof $ === 'undefined' || !$.fn.DataTable) {
        return;
      }
      
      // @ts-ignore
      const tableElement = $('#livraisonTable');
      if (tableElement.length === 0) {
        return;
      }
      
      // @ts-ignore
      if ($.fn.DataTable.isDataTable('#livraisonTable')) {
        // @ts-ignore
        $('#livraisonTable').DataTable().destroy();
      }
      
      // Initialiser DataTables simple (côté client)
      // @ts-ignore
      this.dataTableLivraison = $('#livraisonTable').DataTable({
        pageLength: 25,
        order: [[0, 'desc']],
        searching: true,
        lengthChange: true,
        deferRender: true,
        language: {
          emptyTable: 'Aucune donnée disponible dans le tableau',
          info: 'Affichage de _START_ à _END_ sur _TOTAL_ entrées',
          infoEmpty: 'Affichage de 0 à 0 sur 0 entrées',
          infoFiltered: '(filtré à partir de _MAX_ entrées au total)',
          lengthMenu: 'Afficher _MENU_ entrées',
          loadingRecords: 'Chargement...',
          processing: 'Traitement en cours...',
          search: 'Rechercher:',
          zeroRecords: 'Aucun enregistrement correspondant trouvé'
        }
      });
      
    } catch (error) {
      // Erreur silencieuse
    }
  }

  getCommandesNonLivrees(): void {
    this.loadingCommandes = true;
    this.loadingCommandesFacturation = true;
    this.ventesService.getCommandesNonLivrees().subscribe({
      next: (response: any) => {
        // Gérer le format de réponse (peut être { success: true, data: [...] } ou directement un tableau)
        let commandesData = response;
        if (response && response.data && Array.isArray(response.data)) {
          commandesData = response.data;
        } else if (response && response.success && Array.isArray(response.data)) {
          commandesData = response.data;
        } else if (!Array.isArray(response)) {
          commandesData = [];
        }
        
        this.commandes = commandesData.map((d: any) => ({ ...d, checked: false }));
        this.commandesFacturation = commandesData.map((d: any) => ({ ...d, checked: false }));
        
        this.loadingCommandes = false;
        this.loadingCommandesFacturation = false;
        this.cdr.detectChanges();
        
        // Initialiser DataTables après le chargement des données
        setTimeout(() => {
          this.initializeDataTableCommandes();
          this.initializeDataTableCommandesFacturation();
        }, 300);
      },
      error: (error) => {
        this.loadingCommandes = false;
        this.loadingCommandesFacturation = false;
        this.commandes = [];
        this.commandesFacturation = [];
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: 'Erreur lors du chargement des commandes: ' + (error.error?.message || error.message || 'Erreur inconnue')
        });
        this.cdr.detectChanges();
      }
    });
  }

  initializeDataTableCommandes(): void {
    try {
      // @ts-ignore
      if (typeof $ === 'undefined' || !$.fn.DataTable) {
        return;
      }
      
      // @ts-ignore
      const tableElement = $('#commandesTable-modal');
      if (tableElement.length === 0) {
        return;
      }
      
      // @ts-ignore
      if ($.fn.DataTable.isDataTable('#commandesTable-modal')) {
        // @ts-ignore
        $('#commandesTable-modal').DataTable().destroy();
      }
      
      // @ts-ignore
      this.dataTableCommandes = $('#commandesTable-modal').DataTable({
        pageLength: 10,
        order: [[1, 'desc']],
        searching: true,
        lengthChange: true,
        deferRender: true,
        // Ne pas utiliser data: pour laisser Angular gérer le rendu
        // DataTables gère juste la pagination, recherche et tri
        columnDefs: [
          { orderable: false, targets: [0, 6] }, // Désactiver le tri sur la colonne checkbox et Status
          { searchable: false, targets: [0, 6] } // Désactiver la recherche sur checkbox et Status
        ],
        // Écouter les changements de checkbox après le rendu DataTables
        drawCallback: () => {
          // Réattacher les événements aux checkboxes après chaque redraw
          // @ts-ignore
          $('#commandesTable-modal tbody input[type="checkbox"]').off('change').on('change', (e: any) => {
            const checkbox = e.target;
            const checkboxId = checkbox.id;
            if (checkboxId) {
              const documentId = parseInt(checkboxId.replace('checkbox-', ''));
              const commande = this.commandes.find(c => c.document_id === documentId);
              if (commande) {
                const checked = checkbox.checked;
                commande.checked = checked;
                this.commandes.find(c => c.document_id === documentId)!.checked = checked;
                this.cdr.detectChanges();
              }
            }
          });
        },
        language: {
          emptyTable: 'Aucune commande disponible',
          info: 'Affichage de _START_ à _END_ sur _TOTAL_ entrées',
          infoEmpty: 'Affichage de 0 à 0 sur 0 entrées',
          infoFiltered: '(filtré à partir de _MAX_ entrées au total)',
          lengthMenu: 'Afficher _MENU_ entrées',
          loadingRecords: 'Chargement...',
          processing: 'Traitement en cours...',
          search: 'Rechercher:',
          zeroRecords: 'Aucun enregistrement correspondant trouvé'
        }
      });
      
    } catch (error) {
      // Erreur silencieuse
    }
  }

  initializeDataTableCommandesFacturation(): void {
    try {
      // @ts-ignore
      if (typeof $ === 'undefined' || !$.fn.DataTable) {
        return;
      }
      
      // @ts-ignore
      const tableElement = $('#commandesTable-facturation');
      if (tableElement.length === 0) {
        return;
      }
      
      // @ts-ignore
      if ($.fn.DataTable.isDataTable('#commandesTable-facturation')) {
        // @ts-ignore
        $('#commandesTable-facturation').DataTable().destroy();
      }
      
      // @ts-ignore
      this.dataTableCommandesFacturation = $('#commandesTable-facturation').DataTable({
        pageLength: 10,
        order: [[1, 'desc']],
        searching: true,
        lengthChange: true,
        deferRender: true,
        columnDefs: [
          { orderable: false, targets: 0 } // Désactiver le tri sur la colonne checkbox
        ],
        language: {
          emptyTable: 'Aucune commande disponible',
          info: 'Affichage de _START_ à _END_ sur _TOTAL_ entrées',
          infoEmpty: 'Affichage de 0 à 0 sur 0 entrées',
          infoFiltered: '(filtré à partir de _MAX_ entrées au total)',
          lengthMenu: 'Afficher _MENU_ entrées',
          loadingRecords: 'Chargement...',
          processing: 'Traitement en cours...',
          search: 'Rechercher:',
          zeroRecords: 'Aucun enregistrement correspondant trouvé'
        }
      });
      
    } catch (error) {
      // Erreur silencieuse
    }
  }

  getSelectedCount(): number {
    // Vérifier à la fois dans le tableau et dans le DOM pour être sûr
    const countFromArray = this.commandes.filter(d => {
      return d.checked === true || d.checked === 'true' || d.checked === 1 || d.checked === 'checked';
    }).length;
    
    // Vérifier aussi dans le DOM au cas où DataTables cacherait des lignes
    try {
      // @ts-ignore
      if (typeof $ !== 'undefined') {
        // @ts-ignore
        const checkedInDOM = $('#commandesTable-modal tbody input[type="checkbox"]:checked').length;
        return Math.max(countFromArray, checkedInDOM);
      }
    } catch (e) {
      // Erreur silencieuse
    }
    
    return countFromArray;
  }

  getSelectedCountFacturation(): number {
    return this.commandesFacturation.filter(d => d.checked === true || d.checked === 'true' || d.checked === 1).length;
  }

  isAllSelected(): boolean {
    if (this.commandes.length === 0) return false;
    // Vérifier que toutes les commandes sont cochées
    const allChecked = this.commandes.every(d => {
      return d.checked === true || d.checked === 'true' || d.checked === 1 || d.checked === 'checked';
    });
    return allChecked;
  }

  isAllSelectedFacturation(): boolean {
    if (this.commandesFacturation.length === 0) return false;
    return this.commandesFacturation.every(d => d.checked);
  }

  toggleAllCommandes(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    // Mettre à jour toutes les commandes dans le tableau principal
    this.commandes.forEach((d) => {
      d.checked = checked;
    });
    this.cdr.detectChanges();
  }

  toggleAllCommandesFacturation(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    // Mettre à jour toutes les commandes dans le tableau principal
    this.commandesFacturation.forEach((d) => {
      d.checked = checked;
    });
    this.cdr.detectChanges();
  }

  onCommandeCheckboxChange(commande: any, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    
    const checkbox = event.target as HTMLInputElement;
    const checked = checkbox.checked;
    const index = this.commandes.findIndex(d => d.document_id === commande.document_id);
    
    if (index !== -1) {
      // Mettre à jour l'état dans le tableau principal
      this.commandes[index].checked = checked;
      commande.checked = checked;
      
      // Forcer la détection de changement
      this.cdr.detectChanges();
    }
  }

  OnEditCommande(document_id: any): void {
    // Fermer le modal avant la navigation (Bootstrap 5)
    const modalElement = document.getElementById('modalCommandeLivraisonXL');
    if (modalElement) {
      const modal = (window as any).bootstrap?.Modal?.getInstance(modalElement);
      if (modal) {
        modal.hide();
      } else {
        // Si l'instance n'existe pas, créer une nouvelle instance et la fermer
        const bsModal = new (window as any).bootstrap.Modal(modalElement);
        bsModal.hide();
      }
    }
    
    // Naviguer vers la page d'édition de la commande
    this.router.navigate(['/Edit-Commande/' + document_id]);
  }

  OnPrintCommande(document_id: any): void {
    // Afficher un loader pendant la génération du PDF
    Swal.fire({
      title: 'Génération du PDF...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.emailService.generateCommandePDF(document_id.toString()).subscribe({
      next: (res: any) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          // Ouvrir le PDF dans un nouvel onglet
          window.open(url, '_blank');
        } else {
          Swal.fire({ 
            icon: 'error', 
            title: 'Erreur', 
            text: 'Lien PDF non reçu.' 
          });
        }
      },
      error: (err: any) => {
        Swal.close();
        Swal.fire({ 
          icon: 'error', 
          title: 'Erreur', 
          text: err.error?.message || 'Erreur lors de la génération du PDF.' 
        });
      }
    });
  }

  onCommandeCheckboxChangeFacturation(commande: any, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const index = this.commandesFacturation.findIndex(d => d.document_id === commande.document_id);
    if (index !== -1) {
      this.commandesFacturation[index].checked = checked;
      commande.checked = checked;
    }
  }

  transfererCommandeVersLivraison() {
    // Vérifier à la fois dans le tableau et dans le DOM
    let commandesSelectionnees = this.commandes.filter(d => {
      return d.checked === true || d.checked === 'true' || d.checked === 1 || d.checked === 'checked';
    });
    
    // Si aucune trouvée dans le tableau, vérifier dans le DOM
    if (commandesSelectionnees.length === 0) {
      try {
        // @ts-ignore
        if (typeof $ !== 'undefined') {
          // @ts-ignore
          $('#commandesTable-modal tbody input[type="checkbox"]:checked').each((index: number, element: any) => {
            // @ts-ignore
            const checkboxId = $(element).attr('id');
            if (checkboxId) {
              const documentId = parseInt(checkboxId.replace('checkbox-', ''));
              const commande = this.commandes.find(c => c.document_id === documentId);
              if (commande && !commandesSelectionnees.includes(commande)) {
                commande.checked = true;
                commandesSelectionnees.push(commande);
              }
            }
          });
        }
      } catch (e) {
        // Erreur silencieuse
      }
    }
    
    if (commandesSelectionnees.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Aucune commande sélectionnée',
        text: 'Veuillez sélectionner au moins une commande à transférer.',
        confirmButtonText: 'OK'
      });
      return;
    }

    // Message de confirmation adapté au nombre de commandes
    const message = commandesSelectionnees.length === 1
      ? `Voulez-vous transférer cette commande en livraison ?`
      : `Voulez-vous transférer <strong>${commandesSelectionnees.length}</strong> commandes en livraison ?`;

    Swal.fire({
      title: 'Confirmer le transfert',
      html: message,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, transférer',
      cancelButtonText: 'Non',
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        // Afficher un loader pendant le traitement
        Swal.fire({
          title: 'Traitement en cours...',
          html: 'Création des livraisons...',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        let completed = 0;
        let errors = 0;
        const total = commandesSelectionnees.length;
        const livraisonsCrees: string[] = [];

        commandesSelectionnees.forEach(commande => {
          this.ventesService.transfererCommandeVersLivraison(commande.document_id).subscribe({
            next: (response: any) => {
              completed++;
              if (response.numero) {
                livraisonsCrees.push(response.numero);
              }
              
              if (completed + errors === total) {
                Swal.close();
                if (errors === 0) {
                  Swal.fire({
                    icon: 'success',
                    title: 'Transfert réussi',
                    text: `✅ ${completed} livraison(s) créée(s) avec succès !`,
                    confirmButtonText: 'OK'
                  }).then(() => {
                    // Fermer le modal
                    const modalElement = document.getElementById('modalCommandeLivraisonXL');
                    if (modalElement) {
                      const modal = (window as any).bootstrap?.Modal?.getInstance(modalElement);
                      if (modal) {
                        modal.hide();
                      }
                    }
                    // Recharger la page pour actualiser les données
                    window.location.reload();
                  });
                } else {
                  this.showError(`⚠️ ${completed} livraison(s) créée(s), ${errors} erreur(s).`);
                  
                  // Décocher toutes les cases après transfert
                  commandesSelectionnees.forEach(c => {
                    c.checked = false;
                    const index = this.commandes.findIndex(d => d.document_id === c.document_id);
                    if (index !== -1) {
                      this.commandes[index].checked = false;
                    }
                  });
                  this.cdr.detectChanges();
                  
                  // Actualiser les données
                  this.getCommandesNonLivrees();
                  this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
                }
              }
            },
            error: (err) => {
              errors++;
              if (completed + errors === total) {
                Swal.close();
                if (completed > 0) {
                  this.showError(`⚠️ ${completed} livraison(s) créée(s), ${errors} erreur(s).`);
                } else {
                  this.showError(`❌ Aucune livraison n'a pu être créée.`);
                }
                
                // Actualiser les données même en cas d'erreur partielle
                this.getCommandesNonLivrees();
                this.getLivraisons();
              }
            }
          });
        });
      }
      // Si l'utilisateur choisit "Non", aucune action n'est effectuée
    });
  }

  transfererCommandeVersFacturation() {
    const commandesSelectionnees = this.commandesFacturation.filter(d => {
      return d.checked === true || d.checked === 'true' || d.checked === 1;
    });
    
    if (commandesSelectionnees.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Aucune commande sélectionnée',
        text: 'Veuillez sélectionner au moins une commande à transférer.',
        confirmButtonText: 'OK'
      });
      return;
    }

    // Pour chaque commande, afficher une popup pour saisir la date et le client
    this.processCommandeVersFacturation(commandesSelectionnees, 0);
  }

  private processCommandeVersFacturation(commandes: any[], index: number) {
    if (index >= commandes.length) {
      // Toutes les commandes ont été traitées
      Swal.fire({
        icon: 'success',
        title: 'Transfert terminé !',
        text: `✅ ${commandes.length} commande(s) transférée(s) vers la facturation avec succès !`,
        confirmButtonText: 'OK'
      }).then(() => {
        this.getCommandesNonLivrees();
        this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
        // Décocher toutes les commandes
        commandes.forEach(c => {
          c.checked = false;
          const cmdIndex = this.commandesFacturation.findIndex(cmd => cmd.document_id === c.document_id);
          if (cmdIndex !== -1) {
            this.commandesFacturation[cmdIndex].checked = false;
          }
        });
        this.cdr.detectChanges();
      });
      return;
    }

    const commande = commandes[index];
    const dateValue = commande.date ? new Date(commande.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    let selectedPartId = commande.part_id || null;
    
    // Créer le HTML pour la popup avec date et client modifiables
    const htmlContent = `
      <div style="text-align: left; padding: 10px;">
        <div class="mb-3">
          <label for="factureDate${index}" style="display: block; margin-bottom: 5px; font-weight: bold;">Date de facture:</label>
          <input type="date" id="factureDate${index}" class="swal2-input" value="${dateValue}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div class="mb-3" style="position: relative;">
          <label for="factureClient${index}" style="display: block; margin-bottom: 5px; font-weight: bold;">Client:</label>
          <input type="text" id="factureClient${index}" class="swal2-input" value="${commande.client || ''}" 
                 placeholder="Rechercher un client..." 
                 style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                 autocomplete="off">
          <div id="clientSuggestions${index}" style="position: absolute; z-index: 1000; background: white; border: 1px solid #ddd; max-height: 200px; overflow-y: auto; width: calc(100% - 2px); margin-top: 2px; display: none; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></div>
        </div>
        <input type="hidden" id="selectedPartId${index}" value="${commande.part_id || ''}">
        <p class="text-muted small">Commande: ${commande.numero || 'N/A'}</p>
        <p class="text-info small">📦 Cela créera <strong>deux livraisons</strong> et <strong>une facture</strong></p>
      </div>
    `;
    
    // Afficher la popup avec le formulaire
    Swal.fire({
      title: `Commande ${index + 1} sur ${commandes.length}`,
      html: htmlContent,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: index === commandes.length - 1 ? 'Transférer' : 'Suivant',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      reverseButtons: true,
      width: '650px',
      padding: '2rem',
      didOpen: () => {
        const clientInput = document.getElementById(`factureClient${index}`) as HTMLInputElement;
        const suggestionsDiv = document.getElementById(`clientSuggestions${index}`);
        const hiddenPartId = document.getElementById(`selectedPartId${index}`) as HTMLInputElement;
        
        // Gestion de la recherche de client
        if (clientInput && suggestionsDiv && hiddenPartId) {
          let searchTimeout: any;
          
          clientInput.addEventListener('input', (e: any) => {
            const searchTerm = e.target.value;
            clearTimeout(searchTimeout);
            
            if (searchTerm.length >= 2) {
              searchTimeout = setTimeout(() => {
                this.onSearchChange(searchTerm);
                setTimeout(() => {
                  if (this.filteredClients.length > 0) {
                    suggestionsDiv.innerHTML = this.filteredClients.map((client: any) => {
                      const clientName = (client.nom || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                      return `<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;" 
                                  onmouseover="this.style.background='#f0f0f0'" 
                                  onmouseout="this.style.background='white'"
                                  data-part-id="${client.part_id}"
                                  data-client-name="${clientName}">
                              ${client.nom || ''}
                            </div>`;
                    }).join('');
                    suggestionsDiv.style.display = 'block';
                    
                    // Ajouter les event listeners pour chaque suggestion
                    suggestionsDiv.querySelectorAll('div[data-part-id]').forEach((div: any) => {
                      div.addEventListener('click', () => {
                        const partId = parseInt(div.getAttribute('data-part-id'), 10);
                        const clientName = div.getAttribute('data-client-name');
                        clientInput.value = clientName;
                        selectedPartId = partId;
                        if (hiddenPartId) {
                          hiddenPartId.value = partId.toString();
                        }
                        suggestionsDiv.style.display = 'none';
                      });
                    });
                  } else {
                    suggestionsDiv.innerHTML = '<div style="padding: 10px; color: #999;">Aucun client trouvé</div>';
                    suggestionsDiv.style.display = 'block';
                  }
                }, 100);
              }, 300);
            } else {
              suggestionsDiv.style.display = 'none';
            }
          });
        }
      },
      preConfirm: () => {
        const dateInput = document.getElementById(`factureDate${index}`) as HTMLInputElement;
        const hiddenPartId = document.getElementById(`selectedPartId${index}`) as HTMLInputElement;
        
        if (!dateInput || !dateInput.value) {
          Swal.showValidationMessage('La date est requise');
          return false;
        }
        
        const partId = hiddenPartId ? parseInt(hiddenPartId.value, 10) : selectedPartId;
        if (!partId || isNaN(partId)) {
          Swal.showValidationMessage('Le client est requis');
          return false;
        }
        
        return {
          factureDate: dateInput.value,
          partId: partId
        };
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        const { factureDate, partId } = result.value;
        
        // Afficher un loader
        Swal.fire({
          title: `Transfert en cours... (${index + 1}/${commandes.length})`,
          html: 'Création de 2 livraisons et 1 facture...',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });
        
        this.ventesService.transfererCommandeVersFacturation(commande.document_id, factureDate, partId).subscribe({
          next: (res: any) => {
            // Décocher la commande
            commande.checked = false;
            const cmdIndex = this.commandesFacturation.findIndex(c => c.document_id === commande.document_id);
            if (cmdIndex !== -1) {
              this.commandesFacturation[cmdIndex].checked = false;
            }
            this.cdr.detectChanges();
            
            // Traiter la commande suivante
            this.processCommandeVersFacturation(commandes, index + 1);
          },
          error: (err: any) => {
            Swal.fire({
              icon: 'error',
              title: 'Erreur',
              text: `Erreur lors du transfert de la commande ${commande.numero || 'N/A'}: ${err.error?.message || err.message || 'Erreur inconnue'}`,
              confirmButtonText: 'Continuer',
              showCancelButton: true,
              cancelButtonText: 'Arrêter'
            }).then((result) => {
              if (result.isConfirmed) {
                // Continuer avec la commande suivante même en cas d'erreur
                this.processCommandeVersFacturation(commandes, index + 1);
              }
            });
          }
        });
      } else if (!result.isConfirmed && index === 0) {
        // L'utilisateur a annulé dès le début, on ne fait rien
      } else if (!result.isConfirmed) {
        // L'utilisateur a annulé, on continue avec les commandes restantes
        this.processCommandeVersFacturation(commandes, index + 1);
      }
    });
  }

  OnEditLivraison(document_id: any) {
    this.router.navigate(['/Edit-Livraison/' + document_id]);
  }

  transfererLivraisonVersFacturation(stockId: number) {
    // Récupérer les données de la livraison
    this.ventesService.getLivraisonDataForTransfer(stockId).subscribe({
      next: (livraisonData: any) => {
        // Formater la date pour l'input date
        const dateValue = livraisonData.date ? new Date(livraisonData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        let selectedPartId = livraisonData.part_id || null;
        
        // Créer le HTML pour la popup avec date et client modifiables
        const htmlContent = `
          <div style="text-align: left; padding: 10px;">
            <div class="mb-3">
              <label for="factureDate" style="display: block; margin-bottom: 5px; font-weight: bold;">Date de facture:</label>
              <input type="date" id="factureDate" class="swal2-input" value="${dateValue}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div class="mb-3" style="position: relative;">
              <label for="factureClient" style="display: block; margin-bottom: 5px; font-weight: bold;">Client:</label>
              <input type="text" id="factureClient" class="swal2-input" value="${livraisonData.client_nom || ''}" 
                     placeholder="Rechercher un client..." 
                     style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                     autocomplete="off">
              <div id="clientSuggestions" style="position: absolute; z-index: 1000; background: white; border: 1px solid #ddd; max-height: 200px; overflow-y: auto; width: calc(100% - 2px); margin-top: 2px; display: none; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></div>
            </div>
            <input type="hidden" id="selectedPartId" value="${livraisonData.part_id || ''}">
          </div>
        `;
        
        // Afficher la popup avec le formulaire
        Swal.fire({
          title: 'Confirmer le transfert',
          html: htmlContent,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Oui, transférer',
          cancelButtonText: 'Annuler',
          confirmButtonColor: '#28a745',
          cancelButtonColor: '#6c757d',
          reverseButtons: true,
          width: '650px',
          padding: '2rem',
          didOpen: () => {
            const clientInput = document.getElementById('factureClient') as HTMLInputElement;
            const suggestionsDiv = document.getElementById('clientSuggestions');
            const hiddenPartId = document.getElementById('selectedPartId') as HTMLInputElement;
            
            // Gestion de la recherche de client
            if (clientInput && suggestionsDiv && hiddenPartId) {
              let searchTimeout: any;
              
              clientInput.addEventListener('input', (e: any) => {
                const searchTerm = e.target.value;
                clearTimeout(searchTimeout);
                
                if (searchTerm.length >= 2) {
                  searchTimeout = setTimeout(() => {
                    this.onSearchChange(searchTerm);
                    setTimeout(() => {
                      if (this.filteredClients.length > 0) {
                        suggestionsDiv.innerHTML = this.filteredClients.map((client: any) => {
                          const clientName = (client.nom || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                          return `<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;" 
                                      onmouseover="this.style.background='#f0f0f0'" 
                                      onmouseout="this.style.background='white'"
                                      data-part-id="${client.part_id}"
                                      data-client-name="${clientName}">
                                  ${client.nom || ''}
                                </div>`;
                        }).join('');
                        suggestionsDiv.style.display = 'block';
                        
                        // Ajouter les event listeners pour chaque suggestion
                        suggestionsDiv.querySelectorAll('div[data-part-id]').forEach((div: any) => {
                          div.addEventListener('click', () => {
                            const partId = parseInt(div.getAttribute('data-part-id'), 10);
                            const clientName = div.getAttribute('data-client-name');
                            clientInput.value = clientName;
                            selectedPartId = partId;
                            if (hiddenPartId) {
                              hiddenPartId.value = partId.toString();
                            }
                            suggestionsDiv.style.display = 'none';
                          });
                        });
                      } else {
                        suggestionsDiv.innerHTML = '<div style="padding: 10px; color: #999;">Aucun client trouvé</div>';
                        suggestionsDiv.style.display = 'block';
                      }
                    }, 100);
                  }, 300);
                } else {
                  suggestionsDiv.style.display = 'none';
                }
              });
              
              // Fermer les suggestions quand on clique ailleurs
              setTimeout(() => {
                document.addEventListener('click', (e: any) => {
                  if (clientInput && suggestionsDiv && 
                      !clientInput.contains(e.target) && 
                      !suggestionsDiv.contains(e.target)) {
                    suggestionsDiv.style.display = 'none';
                  }
                });
              }, 100);
            }
          },
          preConfirm: () => {
            const dateInput = document.getElementById('factureDate') as HTMLInputElement;
            const hiddenPartId = document.getElementById('selectedPartId') as HTMLInputElement;
            
            if (!dateInput || !dateInput.value) {
              Swal.showValidationMessage('La date est requise');
              return false;
            }
            
            const partId = hiddenPartId ? parseInt(hiddenPartId.value, 10) : selectedPartId;
            if (!partId || isNaN(partId)) {
              Swal.showValidationMessage('Le client est requis');
              return false;
            }
            
            return {
              factureDate: dateInput.value,
              partId: partId
            };
          }
        }).then((result) => {
          if (result.isConfirmed && result.value) {
            const { factureDate, partId } = result.value;
            
            // Afficher un loader
            Swal.fire({
              title: 'Transfert en cours...',
              allowOutsideClick: false,
              didOpen: () => {
                Swal.showLoading();
              }
            });
            
            this.ventesService.transfererLivraisonVersFacturation(stockId, factureDate, partId).subscribe({
              next: (res: any) => {
                Swal.fire({
                  icon: 'success',
                  title: 'Transfert réussi !',
                  text: `La livraison a été transférée vers la facturation avec succès. Facture: ${res.factureNum || ''}`,
                  confirmButtonText: 'OK',
                  timer: 3000,
                  timerProgressBar: true
                }).then(() => {
                  // Recharger les données
                  if (this.dataTableLivraison) {
                    // @ts-ignore
                    this.dataTableLivraison.ajax.reload();
                  } else {
                    this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
                  }
                });
              },
              error: (err: any) => {
                Swal.fire({
                  icon: 'error',
                  title: 'Erreur',
                  text: `Une erreur s'est produite lors du transfert : ${err.error?.message || err.message || 'Erreur inconnue'}`,
                  confirmButtonText: 'Fermer'
                });
              }
            });
          }
        });
      },
      error: (err: any) => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: `Impossible de récupérer les données de la livraison : ${err.error?.message || err.message || 'Erreur inconnue'}`,
          confirmButtonText: 'Fermer'
        });
      }
    });
  }

  OnPrintLivraison(document_id: any) {
    // Afficher un loader pendant la génération du PDF
    Swal.fire({
      title: 'Génération du PDF...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Utiliser generateDevisPDF car la route /api/pdf/generate gère tous les types de documents (devis, commandes, livraisons)
    this.emailService.generateDevisPDF(document_id.toString()).subscribe({
      next: (res: any) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          // Ouvrir le PDF dans un nouvel onglet
          window.open(url, '_blank');
        } else {
          Swal.fire({ 
            icon: 'error', 
            title: 'Erreur', 
            text: 'Lien PDF non reçu.' 
          });
        }
      },
      error: (err: any) => {
        Swal.close();
        Swal.fire({ 
          icon: 'error', 
          title: 'Erreur', 
          text: err.error?.message || 'Erreur lors de la génération du PDF de livraison.' 
        });
      }
    });
  }

  AllClients() {
    this.baseService.getClient().subscribe({
      next: (data) => {
        // Gérer différents formats de réponse
        let clientsData = data;
        if (data && data.data && Array.isArray(data.data)) {
          clientsData = data.data;
        } else if (data && Array.isArray(data)) {
          clientsData = data;
        } else {
          clientsData = [];
        }
        
        this.clients = clientsData;
        this.filteredClients = [];
      },
      error: (err) => {
        this.clients = [];
        this.filteredClients = [];
      }
    });
  }

  onSearchChange(term: string | null | undefined) {
    if (!term || typeof term !== 'string') {
      this.filteredClients = [];
      this.searchTerm = term || '';
      return;
    }

    this.searchTerm = term;
    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredClients = [];
      return;
    }

    if (!this.clients || this.clients.length === 0) {
      this.filteredClients = [];
      return;
    }

    this.filteredClients = this.clients.filter(client =>
      client && client.nom && client.nom.toLowerCase().includes(term)
    );
  }

  selectClient(client: any) {
    if (!client || !client.part_id) {
      return;
    }
    this.LivraisonForm.patchValue({
      clientSearch: client.nom,
      part_id: client.part_id
    });
    this.filteredClients = [];
    this.searchTerm = client.nom;
  }

  AllCommerciaux() {
    this.baseService.getCommercial().subscribe({
      next: (data) => {
        // Gérer différents formats de réponse
        let commerciauxData = data;
        if (data && data.data && Array.isArray(data.data)) {
          commerciauxData = data.data;
        } else if (data && Array.isArray(data)) {
          commerciauxData = data;
        } else {
          commerciauxData = [];
        }
        
        this.commerciaux = commerciauxData;
        this.filteredCommerciaux = [];
      },
      error: (err) => {
        this.commerciaux = [];
        this.filteredCommerciaux = [];
      }
    });
  }

  onCommercialSearchChange(term: string | null | undefined) {
    if (!term || typeof term !== 'string') {
      this.filteredCommerciaux = [];
      this.searchCommercial = term || '';
      return;
    }

    this.searchCommercial = term;
    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredCommerciaux = [];
      return;
    }

    if (!this.commerciaux || this.commerciaux.length === 0) {
      this.filteredCommerciaux = [];
      return;
    }

    this.filteredCommerciaux = this.commerciaux.filter(com =>
      com && com.nom && com.nom.toLowerCase().includes(term)
    );
  }

  selectCommercial(com: any) {
    if (!com || !com.id) {
      return;
    }
    this.LivraisonForm.patchValue({
      commercialSearch: com.nom,
      contact_id: com.id
    });
    this.filteredCommerciaux = [];
    this.searchCommercial = com.nom;
  }

  onSubmit(): void {
    if (this.LivraisonForm.valid) {
      const formValue = {
        ...this.LivraisonForm.value
      };
      
      this.ventesService.addLivraison(formValue).subscribe({
        next: (response: any) => {
          this.showSuccess(`✅ Livraison ${response.numero || ''} créée avec succès !`);
          const modal = document.getElementById('addLivraisonModal');
          if (modal) {
            const bsModal = (window as any).bootstrap?.Modal?.getInstance(modal);
            if (bsModal) {
              bsModal.hide();
            }
          }
          this.LivraisonForm.reset();
          this.initForm();
          this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
          this.loadNextLivraisonNumero();
        },
        error: (err) => {
          this.showError(`❌ Une erreur s'est produite lors de la création de la livraison: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    } else {
      this.showError("❗ Le formulaire est invalide. Veuillez remplir tous les champs requis.");
    }
  }

  removeLivraison(livraison: any, index: number) {
    this.removeLivraisonById(livraison.document_id, livraison.numero);
  }

  removeLivraisonById(id: number, numero?: string) {
    Swal.fire({
      title: 'Confirmer la suppression',
      html: `Voulez-vous vraiment supprimer la livraison <strong>${numero || 'N/A'}</strong> ?<br><br><small class="text-muted">Cette action est irréversible.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        const idsToDelete = [id];
        
        this.ventesService.RemoveLivraison(idsToDelete).subscribe({
          next: (res: any) => {
            Swal.fire({
              icon: 'success',
              title: 'Supprimé !',
              text: `La livraison ${numero || 'N/A'} a été supprimée avec succès.`,
              confirmButtonText: 'OK',
              timer: 2000,
              timerProgressBar: true
            }).then(() => {
              // Recharger les livraisons avec pagination au lieu de recharger toute la page
              this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
            });
          },
          error: (err: any) => {
            Swal.fire({
              icon: 'error',
              title: 'Erreur',
              text: `Une erreur s'est produite lors de la suppression : ${err.error?.message || err.message || 'Erreur inconnue'}`,
              confirmButtonText: 'Fermer'
            });
          }
        });
      }
    });
  }

  showSuccess(message: string) {
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: message,
      confirmButtonText: 'OK'
    }).then(() => {
      // Recharger les livraisons avec pagination au lieu de recharger toute la page
      this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
    });
  }

  showError(message: string) {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message,
      confirmButtonText: 'Fermer'
    });
  }

  get clientSearchControl() {
    return this.LivraisonForm.get('clientSearch') as FormControl;
  }

  get commercialSearchControl() {
    return this.LivraisonForm.get('commercialSearch') as FormControl;
  }

  // Méthodes de pagination pour les livraisons
  onPageChangeLivraisons(page: number): void {
    if (page >= 1 && page <= this.totalPagesLivraisons && page !== this.currentPageLivraisons) {
      this.loadLivraisons(page, this.searchTermLivraisons);
    }
  }

  onPageSizeChangeLivraisons(event: any): void {
    const newPageSize = parseInt(event.target.value);
    if (newPageSize > 0) {
      this.pageSizeLivraisons = newPageSize;
      this.loadLivraisons(1, this.searchTermLivraisons);
    }
  }

  onSearchLivraisons(): void {
    this.loadLivraisons(1, this.searchTermLivraisons);
  }

  onSearchKeyPressLivraisons(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearchLivraisons();
    }
  }

  getPageNumbersLivraisons(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPageLivraisons - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPagesLivraisons, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  getDisplayRangeLivraisons(): string {
    const start = ((this.currentPageLivraisons - 1) * this.pageSizeLivraisons) + 1;
    const end = Math.min(this.currentPageLivraisons * this.pageSizeLivraisons, this.totalRecordsLivraisons);
    return `${start} à ${end}`;
  }

  // Tri par colonne pour les livraisons
  onSortLivraisons(column: string): void {
    if (this.sortColumnLivraisons === column) {
      this.sortDirectionLivraisons = this.sortDirectionLivraisons === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumnLivraisons = column;
      this.sortDirectionLivraisons = 'DESC';
    }
    this.loadLivraisons(1, this.searchTermLivraisons);
  }

  getSortIconLivraisons(column: string): string {
    if (this.sortColumnLivraisons !== column) {
      return 'fa-sort';
    }
    return this.sortDirectionLivraisons === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Filtres avancés pour les livraisons
  toggleAdvancedFiltersLivraisons(): void {
    this.showAdvancedFiltersLivraisons = !this.showAdvancedFiltersLivraisons;
  }

  applyAdvancedFiltersLivraisons(livraisons: any[]): any[] {
    let filtered = [...livraisons];
    
    if (this.filterDateFromLivraisons) {
      const fromDate = new Date(this.filterDateFromLivraisons);
      filtered = filtered.filter(l => {
        if (!l.date) return false;
        const livraisonDate = new Date(l.date);
        return livraisonDate >= fromDate;
      });
    }
    
    if (this.filterDateToLivraisons) {
      const toDate = new Date(this.filterDateToLivraisons);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(l => {
        if (!l.date) return false;
        const livraisonDate = new Date(l.date);
        return livraisonDate <= toDate;
      });
    }
    
    if (this.filterClientLivraisons) {
      filtered = filtered.filter(l => 
        l.client?.toLowerCase().includes(this.filterClientLivraisons.toLowerCase())
      );
    }
    
    return filtered;
  }

  onFilterChangeLivraisons(): void {
    this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
  }

  resetFiltersLivraisons(): void {
    this.filterDateFromLivraisons = '';
    this.filterDateToLivraisons = '';
    this.filterClientLivraisons = '';
    this.loadLivraisons(1, this.searchTermLivraisons, true);
  }

  extractClientsListLivraisons(livraisons: any[]): void {
    const clients = new Set<string>();
    livraisons.forEach(l => {
      if (l.client) {
        clients.add(l.client);
      }
    });
    this.clientsListLivraisons = Array.from(clients).sort();
  }

  isFacturee(livraison: any): boolean {
    if (!livraison || !livraison.facture) {
      return false;
    }
    return livraison.facture.toUpperCase().trim() === 'FACTURE';
  }

  // Export des données pour les livraisons
  exportToCSVLivraisons(): void {
    const headers = ['Numéro', 'Date', 'Client', 'Commercial', 'HT', 'TVA', 'TTC'];
    const rows = this.livraisons.map(l => [
      l.numero || '',
      l.date ? new Date(l.date).toLocaleDateString('fr-FR') : '',
      l.client || '',
      l.commercial || '',
      (l.total_ht || 0).toFixed(2),
      (l.total_tva || 0).toFixed(2),
      (l.total_ttc || 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `livraisons_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.showNotification('✅ Export CSV réussi !', false);
  }

  showNotification(message: string, isError: boolean = false): void {
    this.successMessage = message;
    this.isError = isError;
    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  ngOnDestroy(): void {
    this.clientSearchSub?.unsubscribe();
    this.commercialSearchSub?.unsubscribe();
  }
}
