import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import { EmailService } from 'src/app/service/email.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-devis',
  templateUrl: './devis.component.html',
  styleUrls: ['./devis.component.css']
})
export class DevisComponent implements OnInit, AfterViewInit {
  devis: any[] = [];
  dataTable: any;
  loading: boolean = true;
  searchTerm: string = '';
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;
  
  // Tri
  sortColumn: string = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';
  
  // Filtres avancés
  showAdvancedFilters: boolean = false;
  filterDateFrom: string = '';
  filterDateTo: string = '';
  filterClient: string = '';
  
  // Liste des clients pour le filtre
  clientsList: string[] = [];
  
  clients: any[] = [];
  filteredClients: any[] = [];
  selectedClient: any = null;
  searchCommercial = '';
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  selectedCommercial: any = null;
  DevisForm!: FormGroup;
  DevisSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  nextDevisNumero: string = 'DV25-0001'; // Numéro par défaut

  constructor(
    private ventesService: VentesService, 
    private router: Router,
    private baseService: BaseService, 
    private fb: FormBuilder, 
    private emailService: EmailService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initForm(); // Initialiser le formulaire en premier
    
    this.getDevis();
    this.AllClients();
    this.AllCommerciaux();
    this.loadNextDevisNumero(); // Charger le numéro de devis au démarrage

    // Ici les abonnements sur les changements de texte (après initForm)
    this.DevisForm.get('clientSearch')?.valueChanges.subscribe(value => {
      this.searchTerm = value || '';
      this.onSearchChange(value);
    });

    this.DevisForm.get('commercialSearch')?.valueChanges.subscribe(value => {
      this.searchCommercial = value || '';
      this.onCommercialSearchChange(value);
    });
  }


  initForm(): void {
    // Date d'aujourd'hui au format YYYY-MM-DD
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    
    this.DevisForm = this.fb.group({
      date: [todayString, Validators.required],
      description: [''],
      part_id: [0],
      contact_id: [0],
      date_fin: [''],
      type: [1],

      
    clientSearch: [''],   // le texte visible pour client
    commercialSearch: [''] // le texte visible pour commercial
    });

    
  }

  ngAfterViewInit(): void {
    // Recharger le numéro de devis à chaque ouverture du modal
    // @ts-ignore - jQuery disponible globalement à l'exécution
    if (typeof ($) !== 'undefined') {
      // @ts-ignore
      $('#addClientModal').on('shown.bs.modal', () => {
        this.loadNextDevisNumero();
        // Recharger les clients et commerciaux à chaque ouverture du modal
        this.AllClients();
        this.AllCommerciaux();
        // Réinitialiser le formulaire
        this.DevisForm.reset();
        this.initForm();
        // Réinitialiser les listes filtrées
        this.filteredClients = [];
        this.filteredCommerciaux = [];
        this.searchTerm = '';
        this.searchCommercial = '';
      });

      // @ts-ignore - Réinitialiser le formulaire à la fermeture du modal
      $('#addClientModal').on('hidden.bs.modal', () => {
        this.DevisForm.reset();
        this.initForm();
        this.searchTerm = '';
        this.searchCommercial = '';
        this.filteredClients = [];
        this.filteredCommerciaux = [];
      });
    }
  }

  loadNextDevisNumero(): void {
    this.ventesService.getNextDevisNumero().subscribe({
      next: (response: any) => {
        if (response && response.data && response.data.numero) {
          this.nextDevisNumero = response.data.numero;
        } else if (response && response.numero) {
          this.nextDevisNumero = response.numero;
        }
      },
      error: (err) => {
        console.error('Erreur lors du chargement du numéro de devis:', err);
        // Garder la valeur par défaut en cas d'erreur
      }
    });
  }

  getNextLigne(): string {
    return this.nextDevisNumero;
  }

  getNextLigneOld(): string {
  if (!this.devis || this.devis.length === 0) return 'DV25-0001';

  const numeros = this.devis
    .map(item => {
      const match = item.numero?.match(/^DV\d{2}-(\d{4})$/);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter((n): n is number => n !== null);

  const maxNumero = Math.max(...numeros);
  const nextNumero = isFinite(maxNumero) ? maxNumero + 1 : 1;

  return 'DV25-' + nextNumero.toString().padStart(4, '0');
}
  loadDevis(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loading = true;
    this.currentPage = page;
    this.searchTerm = search;
    
    if (resetFilters) {
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.filterClient = '';
    }

    // Construire les paramètres de recherche combinant searchTerm et filterClient
    let combinedSearch = search;
    if (this.filterClient && typeof this.filterClient === 'string' && this.filterClient.trim()) {
      combinedSearch = combinedSearch ? `${combinedSearch} ${this.filterClient}` : this.filterClient;
    }

    const requestOptions = {
      page: page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: combinedSearch,
      dateFrom: this.filterDateFrom || undefined,
      dateTo: this.filterDateTo || undefined
    };
    
    console.log('[DevisComponent] 🔍 Requête devis avec options:', JSON.stringify(requestOptions, null, 2));
    
    this.ventesService.getDevis(requestOptions).subscribe({
      next: (response: any) => {
        console.log('[DevisComponent] ✅ Réponse API complète:', JSON.stringify(response, null, 2));
        console.log('[DevisComponent] response.success:', response.success);
        console.log('[DevisComponent] response.data:', response.data);
        console.log('[DevisComponent] response.pagination:', response.pagination);
        
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        // Les données sont déjà filtrées et paginées par le serveur
        // IMPORTANT: Ne charger que les données de la page actuelle
        this.devis = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        
        console.log(`[DevisComponent] 📊 Page ${page}/${this.totalPages}, ${this.devis.length} devis chargés sur ${this.totalRecords} total`);
        console.log(`[DevisComponent] 🔄 Tri: ${this.sortColumn} ${this.sortDirection}`);
        
        if (this.devis.length > 0) {
          console.log(`[DevisComponent] ✅ Premier devis:`, this.devis[0]);
        } else {
          console.warn(`[DevisComponent] ⚠️ Aucun devis trouvé. Total: ${this.totalRecords}`);
          if (this.totalRecords === 0) {
            console.warn(`[DevisComponent] ⚠️ Aucun devis dans la base de données avec type=1`);
          }
        }
        
        // Extraire la liste des clients uniques pour le filtre (depuis la page actuelle uniquement)
        this.extractClientsList(this.devis);
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[DevisComponent] ❌ Erreur complète lors du chargement des devis:', err);
        console.error('[DevisComponent] ❌ Status:', err.status);
        console.error('[DevisComponent] ❌ Message:', err.message);
        console.error('[DevisComponent] ❌ Error:', err.error);
        if (err.error && err.error.message) {
          console.error('[DevisComponent] ❌ Message serveur:', err.error.message);
        }
        this.showError(`❌ Erreur lors du chargement des devis: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        this.loading = false;
        this.devis = [];
        this.totalRecords = 0;
        this.totalPages = 1;
        this.cdr.detectChanges();
      }
    });
  }

  getDevis(): void {
    // Toujours utiliser loadDevis avec pagination dès le démarrage
    this.loadDevis(1, '', false);
  }
  OnEdit(document_id: any) {
    this.router.navigate(['/Edit-Devis/' + document_id]);
  }

  AllClients() {
    this.baseService.getClient().subscribe((response: any) => {
      this.clients = response?.data || (Array.isArray(response) ? response : []);
      console.log('[DevisComponent] Clients chargés:', this.clients.length);
      if (this.clients.length > 0) {
        console.log('[DevisComponent] Exemple client:', this.clients[0]);
      }
      // Ne pas initialiser filteredClients avec tous les clients, laisser vide au départ
      this.filteredClients = [];
      this.cdr.detectChanges();
    }, error => {
      console.error('[DevisComponent] Erreur chargement clients:', error);
      this.clients = [];
      this.filteredClients = [];
      this.cdr.detectChanges();
    })
  }

  onSearchChange(term: string | null | undefined) {
    if (!term || typeof term !== 'string') {
      this.filteredClients = [];
      this.cdr.detectChanges();
      return;
    }
    
    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredClients = [];
      this.cdr.detectChanges();
      return;
    }

    // Vérifier que les clients sont chargés
    if (!this.clients || this.clients.length === 0) {
      console.warn('[DevisComponent] Aucun client chargé pour la recherche');
      this.filteredClients = [];
      this.cdr.detectChanges();
      return;
    }

    this.filteredClients = this.clients.filter(client =>
      client?.nom && client.nom.toLowerCase().includes(term)
    );
    
    console.log('[DevisComponent] Recherche client:', term, 'Résultats:', this.filteredClients.length, 'Clients disponibles:', this.clients.length);
    this.cdr.detectChanges();
  }

 selectClient(client: any) {
  this.DevisForm.patchValue({
    clientSearch: client.nom,
    part_id: client.part_id // ou client.id selon ton modèle
  });
  this.filteredClients = [];
  this.searchTerm = client.nom; // facultatif si tu veux garder cette variable
}





  AllCommerciaux() {
    this.baseService.getCommercial().subscribe((response: any) => {
      this.commerciaux = response?.data || (Array.isArray(response) ? response : []);
      console.log('[DevisComponent] Commerciaux chargés:', this.commerciaux.length);
      if (this.commerciaux.length > 0) {
        console.log('[DevisComponent] Exemple commercial:', this.commerciaux[0]);
      }
      // Ne pas initialiser filteredCommerciaux avec tous les commerciaux, laisser vide au départ
      this.filteredCommerciaux = [];
      this.cdr.detectChanges();
    }, error => {
      console.error('[DevisComponent] Erreur chargement commerciaux:', error);
      this.commerciaux = [];
      this.filteredCommerciaux = [];
      this.cdr.detectChanges();
    })
  }

  onCommercialSearchChange(term: string | null | undefined) {
    if (!term || typeof term !== 'string') {
      this.filteredCommerciaux = [];
      this.cdr.detectChanges();
      return;
    }
    
    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredCommerciaux = [];
      this.cdr.detectChanges();
      return;
    }

    // Vérifier que les commerciaux sont chargés
    if (!this.commerciaux || this.commerciaux.length === 0) {
      console.warn('[DevisComponent] Aucun commercial chargé pour la recherche');
      this.filteredCommerciaux = [];
      this.cdr.detectChanges();
      return;
    }

    this.filteredCommerciaux = this.commerciaux.filter(com =>
      com?.nom && com.nom.toLowerCase().includes(term)
    );
    
    console.log('[DevisComponent] Recherche commercial:', term, 'Résultats:', this.filteredCommerciaux.length, 'Commerciaux disponibles:', this.commerciaux.length);
    this.cdr.detectChanges();
  }

 selectCommercial(com: any) {
  this.DevisForm.patchValue({
    commercialSearch: com.nom,
    contact_id: com.id // ou com.id selon ta structure
  });
  this.filteredCommerciaux = [];
  this.searchCommercial = com.nom; // facultatif
}


  onSubmit(): void {
    if (this.DevisForm.valid) {
      
      this.ventesService.addDevis(this.DevisForm.value).subscribe({
        next: () => {
          this.showSuccess('✅ Devis ajouté avec succès !');
        },
        error: (err) => {
          console.error(err);
          this.showError("❌ Une erreur s'est produite lors de l'ajout du Devis.");
        }
      });
    } else {
      this.showError("❗ Le formulaire est invalide.");
    }
  }

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
    }).then(() => {
      // Fermer le modal avec jQuery (comme dans commande.component.ts)
      // @ts-ignore - jQuery disponible globalement
      if (typeof ($) !== 'undefined') {
        // @ts-ignore
        $('#addClientModal').modal('hide');
      } else {
        // Fallback si jQuery n'est pas disponible
        const modalElement = document.getElementById('addClientModal');
        if (modalElement) {
          const modal = (window as any).bootstrap?.Modal?.getInstance(modalElement);
          if (modal) {
            modal.hide();
          } else {
            modalElement.classList.remove('show');
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) backdrop.remove();
          }
        }
      }
      
      // Recharger le numéro de devis
      this.loadNextDevisNumero();
      
      // S'assurer que le tri est bien par date DESC pour voir le nouveau devis en premier
      this.sortColumn = 'date';
      this.sortDirection = 'DESC';
      
      // Attendre un petit délai pour s'assurer que le backend a bien enregistré le devis
      // puis recharger la première page avec resetFilters pour voir le nouveau devis
      setTimeout(() => {
        console.log('[DevisComponent] Rechargement des devis après insertion, tri: date DESC');
        this.loadDevis(1, '', true); // resetFilters = true pour réinitialiser les filtres
      }, 500); // Délai de 500ms pour laisser le temps au backend
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


  get clientSearchControl() {
  return this.DevisForm.get('clientSearch') as FormControl;
}

get commercialSearchControl() {
  return this.DevisForm.get('commercialSearch') as FormControl;
}


  removeDevis(index: number) {
  const dev = this.devis[index];

  if (dev.document_id) {
    this.DevisSupprimes.push(dev.document_id);

    this.ventesService.RemoveDevis(this.DevisSupprimes).subscribe({
      next: (res: { message: string }) => {
        this.showNotification(res.message, false);

        // Recharger les devis avec pagination au lieu de modifier le tableau local
        this.loadDevis(this.currentPage, this.searchTerm);

        this.DevisSupprimes = [];
      },
      error: (err: any) => {
        this.showNotification(err.message, true);
        console.error('Erreur de suppression :', err);
      }
    });
  }
}


showNotification(message: string, isError: boolean = false) {
  this.successMessage = message;
  this.isError = isError;

  setTimeout(() => {
    this.successMessage = null;
  }, 5000);
}

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadDevis(page, this.searchTerm);
    }
  }

  onPageSizeChange(event: any): void {
    const newPageSize = parseInt(event.target.value);
    if (newPageSize > 0) {
      this.pageSize = newPageSize;
      this.loadDevis(1, this.searchTerm);
    }
  }

  onSearch(): void {
    this.loadDevis(1, this.searchTerm);
  }

  onSearchKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearch();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  getDisplayRange(): string {
    const start = ((this.currentPage - 1) * this.pageSize) + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} à ${end}`;
  }

  // Tri par colonne
  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.loadDevis(1, this.searchTerm);
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Filtres avancés
  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  onFilterChange(): void {
    // Recharger depuis la page 1 quand les filtres changent
    this.loadDevis(1, this.searchTerm);
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterClient = '';
    this.loadDevis(1, this.searchTerm, true);
  }

  extractClientsList(devis: any[]): void {
    const clients = new Set<string>();
    devis.forEach(d => {
      if (d.client) {
        clients.add(d.client);
      }
    });
    this.clientsList = Array.from(clients).sort();
  }

  // Export des données
  exportToCSV(): void {
    const headers = ['Numéro', 'Date', 'Client', 'Commercial', 'Description'];
    const rows = this.devis.map(d => [
      d.numero || '',
      d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '',
      d.client || '',
      d.commercial || '',
      d.description || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `devis_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.showNotification('✅ Export CSV réussi !', false);
  }

onPrintDevis(document_id: any) {
  if (!document_id) {
    Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
    return;
  }
  this.emailService.generateDevisPDF(document_id.toString()).subscribe({
    next: (res) => {
      const url = res?.pdfUrl;
      if (url) {
        window.open(url, '_blank');
      } else {
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
      }
    },
    error: (err) => {
      console.error('Erreur génération PDF :', err);
      Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." });
    }
  });
}
}