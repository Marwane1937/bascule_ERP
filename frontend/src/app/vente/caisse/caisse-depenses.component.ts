import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CaisseService } from 'src/app/service/caisse.service';
import { BaseService } from 'src/app/service/base.service';
import { AuthService } from 'src/app/service/auth.service';
import { CaisseModeService } from 'src/app/service/caisse-mode.service';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-caisse-depenses',
  templateUrl: './caisse-depenses.component.html',
  styleUrls: ['./caisse-depenses.component.css']
})
export class CaisseDepensesComponent implements OnInit, OnDestroy {
  documents: any[] = [];
  filteredDocuments: any[] = [];
  loading: boolean = true;
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;
  searchTerm: string = '';
  
  // Tri
  sortColumn: string = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';
  
  // Filtres avancés
  showAdvancedFilters: boolean = false;
  filterDateFrom: string = '';
  filterDateTo: string = '';
  filterMontantMin: number | null = null;
  filterMontantMax: number | null = null;
  
  // Formulaire modal
  DepenseForm!: FormGroup;
  nextNumero: string = '';
  
  // Rubriques pour les dépenses (group_id = 3000)
  rubriques: any[] = [];
  
  // Employés actifs pour les détails
  employes: any[] = [];
  
  // Nom de l'utilisateur connecté
  currentUserName: string = '';
  
  // Mode caisse : 'declaree' (par défaut) ou 'black'
  caisseMode: 'declaree' | 'black' = 'declaree';
  isBlackMode: boolean = false; // Pour le mode nuit
  private caisseModeSubscription?: Subscription;
  
  // Onglets actifs
  activeTab: 'liste' | 'ajout' = 'liste';
  
  constructor(
    private caisseService: CaisseService,
    private baseService: BaseService,
    private authService: AuthService,
    private fb: FormBuilder,
    private caisseModeService: CaisseModeService
  ) {}

  ngOnInit(): void {
    // S'abonner au service pour recevoir les changements de mode
    this.caisseModeSubscription = this.caisseModeService.caisseMode$.subscribe(mode => {
      this.caisseMode = mode === 'black' ? 'black' : 'declaree';
      this.isBlackMode = mode === 'black';
      this.currentPage = 1;
      this.loadNextNumero();
      this.loadDocuments();
    });
    
    // Initialiser avec le mode actuel
    const currentMode = this.caisseModeService.getCurrentMode();
    this.caisseMode = currentMode === 'black' ? 'black' : 'declaree';
    this.isBlackMode = currentMode === 'black';
    
    this.loadCurrentUser();
    this.initForm();
    this.loadDocuments();
    this.loadNextNumero();
    this.loadRubriques();
    this.loadEmployes();
  }
  
  ngOnDestroy(): void {
    if (this.caisseModeSubscription) {
      this.caisseModeSubscription.unsubscribe();
    }
  }

  loadCurrentUser(): void {
    this.authService.currentUser$.subscribe(user => {
      if (user && user.nom) {
        this.currentUserName = user.nom;
        // Mettre à jour le formulaire si déjà initialisé
        if (this.DepenseForm) {
          this.DepenseForm.patchValue({ affectation: this.currentUserName });
        }
      }
    });
  }

  loadRubriques(): void {
    this.baseService.getListesByGroupId(3000).subscribe({
      next: (response: any) => {
        // Le backend retourne { success: true, data: [...] }
        if (response && response.success && Array.isArray(response.data)) {
          this.rubriques = response.data;
        } else if (Array.isArray(response)) {
          // Fallback si la réponse est directement un tableau
          this.rubriques = response;
        } else if (response && Array.isArray(response.data)) {
          // Fallback si la structure est { data: [...] }
          this.rubriques = response.data;
        } else {
          this.rubriques = [];
        }
        if (this.rubriques.length > 0) {
        } else {
        }
      },
      error: (error) => {
        this.rubriques = [];
      }
    });
  }

  loadEmployes(): void {
    this.baseService.getEmployesActifs().subscribe({
      next: (response: any) => {
        // Le backend retourne { success: true, data: [...] }
        if (response && response.success && Array.isArray(response.data)) {
          this.employes = response.data;
        } else if (Array.isArray(response)) {
          // Fallback si la réponse est directement un tableau
          this.employes = response;
        } else if (response && Array.isArray(response.data)) {
          // Fallback si la structure est { data: [...] }
          this.employes = response.data;
        } else {
          this.employes = [];
        }
        if (this.employes.length > 0) {
        }
      },
      error: (error) => {
        this.employes = [];
      }
    });
  }

  initForm(): void {
    this.DepenseForm = this.fb.group({
      date: [new Date().toISOString().split('T')[0], Validators.required],
      description: ['', Validators.required],
      affectation: [this.currentUserName || '', Validators.required]
    });
  }

  loadDocuments(): void {
    this.loading = true;
    // Déterminer le type selon le mode : null pour déclarée, 1 pour black (CDB)
    const type = this.caisseMode === 'black' ? 1 : null;
    const options = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm,
      sens: -1, // Dépenses uniquement
      type: type // Filtrer par type selon le mode
    };

    this.caisseService.getCaisseDocuments(options).subscribe({
      next: (response: any) => {
        // Le backend retourne { data: [...], pagination: {...} }
        if (response) {
          this.documents = response.data || [];
          this.totalRecords = response.pagination?.total || 0;
          this.totalPages = response.pagination?.totalPages || 0;
          // Appliquer les filtres avancés sur les données chargées
          this.applyClientFilters();
        } else {
          this.documents = [];
          this.filteredDocuments = [];
          this.totalRecords = 0;
          this.totalPages = 0;
        }
        this.loading = false;
      },
      error: (error) => {
        this.documents = [];
        this.totalRecords = 0;
        this.totalPages = 0;
        this.loading = false;
        // Afficher un message d'erreur à l'utilisateur
        if (error.status === 500) {
          Swal.fire('Erreur', 'Erreur serveur lors du chargement des dépenses. Vérifiez les logs du serveur.', 'error');
        } else if (error.status === 401) {
          Swal.fire('Erreur', 'Session expirée. Veuillez vous reconnecter.', 'error');
        }
      }
    });
  }

  loadNextNumero(): void {
    // Utiliser CD pour caisse déclarée, CDB pour caisse black
    const prefix = this.caisseMode === 'black' ? 'CDB' : 'CD';
    this.caisseService.getNextCaisseNumero(prefix).subscribe({
      next: (response: any) => {
        // Le backend retourne { success: true, numero: "..." } ou { numero: "..." }
        if (response) {
          if (response.success && response.numero) {
            this.nextNumero = response.numero;
          } else if (response.numero) {
            // Fallback si la structure est différente
            this.nextNumero = response.numero;
          } else {
            this.nextNumero = '';
          }
        } else {
          this.nextNumero = '';
        }
      },
      error: (err: any) => {
        // En cas d'erreur, générer un numéro par défaut pour éviter un affichage vide
        const anneeCourte = new Date().getFullYear().toString().slice(2);
        this.nextNumero = `${prefix}${anneeCourte}-0001`;
      }
    });
  }

  // Méthode supprimée - le mode est maintenant géré par le service via le footer

  setActiveTab(tab: 'liste' | 'ajout'): void {
    this.activeTab = tab;
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadDocuments();
  }

  onSearchChange(): void {
    // Recherche côté serveur, recharger les données
    this.currentPage = 1;
    this.loadDocuments();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.loadDocuments();
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  onFilterChange(): void {
    // Appliquer les filtres avancés sur les données déjà chargées
    this.applyClientFilters();
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterMontantMin = null;
    this.filterMontantMax = null;
    this.searchTerm = '';
    this.currentPage = 1;
    this.loadDocuments();
  }

  // Appliquer les filtres avancés côté client (sur les données déjà chargées)
  applyClientFilters(): void {
    let filtered = [...this.documents];

    // Filtre par date
    if (this.filterDateFrom) {
      filtered = filtered.filter(doc => {
        const docDate = new Date(doc.date);
        const fromDate = new Date(this.filterDateFrom);
        return docDate >= fromDate;
      });
    }

    if (this.filterDateTo) {
      filtered = filtered.filter(doc => {
        const docDate = new Date(doc.date);
        const toDate = new Date(this.filterDateTo);
        toDate.setHours(23, 59, 59, 999);
        return docDate <= toDate;
      });
    }

    // Filtre par montant
    if (this.filterMontantMin !== null && this.filterMontantMin !== undefined) {
      filtered = filtered.filter(doc => doc.montant >= this.filterMontantMin!);
    }

    if (this.filterMontantMax !== null && this.filterMontantMax !== undefined) {
      filtered = filtered.filter(doc => doc.montant <= this.filterMontantMax!);
    }

    this.filteredDocuments = filtered;
  }

  // Obtenir les documents paginés
  getPaginatedDocuments(): any[] {
    // Les données sont déjà paginées côté serveur, on retourne directement
    return this.filteredDocuments.length > 0 ? this.filteredDocuments : this.documents;
  }

  // Obtenir les numéros de page pour la pagination
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

  // Obtenir la plage d'affichage
  getDisplayRange(): string {
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    const filteredCount = this.filteredDocuments.length > 0 ? this.filteredDocuments.length : this.totalRecords;
    return `${start} - ${Math.min(end, filteredCount)}`;
  }

  // Obtenir l'icône de tri
  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Export CSV/Excel
  exportToCSV(): void {
    const headers = ['Numéro', 'Date', 'Description', 'Montant', 'État'];
    const dataToExport = this.filteredDocuments.length > 0 ? this.filteredDocuments : this.documents;
    const rows = dataToExport.map(doc => [
      doc.numero || '',
      doc.date ? new Date(doc.date).toLocaleDateString('fr-FR') : '',
      doc.description || '',
      doc.montant || 0,
      this.getEtatLabel(doc)
    ]);

    let csvContent = headers.join(';') + '\n';
    rows.forEach(row => {
      csvContent += row.join(';') + '\n';
    });

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `depenses_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  onSubmitDepense(): void {
    if (this.DepenseForm.valid) {
      const formValue = this.DepenseForm.value;
      
      // Créer une caisse vide (sans détails)
      const details: any[] = []; // Pas de détails lors de la création

      // Déterminer le type selon le mode : null pour déclarée, 1 pour black (CDB)
      const type = this.caisseMode === 'black' ? 1 : null;
      
      const documentData = {
        date: formValue.date,
        description: formValue.description,
        affectation: formValue.affectation || this.currentUserName,
        sens: -1, // Dépense
        etat: null, // null = ouvert, 1 = clôturé
        type: type // null pour déclarée, 1 pour black
      };

      this.caisseService.createCaisseDocument(documentData, details).subscribe({
        next: (response: any) => {
          if (response && response.success) {
            Swal.fire('Succès', 'Caisse créée avec succès. Vous pouvez maintenant ajouter des lignes en la modifiant.', 'success');
            this.closeModal();
            this.DepenseForm.reset();
            this.initForm();
            this.loadNextNumero();
            this.loadDocuments();
          } else {
            Swal.fire('Attention', response?.message || 'La caisse a été créée mais la réponse est inattendue.', 'warning');
            this.loadDocuments();
          }
        },
        error: (error) => {
          const errorMessage = error.error?.message || error.message || 'Erreur lors de la création de la caisse';
          Swal.fire('Erreur', errorMessage, 'error');
        }
      });
    } else {
      Swal.fire('Erreur de validation', 'Veuillez remplir tous les champs requis', 'error');
    }
  }

  selectedDocument: any = null;
  documentDetails: any[] = [];
  editModalVisible: boolean = false;

  editCaisse(doc: any): void {
    this.selectedDocument = doc;
    // Charger les détails avant d'ouvrir le modal
    this.loadDocumentDetails(doc.id);
  }

  loadDocumentDetails(id: number): void {
    this.caisseService.getCaisseDocumentById(id).subscribe({
      next: (response: any) => {
        if (response && response.success && response.data) {
          // S'assurer que les détails sont bien un tableau
          let details = response.data.details;
          
          if (!details) {
            details = [];
          } else if (!Array.isArray(details)) {
            details = [details];
          }
          
          // S'assurer que chaque détail a les propriétés nécessaires
          this.documentDetails = details.map((detail: any) => {
            // Convertir rubrique_id en nombre si c'est une chaîne
            let rubriqueId = detail.rubrique_id;
            if (rubriqueId !== null && rubriqueId !== undefined) {
              rubriqueId = typeof rubriqueId === 'string' ? parseInt(rubriqueId, 10) : rubriqueId;
              if (isNaN(rubriqueId)) rubriqueId = null;
            } else {
              rubriqueId = null;
            }
            
            // Convertir employe_id en nombre si c'est une chaîne
            let employeId = detail.employe_id;
            if (employeId !== null && employeId !== undefined) {
              employeId = typeof employeId === 'string' ? parseInt(employeId, 10) : employeId;
              if (isNaN(employeId)) employeId = null;
            } else {
              employeId = null;
            }
            
            // Utiliser detail_id si disponible, sinon id
            const detailId = detail.detail_id || detail.id || null;
            
            return {
              id: detailId,
              rubrique_id: rubriqueId,
              employe_id: employeId,
              employe_nom_complet: detail.employe_nom_complet || null,
              quantite: detail.quantite !== null && detail.quantite !== undefined ? parseFloat(detail.quantite) || 1 : 1,
              montant: detail.montant !== null && detail.montant !== undefined ? parseFloat(detail.montant) || 0 : 0,
              description: detail.description || '',
              unite_id: detail.unite_id || null,
              etat: detail.etat || 1
            };
          });
          
          // Ouvrir le modal après le chargement des détails
          setTimeout(() => {
            this.openEditModal();
          }, 100);
        } else {
          // Si pas de détails, initialiser avec un tableau vide
          this.documentDetails = [];
          setTimeout(() => {
            this.openEditModal();
          }, 100);
        }
      },
      error: (error) => {
        // En cas d'erreur, ouvrir quand même le modal avec un tableau vide
        this.documentDetails = [];
        setTimeout(() => {
          this.openEditModal();
        }, 100);
      }
    });
  }

  openEditModal(): void {
    this.editModalVisible = true;
    setTimeout(() => {
      const modalElement = document.getElementById('editCaisseModal');
      if (modalElement) {
        const anyWindow = window as any;
        if (anyWindow.bootstrap) {
          // Configurer le modal pour qu'il ne se ferme pas automatiquement
          const modalOptions = {
            backdrop: 'static', // Empêche la fermeture en cliquant en dehors
            keyboard: false     // Empêche la fermeture avec la touche Escape
          };
          const modal = new anyWindow.bootstrap.Modal(modalElement, modalOptions);
          modal.show();
        }
      }
    }, 100);
  }

  closeEditModal(): void {
    const modalElement = document.getElementById('editCaisseModal');
    if (modalElement) {
      const anyWindow = window as any;
      if (anyWindow.bootstrap) {
        const modal = anyWindow.bootstrap.Modal.getInstance(modalElement);
        if (modal) {
          modal.hide();
        }
      }
    }
    this.editModalVisible = false;
    this.selectedDocument = null;
    this.documentDetails = [];
  }

  addDetailLine(): void {
    this.documentDetails.push({
      rubrique_id: null,
      employe_id: null,
      quantite: 1,
      montant: 0,
      description: '',
      etat: 1
    });
    // S'assurer que le modal reste ouvert
  }

  onRubriqueChange(index: number): void {
    // Optionnel : mettre à jour la description avec le nom de la rubrique si elle est sélectionnée
    const detail = this.documentDetails[index];
    if (detail.rubrique_id) {
      const rubrique = this.rubriques.find(r => r.id === detail.rubrique_id);
      if (rubrique && !detail.description) {
        detail.description = rubrique.nom;
      }
    }
  }

  // Obtenir le nom de l'employé à partir de l'ID
  getEmployeName(employeId: number | null): string {
    if (!employeId) return '';
    const employe = this.employes.find(e => e.id === employeId);
    return employe ? employe.nom_complet : '';
  }

  // Obtenir le nom de la rubrique à partir de l'ID
  getRubriqueName(rubriqueId: number | null): string {
    if (!rubriqueId) return '';
    const rubrique = this.rubriques.find(r => r.id === rubriqueId);
    return rubrique ? rubrique.nom : '';
  }

  removeDetailLine(index: number): void {
    this.documentDetails.splice(index, 1);
  }

  printCaisseByEmploye(employeId: number | null, index: number): void {
    if (!this.selectedDocument) {
      Swal.fire('Erreur', 'Aucun document sélectionné', 'error');
      return;
    }

    const detail = this.documentDetails[index];
    if (!detail) {
      Swal.fire('Erreur', 'Ligne introuvable', 'error');
      return;
    }

    // Utiliser employeId passé en paramètre ou celui du détail
    const finalEmployeId = employeId || detail.employe_id;
    
    if (!finalEmployeId) {
      Swal.fire('Erreur', 'Aucun employé sélectionné pour cette ligne. Veuillez sélectionner un employé avant d\'imprimer.', 'error');
      return;
    }

    // Afficher un message de chargement
    Swal.fire({
      title: 'Génération du PDF...',
      text: 'Veuillez patienter',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.caisseService.generateCaissePDFByEmploye(this.selectedDocument.id, finalEmployeId).subscribe({
      next: (response: any) => {
        if (response.success && response.pdfUrl) {
          Swal.close();
          // Ouvrir le PDF dans un nouvel onglet
          window.open(response.pdfUrl, '_blank');
        } else {
          Swal.fire('Erreur', 'Erreur lors de la génération du PDF', 'error');
        }
      },
      error: (error) => {
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la génération du PDF', 'error');
      }
    });
  }

  sendTelegramByEmploye(employeId: number | null, index: number): void {
    if (!this.selectedDocument) {
      Swal.fire('Erreur', 'Aucun document sélectionné', 'error');
      return;
    }

    const detail = this.documentDetails[index];
    if (!detail) {
      Swal.fire('Erreur', 'Ligne introuvable', 'error');
      return;
    }

    // Utiliser employeId passé en paramètre ou celui du détail
    const finalEmployeId = employeId || detail.employe_id;
    
    if (!finalEmployeId) {
      Swal.fire('Erreur', 'Aucun employé sélectionné pour cette ligne. Veuillez sélectionner un employé avant d\'envoyer.', 'error');
      return;
    }

    // Vérifier si l'employé a un telegram_id dans les données chargées
    const employe = this.employes.find(e => e.id === finalEmployeId);
    const telegramId = employe?.telegram_id;

    // Si le telegram_id existe, l'utiliser directement
    if (telegramId) {
      this.sendTelegramWithChatId(finalEmployeId, telegramId);
      return;
    }

    // Sinon, demander le chat_id Telegram
    Swal.fire({
      title: 'Envoi via Telegram',
      html: `
        <p>Veuillez entrer le Chat ID Telegram de l'employé :</p>
        <input id="telegramChatId" class="swal2-input" placeholder="Ex: 123456789" type="text">
        <p style="font-size: 12px; color: #666; margin-top: 10px;">
          <strong>Comment obtenir le Chat ID ?</strong><br>
          1. Démarrer une conversation avec votre bot Telegram<br>
          2. Envoyer un message au bot<br>
          3. Visiter: https://api.telegram.org/bot&lt;YOUR_BOT_TOKEN&gt;/getUpdates<br>
          4. Chercher "chat":{"id": dans la réponse
        </p>
      `,
      input: 'text',
      inputPlaceholder: 'Chat ID Telegram',
      showCancelButton: true,
      confirmButtonText: 'Envoyer',
      cancelButtonText: 'Annuler',
      inputValidator: (value) => {
        if (!value) {
          return 'Le Chat ID est requis !';
        }
        if (!/^-?\d+$/.test(value)) {
          return 'Le Chat ID doit être un nombre !';
        }
        return null;
      },
      preConfirm: (chatId) => {
        if (!chatId || !/^-?\d+$/.test(chatId)) {
          Swal.showValidationMessage('Le Chat ID est requis et doit être un nombre');
          return false;
        }
        return chatId;
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        const chatId = result.value;

    // Afficher un message de chargement
    Swal.fire({
      title: 'Envoi en cours...',
          text: 'Génération du PDF et envoi via Telegram',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

        this.sendTelegramWithChatId(finalEmployeId, chatId);
      }
    });
  }

  // Méthode privée pour envoyer le Telegram avec le Chat ID
  private sendTelegramWithChatId(employeId: number, chatId: string): void {
    // Afficher un message de chargement
    Swal.fire({
      title: 'Envoi en cours...',
      text: 'Génération du PDF et envoi via Telegram',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.caisseService.sendCaissePDFByEmployeTelegram(
      this.selectedDocument.id, 
      employeId,
      chatId,
      `Bon de caisse ${this.selectedDocument.numero || ''}`
    ).subscribe({
      next: (response: any) => {
        if (response.success) {
          Swal.fire('Succès', 'Le bon de caisse a été envoyé via Telegram avec succès', 'success');
        } else {
          Swal.fire('Erreur', response.message || 'Erreur lors de l\'envoi', 'error');
        }
      },
      error: (error) => {
        
        // Vérifier si c'est une erreur d'authentification (401)
        if (error.status === 401) {
          const errorData = error.error;
          
          if (errorData?.message === 'Token Telegram invalide') {
            Swal.fire({
              title: 'Token Telegram invalide',
              html: `<div style="text-align: left;">
                <p>Le token du bot Telegram est invalide.</p>
                <p>Vérifiez TELEGRAM_BOT_TOKEN dans le fichier .env et redémarrez le serveur.</p>
              </div>`,
              icon: 'warning',
              confirmButtonText: 'Compris'
            });
          } else {
            // C'est probablement une erreur d'authentification JWT
            Swal.fire({
              title: 'Session expirée',
              text: 'Votre session a expiré. Veuillez vous reconnecter.',
              icon: 'warning',
              confirmButtonText: 'Se reconnecter',
              showCancelButton: true
            }).then((result) => {
              if (result.isConfirmed) {
                window.location.href = '/login';
              }
            });
          }
        } else if (error.status === 400 && error.error?.message === 'Chat ID Telegram manquant') {
          const instructions = error.error?.details?.instructions || [];
          const instructionsText = instructions.length > 0 
            ? instructions.join('\n') 
            : 'Le chat_id Telegram est requis.';
          
          Swal.fire({
            title: 'Chat ID Telegram manquant',
            html: `<div style="text-align: left;">
              <p>Le chat_id Telegram est requis pour envoyer le message.</p>
              <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; font-size: 12px; white-space: pre-wrap;">${instructionsText}</pre>
            </div>`,
            icon: 'warning',
            width: '600px',
            confirmButtonText: 'Compris'
          });
        } else {
          // Autre erreur
          const errorMessage = error.error?.error || error.error?.message || 'Erreur lors de l\'envoi via Telegram';
          Swal.fire('Erreur', errorMessage, 'error');
        }
      }
    });
  }

  calculateTotal(index: number): void {
    // Le calcul se fait automatiquement dans le template
  }

  getTotalAmount(): number {
    return this.documentDetails.reduce((sum, detail) => {
      return sum + ((detail.quantite || 0) * (detail.montant || 0));
    }, 0);
  }

  saveCaisseDetails(): void {
    if (!this.selectedDocument) return;

    // Filtrer les lignes vides (sans rubrique, sans description et sans montant)
    const validDetails = this.documentDetails.filter(d => 
      d.rubrique_id || d.description || (d.montant > 0 && d.quantite > 0)
    ).map(d => {
      // S'assurer que employe_id est bien inclus et converti en nombre
      let employeId = d.employe_id;
      if (employeId !== null && employeId !== undefined) {
        employeId = typeof employeId === 'string' ? parseInt(employeId, 10) : employeId;
        if (isNaN(employeId)) employeId = null;
      } else {
        employeId = null;
      }
      return {
        ...d,
        employe_id: employeId
      };
    });

    // Valider qu'il y a au moins une ligne valide
    if (validDetails.length === 0) {
      Swal.fire('Erreur', 'Veuillez ajouter au moins une ligne avec une rubrique ou une description et un montant', 'error');
      return;
    }

    validDetails.forEach((d, idx) => {
    });

    const documentData = {
      description: this.selectedDocument.description
    };

    // Envoyer tous les détails valides (existants + nouveaux)
    this.caisseService.updateCaisseDocument(this.selectedDocument.id, documentData, validDetails).subscribe({
      next: (response: any) => {
        if (response.success) {
          Swal.fire('Succès', 'Caisse modifiée avec succès', 'success');
          // Ne pas fermer le modal, recharger les détails et la liste
          this.loadDocumentDetails(this.selectedDocument.id);
          this.loadDocuments();
        }
      },
      error: (error) => {
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la modification', 'error');
      }
    });
  }

  closeModal(): void {
    const modalElement = document.getElementById('addDepenseModal');
    if (modalElement) {
      const anyWindow = window as any;
      if (typeof $ !== 'undefined' && typeof ($.fn as any).modal !== 'undefined') {
        $('#addDepenseModal').modal('hide');
      } else if (anyWindow.bootstrap) {
        const modal = anyWindow.bootstrap.Modal.getInstance(modalElement);
        if (modal) {
          modal.hide();
        }
      }
    }
    // Réinitialiser le numéro après fermeture
    this.nextNumero = '';
  }

  onModalShow(): void {
    // Recharger le numéro quand le modal s'ouvre
    this.loadNextNumero();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadDocuments();
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.currentPage = 1;
    this.loadDocuments();
  }

  // Clôturer une caisse
  cloturerCaisse(doc: any, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    // Vérifier si déjà clôturée
    const isCloture = doc.etat === 1 || doc.etat === '1' || doc.etat === 'CLOTURE';
    if (isCloture) {
      Swal.fire('Information', 'Cette caisse est déjà clôturée', 'info');
      return;
    }

    Swal.fire({
      title: 'Clôturer la caisse ?',
      text: `Voulez-vous clôturer la caisse ${doc.numero} ?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Oui, clôturer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.caisseService.cloturerCaisseDocument(doc.id).subscribe({
          next: (response: any) => {
            if (response && response.success) {
              Swal.fire('Succès', 'Caisse clôturée avec succès', 'success');
              this.loadDocuments();
            } else {
              Swal.fire('Erreur', 'Erreur lors de la clôture', 'error');
            }
          },
          error: (error) => {
            Swal.fire('Erreur', error.error?.message || 'Erreur lors de la clôture', 'error');
          }
        });
      }
    });
  }

  // Voir le rapport de la caisse
  viewCaisseReport(doc: any): void {
    this.loading = true;
    this.caisseService.getCaisseDocumentById(doc.id).subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response && response.success && response.data) {
          const caisseData = response.data;
          const details = caisseData.details || [];
          
          // Construire le HTML du rapport
          let detailsHtml = '';
          if (details.length > 0) {
            detailsHtml = '<table class="table table-bordered mt-3"><thead><tr><th>Rubrique</th><th>Description</th><th>Quantité</th><th>Montant</th><th>Total</th></tr></thead><tbody>';
            let totalGeneral = 0;
            details.forEach((detail: any) => {
              const total = (detail.quantite || 0) * (detail.montant || 0);
              totalGeneral += total;
              detailsHtml += `
                <tr>
                  <td>${detail.rubrique || '-'}</td>
                  <td>${detail.description || '-'}</td>
                  <td>${detail.quantite || 0}</td>
                  <td>${detail.montant || 0} DH</td>
                  <td>${total.toFixed(2)} DH</td>
                </tr>
              `;
            });
            detailsHtml += `</tbody><tfoot><tr><th colspan="4" class="text-end">Total Général:</th><th>${totalGeneral.toFixed(2)} DH</th></tr></tfoot></table>`;
          } else {
            detailsHtml = '<p class="text-muted mt-3">Aucun détail disponible pour cette caisse.</p>';
          }
          
          Swal.fire({
            title: `Rapport - ${caisseData.numero || 'N/A'}`,
            html: `
              <div class="text-start">
                <p><strong>Date:</strong> ${caisseData.date ? new Date(caisseData.date).toLocaleDateString('fr-FR') : '-'}</p>
                <p><strong>Description:</strong> ${caisseData.description || '-'}</p>
                <p><strong>Affectation:</strong> ${caisseData.affectation || '-'}</p>
                <p><strong>Montant Total:</strong> ${caisseData.montant || 0} DH</p>
                <p><strong>État:</strong> ${this.getEtatLabel(caisseData)}</p>
                <hr>
                <h6>Détails:</h6>
                ${detailsHtml}
              </div>
            `,
            width: '800px',
            showCancelButton: true,
            confirmButtonText: 'Télécharger PDF',
            cancelButtonText: 'Fermer',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#6c757d'
          }).then((result) => {
            if (result.isConfirmed) {
              this.downloadCaissePDF(doc.id);
            }
          });
        } else {
          Swal.fire('Erreur', 'Impossible de charger les détails de la caisse', 'error');
        }
      },
      error: (error) => {
        this.loading = false;
        Swal.fire('Erreur', 'Erreur lors du chargement du rapport', 'error');
      }
    });
  }

  // Télécharger le PDF de la caisse
  downloadCaissePDF(caisseId: number): void {
    this.caisseService.generateCaissePDF(caisseId).subscribe({
      next: (response: any) => {
        if (response && response.success && response.pdfUrl) {
          // Ouvrir le PDF dans un nouvel onglet
          window.open(response.pdfUrl, '_blank');
          Swal.fire('Succès', 'PDF généré avec succès', 'success');
        } else {
          Swal.fire('Erreur', 'Erreur lors de la génération du PDF', 'error');
        }
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors de la génération du PDF', 'error');
      }
    });
  }

  // Vérifier si une caisse est ouverte
  isCaisseOuverte(doc: any): boolean {
    return doc.etat === null || doc.etat === 'OUVERT' || doc.etat === '' || doc.etat === undefined;
  }

  // Obtenir le libellé de l'état
  getEtatLabel(doc: any): string {
    const isCloture = doc.etat === 1 || doc.etat === '1' || doc.etat === 'CLOTURE';
    return isCloture ? 'Clôturée' : 'Ouverte';
  }

  // Obtenir la classe CSS pour l'état
  getEtatClass(doc: any): string {
    const isCloture = doc.etat === 1 || doc.etat === '1' || doc.etat === 'CLOTURE';
    return isCloture ? 'badge bg-danger' : 'badge bg-success';
  }

  // Vérifier si une caisse doit être clôturée (date dépasse 24h et n'est pas clôturée)
  shouldBeClotured(doc: any): boolean {
    if (!doc.date) return false;
    
    // Vérifier si la caisse est déjà clôturée
    const isCloture = doc.etat === 1 || doc.etat === '1' || doc.etat === 'CLOTURE';
    if (isCloture) return false;
    
    // Calculer la différence en heures entre la date de la caisse et maintenant
    const caisseDate = new Date(doc.date);
    const now = new Date();
    const diffInHours = (now.getTime() - caisseDate.getTime()) / (1000 * 60 * 60);
    
    // Si la différence est supérieure à 24 heures
    return diffInHours > 24;
  }

  // Obtenir la classe CSS pour la ligne du tableau
  getRowClass(doc: any): string {
    if (this.shouldBeClotured(doc)) {
      return 'table-danger';
    }
    return '';
  }
}

