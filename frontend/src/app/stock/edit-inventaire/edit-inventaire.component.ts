import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { StockService } from 'src/app/service/stock.service';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-edit-inventaire',
  templateUrl: './edit-inventaire.component.html',
  styleUrls: ['./edit-inventaire.component.css']
})
export class EditInventaireComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef;
  @ViewChild('barcodeInput') barcodeInput!: ElementRef;

  inventaireId: number = 0;
  inventaire: any = null;
  loading: boolean = false;
  modeSaisie: 'excel' | 'douchette' = 'excel';
  
  // Données
  lignesInventaire: any[] = [];
  stockCalculData: any[] = [];
  
  // Douchette
  barcodeValue: string = '';
  barcodeFocused: boolean = false;

  // Validation et comparaison
  comparaisonData: any[] = [];
  showComparaisonModal: boolean = false;
  
  // Pagination et recherche pour le modal
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;
  searchTerm: string = '';
  sortColumn: string = 'article_nom';
  sortDirection: 'ASC' | 'DESC' = 'ASC';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private stockService: StockService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    const id = +this.route.snapshot.paramMap.get('document_id')!;
    if (id) {
      this.inventaireId = id;
      this.loadInventaire();
      this.loadStockCalculData();
    }
  }

  loadInventaire(): void {
    this.loading = true;
    this.stockService.getInventaireById(this.inventaireId).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          this.inventaire = response.data;
          this.lignesInventaire = response.data.lignes || [];
        }
        this.loading = false;
      },
      error: (err) => {
        Swal.fire('Erreur', 'Erreur lors du chargement de l\'inventaire', 'error');
        this.loading = false;
      }
    });
  }

  updateDate(event: any): void {
    const date = event.target.value;
    if (!date) return;

    this.stockService.updateInventaireDate(this.inventaireId, date).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.inventaire.date = date;
          Swal.fire({
            icon: 'success',
            title: 'Succès',
            text: 'Date mise à jour avec succès',
            timer: 2000,
            showConfirmButton: false
          });
        }
      },
      error: (err) => {
        Swal.fire('Erreur', err.error?.message || 'Erreur lors de la mise à jour de la date', 'error');
      }
    });
  }

  loadStockCalculData(): void {
    this.stockService.getStockCalculData().subscribe({
      next: (response: any) => {
        if (response.success) {
          this.stockCalculData = response.data || [];
        }
      },
      error: (err) => {
      }
    });
  }

  // Mode Excel
  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        // Convertir les données Excel en lignes d'inventaire
        // Prendre en compte stock_disponible, stock_actuel, quantite, etc.
        this.lignesInventaire = jsonData.map((row: any) => {
          // Essayer plusieurs noms de colonnes possibles
          const articleId = row.article_id || row.articleId || row.ArticleId || row['Article ID'] || null;
          let articleCod = row.article_cod || row.code || row.Code || row['Code Article'] || row['Code'] || '';
          let articleNom = row.article_nom || row.nom || row.Nom || row['Nom Article'] || row['Nom'] || row['Article'] || '';
          
          // Si les informations manquent, les récupérer depuis stockCalculData
          if (articleId && (!articleCod || !articleNom)) {
            const articleFromStock = this.stockCalculData.find((item: any) => item.article_id === articleId);
            if (articleFromStock) {
              articleCod = articleCod || articleFromStock.article_cod || '';
              articleNom = articleNom || articleFromStock.article_nom || '';
            }
          }
          
          // Prendre stock_disponible en priorité, sinon stock_actuel, sinon quantite
          const quantite = parseFloat(
            row.stock_disponible || row.Stock_disponible || row['Stock Disponible'] || 
            row.stock_actuel || row.Stock_actuel || row['Stock Actuel'] ||
            row.quantite || row.Quantite || row['Quantité'] || 0
          ) || 0;
          
          return {
            article_id: articleId,
            article_cod: articleCod,
            article_nom: articleNom,
            quantite: quantite,
            prix: 0, // Prix à 0 pour inventaire
            taux_tva: 0
          };
        }).filter((ligne: any) => ligne.article_id && ligne.article_id > 0);

        Swal.fire('Succès', `${this.lignesInventaire.length} ligne(s) importée(s)`, 'success');
      } catch (error) {
        Swal.fire('Erreur', 'Erreur lors de la lecture du fichier Excel', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  downloadExcelTemplate(): void {
    this.stockService.getStockCalculData().subscribe({
      next: (response: any) => {
        if (response.success) {
          const data = response.data || [];
          const worksheet = XLSX.utils.json_to_sheet(data);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock');
          XLSX.writeFile(workbook, 'template-inventaire.xlsx');
        }
      },
      error: (err) => {
        Swal.fire('Erreur', 'Erreur lors du téléchargement du template', 'error');
      }
    });
  }

  // Mode Douchette
  onBarcodeInput(event: any): void {
    const value = event.target.value.trim();
    if (!value) return;

    // Chercher l'article par code-barres
    const article = this.stockCalculData.find((item: any) => 
      item.article_cod === value || item.code_barre === value
    );

    if (article) {
      // Vérifier si l'article existe déjà dans les lignes
      const existingIndex = this.lignesInventaire.findIndex(
        (l: any) => l.article_id === article.article_id
      );

      if (existingIndex >= 0) {
        // Incrémenter la quantité
        this.lignesInventaire[existingIndex].quantite += 1;
      } else {
        // Ajouter une nouvelle ligne
        this.lignesInventaire.push({
          article_id: article.article_id,
          article_cod: article.article_cod,
          article_nom: article.article_nom,
          quantite: 1,
          prix: 0,
          taux_tva: 0
        });
      }

      // Réinitialiser le champ
      event.target.value = '';
      event.target.focus();
    } else {
      Swal.fire('Article non trouvé', `Aucun article trouvé pour le code: ${value}`, 'warning');
    }
  }

  focusBarcodeInput(): void {
    this.barcodeFocused = true;
    setTimeout(() => {
      if (this.barcodeInput) {
        this.barcodeInput.nativeElement.focus();
      }
    }, 100);
  }

  // Enregistrer les lignes
  saving: boolean = false;
  
  enregistrerLignes(): void {
    if (this.lignesInventaire.length === 0) {
      Swal.fire('Attention', 'Aucune ligne à enregistrer', 'warning');
      return;
    }

    this.saving = true;
    // Sauvegarder une copie des données avant l'enregistrement
    const lignesBackup = JSON.parse(JSON.stringify(this.lignesInventaire));
    
    this.stockService.saveInventaireLignes(this.inventaireId, this.lignesInventaire).subscribe({
      next: (response: any) => {
        Swal.fire('Succès', response.message || 'Lignes enregistrées avec succès', 'success');
        // Conserver les données en mémoire (ne pas recharger depuis le backend)
        // Les données sont déjà dans this.lignesInventaire
        this.saving = false;
      },
      error: (err) => {
        // En cas d'erreur, restaurer les données
        this.lignesInventaire = lignesBackup;
        Swal.fire('Erreur', err.error?.message || 'Erreur lors de l\'enregistrement', 'error');
        this.saving = false;
      }
    });
  }

  // Valider et comparer
  validerInventaire(): void {
    if (this.lignesInventaire.length === 0) {
      Swal.fire('Attention', 'Aucune ligne d\'inventaire à valider', 'warning');
      return;
    }

    Swal.fire({
      title: 'Validation',
      text: 'Voulez-vous valider cet inventaire et comparer avec le stock réel ?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, valider',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.loading = true;
        this.stockService.validerInventaire(this.inventaireId).subscribe({
          next: (response: any) => {
            if (response.success) {
              this.comparaisonData = response.data || [];
              this.totalRecords = this.comparaisonData.length;
              this.totalPages = Math.ceil(this.totalRecords / this.pageSize);
              this.showComparaisonModal = true;
              this.currentPage = 1;
            }
            this.loading = false;
          },
          error: (err) => {
            Swal.fire('Erreur', err.error?.message || 'Erreur lors de la validation', 'error');
            this.loading = false;
          }
        });
      }
    });
  }

  // Pagination et recherche pour le modal
  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  onSearch(): void {
    this.currentPage = 1;
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'ASC';
    }
    this.currentPage = 1;
  }

  getFilteredData(): any[] {
    let filtered = [...this.comparaisonData];

    // Recherche
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.article_nom?.toLowerCase().includes(term) ||
        item.article_cod?.toLowerCase().includes(term)
      );
    }

    // Tri
    filtered.sort((a, b) => {
      const aVal = a[this.sortColumn] || '';
      const bVal = b[this.sortColumn] || '';
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return this.sortDirection === 'ASC' ? comparison : -comparison;
    });

    // Mettre à jour le total pour la pagination
    this.totalRecords = filtered.length;
    this.totalPages = Math.ceil(this.totalRecords / this.pageSize);
    
    // Pagination - retourner seulement les lignes de la page courante
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return filtered.slice(start, end);
  }

  // Méthode pour obtenir toutes les données filtrées (sans pagination) - pour l'export
  getAllFilteredData(): any[] {
    let filtered = [...this.comparaisonData];

    // Recherche
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.article_nom?.toLowerCase().includes(term) ||
        item.article_cod?.toLowerCase().includes(term)
      );
    }

    // Tri
    filtered.sort((a, b) => {
      const aVal = a[this.sortColumn] || '';
      const bVal = b[this.sortColumn] || '';
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return this.sortDirection === 'ASC' ? comparison : -comparison;
    });

    return filtered;
  }

  getEcartClass(ecart: number): string {
    if (ecart < 0) return 'text-danger fw-bold';
    if (ecart > 0) return 'text-success fw-bold';
    return 'text-muted';
  }

  // Export Excel
  exportComparaisonExcel(): void {
    // Utiliser toutes les données filtrées, pas seulement celles de la page courante
    const allData = this.getAllFilteredData();
    const data = allData.map(item => ({
      'Code Article': item.article_cod,
      'Nom Article': item.article_nom,
      'Stock Physique': item.stock_physique,
      'Stock Réel': item.stock_reel,
      'Écart': item.ecart
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comparaison');
    XLSX.writeFile(workbook, `comparaison-inventaire-${this.inventaireId}.xlsx`);
  }

  closeComparaisonModal(): void {
    this.showComparaisonModal = false;
  }

  removeLigne(index: number): void {
    this.lignesInventaire.splice(index, 1);
  }

  // Vider le tableau
  viderTableau(): void {
    Swal.fire({
      title: 'Vider le tableau',
      text: 'Voulez-vous supprimer toutes les lignes d\'inventaire ?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, vider',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.loading = true;
        this.stockService.viderInventaireLignes(this.inventaireId).subscribe({
          next: (response: any) => {
            this.lignesInventaire = [];
            Swal.fire('Succès', 'Toutes les lignes ont été supprimées', 'success');
            this.loading = false;
          },
          error: (err) => {
            Swal.fire('Erreur', err.error?.message || 'Erreur lors de la suppression', 'error');
            this.loading = false;
          }
        });
      }
    });
  }

  getDisplayRange(): string {
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start}-${end}`;
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

  // Validation finale
  validationFinale(): void {
    Swal.fire({
      title: 'Validation finale de l\'inventaire',
      html: `
        <div class="text-start">
          <p>En cochant la case ci-dessous, vous acceptez que cet inventaire sera l'inventaire final et que le système va calculer depuis cet inventaire.</p>
          <div class="form-check mt-3">
            <input class="form-check-input" type="checkbox" id="confirmValidation" checked>
            <label class="form-check-label" for="confirmValidation">
              Je confirme que cet inventaire sera l'inventaire final
            </label>
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, valider',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      preConfirm: () => {
        const checkbox = document.getElementById('confirmValidation') as HTMLInputElement;
        if (!checkbox?.checked) {
          Swal.showValidationMessage('Vous devez cocher la case de confirmation');
          return false;
        }
        return true;
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.loading = true;
        this.stockService.validationFinaleInventaire(this.inventaireId).subscribe({
          next: (response: any) => {
            Swal.fire({
              icon: 'success',
              title: 'Succès',
              text: response.message || 'Inventaire validé et transféré avec succès',
              timer: 3000,
              showConfirmButton: false
            });
            this.loading = false;
            // Fermer le modal et rediriger
            this.closeComparaisonModal();
            setTimeout(() => {
              this.router.navigate(['/Stock-Inventaire']);
            }, 1000);
          },
          error: (err) => {
            Swal.fire('Erreur', err.error?.message || 'Erreur lors de la validation finale', 'error');
            this.loading = false;
          }
        });
      }
    });
  }
}

