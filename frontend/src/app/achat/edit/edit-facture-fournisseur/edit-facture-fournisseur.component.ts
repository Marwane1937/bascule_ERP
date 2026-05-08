import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import Swal from 'sweetalert2';
import { BaseService } from 'src/app/service/base.service';
import { AchatsService } from 'src/app/service/achats.service';

@Component({
  selector: 'app-edit-facture-fournisseur',
  templateUrl: './edit-facture-fournisseur.component.html',
  styleUrls: ['./edit-facture-fournisseur.component.css']
})
export class EditFactureFournisseurComponent implements OnInit {
  FactureForm!: FormGroup;
  factureId = 0;
  numeroFacture = '';
  editInfos = false;
  isCreateMode = false;
  successMessage: string | null = null;
  isError = false;

  fournisseurs: any[] = [];
  filteredFournisseurs: any[] = [];
  produits: any[] = [];
  produitsOriginal: any[] = [];

  sousTotal = 0;
  totalGeneral = 0;

  info: any = {
    nom: '',
    adresse: '',
    telephone: '',
    email: '',
    ice: ''
  };

  constructor(
    private baseService: BaseService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private achatsService: AchatsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const factureIdParam = this.route.snapshot.paramMap.get('facture_id');
    this.factureId = Number(factureIdParam || 0);
    this.isCreateMode = !this.factureId;

    this.initForm();

    this.FactureForm.get('fournisseurSearch')?.valueChanges.subscribe((value) => {
      this.onSearchChange(value || '');
    });

    this.FactureForm.get('facture_tva')?.valueChanges.subscribe(() => {
      this.calculerTotaux();
    });

    forkJoin({
      fournisseurs: this.baseService.getFournisseur(),
      facture: this.isCreateMode ? of(null) : this.achatsService.getFactureFournisseurById(this.factureId)
    }).subscribe({
      next: (response) => {
        const fournisseursData = response?.fournisseurs?.data || response?.fournisseurs || [];
        this.fournisseurs = Array.isArray(fournisseursData) ? fournisseursData : [];
        this.filteredFournisseurs = [...this.fournisseurs];

        if (this.isCreateMode) {
          this.initializeCreateMode();
          return;
        }

        this.processFactureData(response.facture);
      },
      error: () => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors du chargement de la facture.' });
      }
    });
  }

  private initForm(): void {
    this.FactureForm = this.fb.group({
      fournisseurSearch: ['', Validators.required],
      part_id: [0, [Validators.required, Validators.min(1)]],
      facture_num: ['', Validators.required],
      facture_dat: ['', Validators.required],
      facture_tva: [0, Validators.required]
    });
  }

  private initializeCreateMode(): void {
    this.editInfos = true;
    this.numeroFacture = '';
    this.FactureForm.patchValue({
      fournisseurSearch: '',
      part_id: 0,
      facture_num: '',
      facture_dat: this.toInputDate(new Date()),
      facture_tva: 0
    }, { emitEvent: false });

    this.info = {
      nom: '',
      adresse: '',
      telephone: '',
      email: '',
      ice: ''
    };

    this.produits = [];
    this.produitsOriginal = [];
    this.addProduit();
    this.calculerTotaux();
    this.cdr.detectChanges();
  }

  private toInputDate(value: any): string {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private processFactureData(response: any): void {
    const data = response?.data || response;

    if (!data) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'Facture fournisseur introuvable.' });
      return;
    }

    this.isCreateMode = false;
    this.editInfos = false;
    this.factureId = Number(data.facture_id || this.factureId || 0);
    this.numeroFacture = data.facture_num || '';

    this.FactureForm.patchValue({
      fournisseurSearch: data.fournisseur || '',
      part_id: data.part_id || 0,
      facture_num: data.facture_num || '',
      facture_dat: this.toInputDate(data.facture_dat),
      facture_tva: Number(data.facture_tva || 0)
    }, { emitEvent: false });

    this.info = {
      nom: data?.fournisseurInfo?.nom || data?.fournisseur || '',
      adresse: data?.fournisseurInfo?.adresse || '',
      telephone: data?.fournisseurInfo?.telephone || '',
      email: data?.fournisseurInfo?.email || '',
      ice: data?.fournisseurInfo?.ice || data?.ice || ''
    };

    const details = Array.isArray(data?.details) ? data.details : [];
    this.produits = details.map((detail: any) => ({
      id: detail?.id || null,
      designation: detail?.designation || detail?.article_nom || '',
      qte: Number(detail?.qte ?? detail?.quantite ?? 1) || 0,
      pu: Number(detail?.pu ?? detail?.prix ?? 0) || 0,
      total: 0
    }));

    if (!this.produits.length) {
      this.addProduit();
    }

    this.produits.forEach((_, index) => this.recalculateTotal(index));
    this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
    this.calculerTotaux();
    this.cdr.detectChanges();
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
    const tokens = this.normalizeValue(searchTerm).split(/\s+/).filter(Boolean);

    if (!tokens.length) {
      return false;
    }

    return tokens.every((token) => normalizedHaystack.includes(token));
  }

  onSearchChange(term: string): void {
    if (!term || this.normalizeValue(term).length === 0) {
      this.filteredFournisseurs = [...this.fournisseurs];
      return;
    }

    this.filteredFournisseurs = this.fournisseurs.filter((fournisseur: any) => {
      const sources = [
        fournisseur?.nom,
        fournisseur?.raison_sociale,
        fournisseur?.raisonSociale,
        fournisseur?.email,
        fournisseur?.telephone
      ];

      return sources.some((source) => source && this.matchTerm(source, term));
    });
  }

  selectFournisseur(fournisseur: any): void {
    if (!fournisseur) {
      return;
    }

    const nom = fournisseur?.nom || fournisseur?.raison_sociale || fournisseur?.raisonSociale || '';

    this.FactureForm.patchValue({
      fournisseurSearch: nom,
      part_id: Number(fournisseur.part_id || 0)
    }, { emitEvent: false });

    this.info = {
      nom,
      adresse: fournisseur?.adresse || this.info.adresse || '',
      telephone: fournisseur?.telephone || this.info.telephone || '',
      email: fournisseur?.email || this.info.email || '',
      ice: fournisseur?.ice || fournisseur?.identifiant || this.info.ice || ''
    };

    this.filteredFournisseurs = [];
  }

  get fournisseurSearchControl(): FormControl {
    return this.FactureForm.get('fournisseurSearch') as FormControl;
  }

  toggleEdit(): void {
    if (!this.editInfos) {
      this.editInfos = true;
      return;
    }

    if (this.FactureForm.invalid) {
      this.FactureForm.markAllAsTouched();
      Swal.fire({ icon: 'warning', title: 'Champs requis', text: 'Veuillez completer les informations de la facture.' });
      return;
    }

    if (this.isCreateMode || !this.factureId) {
      this.editInfos = false;
      return;
    }

    this.persistHeader(true);
  }

  private buildHeaderPayload(): any {
    return {
      part_id: Number(this.FactureForm.get('part_id')?.value || 0),
      facture_num: String(this.FactureForm.get('facture_num')?.value || '').trim(),
      facture_dat: this.FactureForm.get('facture_dat')?.value || '',
      facture_ht: this.sousTotal,
      facture_tva: Number(this.FactureForm.get('facture_tva')?.value || 0)
    };
  }

  private persistHeader(showToast: boolean, afterSave?: () => void): void {
    if (this.isCreateMode || !this.factureId) {
      if (afterSave) {
        afterSave();
      }
      return;
    }

    this.achatsService.updateFactureFournisseur(this.factureId, this.buildHeaderPayload()).subscribe({
      next: (response: any) => {
        this.editInfos = false;
        this.processFactureData(response);
        if (showToast) {
          this.showNotification('Informations de facture mises a jour.');
        }
        if (afterSave) {
          afterSave();
        }
      },
      error: (err) => {
        Swal.fire('Erreur', err?.error?.message || 'Erreur lors de la mise a jour de la facture.', 'error');
      }
    });
  }

  addProduit(): void {
    this.produits.push({
      id: null,
      designation: '',
      qte: 1,
      pu: 0,
      total: 0
    });
    this.recalculateTotal(this.produits.length - 1);
  }

  removeProduit(index: number): void {
    const produit = this.produits[index];

    if (!produit?.id) {
      this.produits.splice(index, 1);
      if (index < this.produitsOriginal.length) {
        this.produitsOriginal.splice(index, 1);
      }
      if (!this.produits.length) {
        this.addProduit();
      }
      this.calculerTotaux();
      return;
    }

    this.achatsService.deleteFactureFournisseurLignes([produit.id]).subscribe({
      next: () => {
        this.produits.splice(index, 1);
        this.produitsOriginal = this.produitsOriginal.filter((item: any) => item?.id !== produit.id);
        if (!this.produits.length) {
          this.addProduit();
        }
        this.calculerTotaux();
        this.showNotification('Ligne supprimee.');
      },
      error: (err) => {
        this.showNotification(err?.error?.message || 'Erreur lors de la suppression de la ligne.', true);
      }
    });
  }

  recalculateTotal(index: number): void {
    const prod = this.produits[index];
    if (!prod) {
      return;
    }

    prod.qte = Number(prod.qte || 0);
    prod.pu = Number(prod.pu || 0);
    prod.total = (prod.qte || 0) * (prod.pu || 0);
    this.calculerTotaux();
  }

  calculerTotaux(): void {
    this.sousTotal = this.produits.reduce((acc, product) => acc + ((Number(product.qte) || 0) * (Number(product.pu) || 0)), 0);
    this.totalGeneral = this.sousTotal + (Number(this.FactureForm.get('facture_tva')?.value || 0) || 0);
  }

  private extractDetailRows(): Array<{ id: number | null; designation: string; qte: number; pu: number }> | null {
    const lignes: Array<{ id: number | null; designation: string; qte: number; pu: number }> = [];

    for (let index = 0; index < this.produits.length; index += 1) {
      const produit = this.produits[index] || {};
      const designation = String(produit.designation || '').trim();
      const qte = Number(produit.qte || 0);
      const pu = Number(produit.pu || 0);
      const isEmptyLine = !designation && !qte && !pu && !produit.id;

      if (isEmptyLine) {
        continue;
      }

      if (!designation) {
        Swal.fire({ icon: 'warning', title: 'Ligne invalide', text: `La designation de la ligne ${index + 1} est obligatoire.` });
        return null;
      }

      lignes.push({
        id: produit.id ? Number(produit.id) : null,
        designation,
        qte,
        pu
      });
    }

    return lignes;
  }

  private createFacture(details: Array<{ id: number | null; designation: string; qte: number; pu: number }>): void {
    const payload = {
      ...this.buildHeaderPayload(),
      details: details.map((line) => ({
        designation: line.designation,
        quantite: line.qte,
        prix: line.pu
      }))
    };

    this.achatsService.createFactureFournisseurManual(payload).subscribe({
      next: (response: any) => {
        const factureData = response?.data || response;
        if (factureData?.facture_id) {
          Swal.fire({
            icon: 'success',
            title: 'Facture creee',
            text: `La facture ${factureData.facture_num || ''} a ete creee avec succes.`
          });
          this.router.navigate(['/Edit-Facture-Fournisseur', factureData.facture_id], { replaceUrl: true });
          return;
        }

        Swal.fire('Erreur', 'La facture a ete creee mais son identifiant est introuvable.', 'error');
      },
      error: (err) => {
        Swal.fire('Erreur', err?.error?.message || 'Erreur lors de la creation de la facture.', 'error');
      }
    });
  }

  enregistrerTout(): void {
    if (this.FactureForm.invalid) {
      this.editInfos = true;
      this.FactureForm.markAllAsTouched();
      Swal.fire({ icon: 'warning', title: 'Champs requis', text: 'Veuillez completer les informations de la facture.' });
      return;
    }

    const detailRows = this.extractDetailRows();
    if (!detailRows) {
      return;
    }

    if (this.isCreateMode || !this.factureId) {
      this.createFacture(detailRows);
      return;
    }

    const lignesAModifier: any[] = [];

    detailRows.forEach((produit) => {
      const original = produit.id
        ? this.produitsOriginal.find((item: any) => Number(item?.id || 0) === Number(produit.id))
        : null;

      const payload = {
        id: produit.id,
        facture_id: this.factureId,
        designation: produit.designation,
        qte: Number(produit.qte || 0),
        pu: Number(produit.pu || 0)
      };

      if (!produit.id) {
        lignesAModifier.push({ ...payload, update_mode: 'I' });
        return;
      }

      const hasChanged =
        produit.designation !== String(original?.designation || '') ||
        Number(produit.qte || 0) !== Number(original?.qte || 0) ||
        Number(produit.pu || 0) !== Number(original?.pu || 0);

      if (hasChanged) {
        lignesAModifier.push({ ...payload, update_mode: 'U' });
      }
    });

    if (!lignesAModifier.length) {
      this.persistHeader(true);
      return;
    }

    this.achatsService.saveFactureFournisseurDetails(lignesAModifier).subscribe({
      next: () => {
        this.persistHeader(false, () => {
          this.showNotification(`${lignesAModifier.length} ligne(s) enregistree(s) avec succes.`);
        });
      },
      error: (err) => {
        Swal.fire('Erreur', err?.error?.message || "Erreur lors de l'enregistrement des lignes.", 'error');
      }
    });
  }

  voirFacture(): void {
    if (!this.factureId) {
      Swal.fire({ icon: 'info', title: 'Facture non enregistree', text: "Enregistrez d'abord la facture pour lancer l'impression." });
      return;
    }

    Swal.fire({
      title: 'Generation du PDF...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.achatsService.telechargerPDFFactureFournisseur(this.factureId).subscribe({
      next: (response: Blob) => {
        Swal.close();
        const file = new Blob([response], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        window.open(fileURL, '_blank');
      },
      error: () => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors de la generation du PDF.' });
      }
    });
  }

  showNotification(message: string, isError: boolean = false): void {
    this.successMessage = message;
    this.isError = isError;
    setTimeout(() => { this.successMessage = null; }, 5000);
  }
}
