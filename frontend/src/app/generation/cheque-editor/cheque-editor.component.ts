import { Component, HostListener, OnInit, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChequeGenerationService } from '../cheque.service';
import { Router } from '@angular/router';
import { firstValueFrom, forkJoin } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-cheque-editor',
  templateUrl: './cheque-editor.component.html',
  styleUrls: ['./cheque-editor.component.css']
})
export class ChequeEditorComponent implements OnInit {

  loading = false;
  banqueId = 1;
  docType: 'CHEQUE' | 'EFFET' = 'CHEQUE';
  reglementId: any = null;
  designMode = false; // Mode Conception par défaut DÉSACTIVÉ (Sécurité)

  template: any = null;
  fields: any[] = [];
  formData: any = {};

  selectedField: any = null;

  banques: any[] = [];
  templates: any[] = [];
  templateId: number | null = null;
  calibration: { id: number; offset_x_mm: number; offset_y_mm: number; imprimante?: string | null } = { id: 0, offset_x_mm: 0, offset_y_mm: 0, imprimante: null };
  modelImages: string[] = [];
  selectedModelImage: string = 'poste.png';
  zoom = 1;
  showGrid = true;
  snapEnabled = true;
  snapStepMm = 1;
  leftTab: 'data' | 'fields' = 'data';

  // PDF preview avant impression
  showPdfModal = false;
  pdfPreviewObjectUrl: string | null = null;
  pdfPreviewSafeUrl: SafeResourceUrl | null = null;
  pdfLoading = false;

  @ViewChild('previewContainer', { static: false }) previewContainer?: ElementRef<HTMLDivElement>;

  private initializedFromExisting = false;
  private dragging = false;
  private dragField: any = null;
  private dragStartMouseX = 0;
  private dragStartMouseY = 0;
  private dragStartXmm = 0;
  private dragStartYmm = 0;
  private readonly pxPerMm = 96 / 25.4;

  private banquesLoaded = false;
  private pendingRefresh = false;

  private units = ['', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf'];
  private teens = ['Dix', 'Onze', 'Douze', 'Treize', 'Quatorze', 'Quinze', 'Seize', 'Dix-sept', 'Dix-huit', 'Dix-neuf'];
  private tens = ['', 'Dix', 'Vingt', 'Trente', 'Quarante', 'Cinquante', 'Soixante', 'Soixante-dix', 'Quatre-vingt', 'Quatre-vingt-dix'];


  constructor(
    public chequeService: ChequeGenerationService,
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer
  ) { }

  async newCheque() {
    // Confirmation simple pour éviter de perdre la saisie en cours
    const result = await Swal.fire({
      icon: 'question',
      title: 'Nouveau',
      text: 'Créer un nouveau chèque/effet ? Les modifications non enregistrées seront perdues.',
      showCancelButton: true,
      confirmButtonText: 'Oui',
      cancelButtonText: 'Annuler'
    });

    if (!result.isConfirmed) return;

    this.router.navigate(['/generation/editor']);
  }

  ngOnInit(): void {
    // Charger la liste des images-modèles locales (pas de 404)
    this.chequeService.getModelImages().subscribe({
      next: (imgs) => {
        this.modelImages = Array.isArray(imgs) ? imgs : [];
        if (!this.modelImages.includes(this.selectedModelImage)) {
          this.selectedModelImage = this.modelImages[0] || 'poste.png';
        }
      },
      error: () => {
        // Fallback silencieux
        this.modelImages = ['poste.png'];
        this.selectedModelImage = 'poste.png';
      }
    });

    this.chequeService.getBanques().subscribe(data => {
      this.banques = data;
      if (this.banques.length > 0 && !this.banqueId) {
        this.banqueId = this.banques[0].id;
      }
      this.banquesLoaded = true;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        this.refreshTemplatesAndData();
      }
    });

    this.route.params.subscribe(p => {
      if (p['id']) {
        this.reglementId = p['id'];
        this.initializedFromExisting = false;
        this.loadExistingCheque();
      } else {
        this.reglementId = 'new';
        this.initializedFromExisting = true;
        this.refreshTemplatesAndData();
      }
    });
  }

  private loadExistingCheque() {
    // Charger le règlement existant sans forcer banque/template côté front
    this.loading = true;
    this.chequeService.loadExistingEditorData(this.reglementId).subscribe({
      next: (res) => {
        // Banque / template / docType résolus par le backend
        if (res?.banqueId) this.banqueId = res.banqueId;
        const resolvedTemplateId = res?.templateId || res?.template?.id;
        if (resolvedTemplateId) this.templateId = resolvedTemplateId;

        // Déduire le type si possible à partir du nom template
        const name = (res?.template?.nom_template || '').toString().toUpperCase();
        if (name.startsWith('EFFET')) this.docType = 'EFFET';
        if (name.startsWith('CHEQUE')) this.docType = 'CHEQUE';

        // Mettre les données immédiatement (coordonnées OK)
        this.template = res.template;
        this.fields = res.fields || [];
        // Calibration désactivée (offsets forcés à 0)
        this.calibration = { id: 0, offset_x_mm: 0, offset_y_mm: 0, imprimante: null };

        // Image associée au template si présente
        const img = this.extractImageFromTemplateName(this.template?.nom_template);
        if (img && this.isModelImageKnown(img)) {
          this.selectedModelImage = img;
        }

        // Valeurs métier
        const nextValues = { ...(res.values || {}) };
        if (nextValues.montant !== undefined && nextValues.montant_chiffres === undefined) {
          nextValues.montant_chiffres = nextValues.montant;
        }
        this.formData = { ...this.formData, ...nextValues };
        this.formData.banqueId = this.banqueId;
        this.formData.templateId = this.templateId;
        this.formData.docType = this.docType;
        this.formData.templateImage = this.selectedModelImage;
        this.onMontantChange();

        // Charger la liste des templates de cette banque pour le dropdown (sans écraser templateId)
        this.chequeService.getTemplates(this.banqueId, this.docType).subscribe({
          next: (templates) => {
            this.templates = templates || [];
            this.initializedFromExisting = true;
            this.loading = false;
          },
          error: () => {
            this.initializedFromExisting = true;
            this.loading = false;
          }
        });
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors du chargement du chèque existant." });
        // Fallback
        this.refreshTemplatesAndData();
      }
    });
  }

  private refreshTemplatesAndData() {
    if (!this.banquesLoaded) {
      this.pendingRefresh = true;
      return;
    }

    this.loading = true;

    this.chequeService.getTemplates(this.banqueId, this.docType).subscribe({
      next: (templates) => {
        this.templates = templates || [];
        if (this.templates.length > 0) {
          if (!this.templateId || !this.templates.some(t => t.id === this.templateId)) {
            this.templateId = this.templates[0].id;
          }
        } else {
          this.templateId = null;
        }

        this.loadData();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur chargement des modèles." });
      }
    });
  }

  loadData() {
    this.loading = true;
    this.chequeService.loadEditorDataWithTemplate(this.reglementId, this.banqueId, this.templateId, this.docType).subscribe({
      next: (res) => {
        this.template = res.template;
        this.fields = res.fields || [];
        // Calibration désactivée (offsets forcés à 0)
        this.calibration = { id: 0, offset_x_mm: 0, offset_y_mm: 0, imprimante: null };

        // Lire l'image associée au template (stockée dans nom_template)
        const img = this.extractImageFromTemplateName(this.template?.nom_template);
        if (img && this.isModelImageKnown(img)) {
          this.selectedModelImage = img;
        } else if (!this.isModelImageKnown(this.selectedModelImage)) {
          this.selectedModelImage = this.modelImages[0] || 'poste.png';
        }

        // Valeurs + normalisation pour l'impression
        const nextValues = { ...(res.values || {}) };
        if (nextValues.montant !== undefined && nextValues.montant_chiffres === undefined) {
          nextValues.montant_chiffres = nextValues.montant;
        }

        this.formData = { ...this.formData, ...nextValues };

        // Métadonnées utiles à l'impression
        this.formData.banqueId = this.banqueId;
        this.formData.templateId = this.templateId;
        this.formData.docType = this.docType;
        this.formData.templateImage = this.selectedModelImage;

        this.onMontantChange();
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors du chargement." });
      }
    });
  }

  onBankChange() {
    this.selectedField = null;
    this.refreshTemplatesAndData();
  }

  onDocTypeChange() {
    this.selectedField = null;
    this.templateId = null;
    this.refreshTemplatesAndData();
  }

  onTemplateChange() {
    this.selectedField = null;
    this.loadData();
  }

  onFieldMouseDown(field: any, event: MouseEvent) {
    if (!this.designMode) return;
    if (!field) return;

    event.preventDefault();
    event.stopPropagation();

    this.dragging = true;
    this.dragField = field;
    this.selectedField = field;
    this.dragStartMouseX = event.clientX;
    this.dragStartMouseY = event.clientY;
    this.dragStartXmm = Number(field.x_mm || 0);
    this.dragStartYmm = Number(field.y_mm || 0);
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent) {
    if (!this.dragging || !this.dragField) return;

    const dxPx = event.clientX - this.dragStartMouseX;
    const dyPx = event.clientY - this.dragStartMouseY;
    const dxMm = dxPx / (this.pxPerMm * (this.zoom || 1));
    const dyMm = dyPx / (this.pxPerMm * (this.zoom || 1));

    let nextX = this.dragStartXmm + dxMm;
    let nextY = this.dragStartYmm + dyMm;

    if (this.snapEnabled && this.snapStepMm > 0) {
      nextX = Math.round(nextX / this.snapStepMm) * this.snapStepMm;
      nextY = Math.round(nextY / this.snapStepMm) * this.snapStepMm;
    }

    this.dragField.x_mm = Math.max(0, Number(nextX.toFixed(2)));
    this.dragField.y_mm = Math.max(0, Number(nextY.toFixed(2)));
  }

  @HostListener('window:mouseup')
  onWindowMouseUp() {
    if (!this.dragging || !this.dragField) return;

    const field = this.dragField;
    this.dragging = false;
    this.dragField = null;

    // Auto-save X/Y après déplacement (uniquement mode conception)
    if (this.designMode && field?.id) {
      this.chequeService.saveFieldConfig(field.id, {
        x: field.x_mm,
        y: field.y_mm,
        w: field.largeur_mm,
        h: field.hauteur_mm,
        fontSize: field.font_size,
        font: field.font,
        fontStyle: field.font_style,
        obligatoire: field.obligatoire
      }).subscribe({
        next: () => { },
        error: () => { }
      });
    }
  }

  onFieldHover(fieldName: string) {
    if (!this.designMode) return; // INTERDICTION de modifier si pas en mode Design

    if (!this.fields) return;
    const f = this.fields.find((field: any) => field.nom_champ === fieldName);
    if (f) {
      this.selectedField = f;
    }
  }

  getField(fieldName: string): any {
    if (!this.fields) return null;
    return this.fields.find((f: any) => f.nom_champ === fieldName) || null;
  }

  selectField(field: any) {
    this.selectedField = field;
  }

  getFieldLabel(field: any): string {
    const name = field?.nom_champ || '';
    const map: any = {
      date: 'Date',
      lieu: 'Lieu',
      beneficiaire: 'Bénéficiaire',
      montant_chiffres: 'Montant (chiffres)',
      montant_lettres: 'Montant (lettres)',
      numero: 'Numéro',
      paye_pour: 'Payé pour'
    };
    return map[name] || name;
  }

  getFieldPreviewValue(field: any): string {
    const key = field?.nom_champ;
    if (!key) return '';
    switch (key) {
      case 'montant_chiffres':
        return this.formatAmountForCheque(this.formData.montant);
      case 'montant_lettres':
        return this.formatMontantLettres(this.formData.montant_lettres || '');
      case 'date':
        return this.formData.date ? new Date(this.formData.date).toLocaleDateString('fr-FR') : '';
      case 'lieu':
        // Ajouter un espace après le lieu pour séparer lieu et date (sans virgule)
        let lieuStr = (this.formData.lieu || '').trim();
        // Supprimer toute virgule existante à la fin du lieu
        lieuStr = lieuStr.replace(/,\s*$/, '').trim();
        return lieuStr ? lieuStr + ' ' : ''; // Espace simple après le lieu (sans virgule)
      case 'beneficiaire':
        return this.formData.beneficiaire || '';
      case 'paye_pour':
        return this.formData.paye_pour || '';
      case 'numero':
        return this.formData.numero || '';
      default:
        return String(this.formData[key] ?? '');
    }
  }

  private formatAmountForCheque(amount: any): string {
    const n = Number((amount ?? 0).toString().replace(/\s/g, '').replace(',', '.'));
    if (Number.isNaN(n)) return `#${amount}#`;
    const fixed = n.toFixed(2); // "1234.50"
    const [intPartRaw, decPart] = fixed.split('.');
    const intPart = intPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `#${intPart},${decPart}#`;
  }

  private formatMontantLettres(text: string): string {
    const t = (text ?? '').toString().trim();
    return t ? `***${t}***` : '';
  }

  getConfigPanelStyle(): any {
    if (!this.selectedField) return { display: 'none' };
    // Panel positionné approximativement (UI), les champs eux restent en mm dans le rendu
    const mmToPx = 3.78;
    let top = ((this.selectedField.y_mm || 0) * mmToPx) + 25;
    let left = ((this.selectedField.x_mm || 0) * mmToPx) + 10;
    if (left > 550) left = 550;
    if (top > 200) top = 200;

    return {
      top: `${top}px`,
      left: `${left}px`,
      display: 'block'
    };
  }

  saveGlobalModel() {
    // Sauvegarde uniquement la structure du modèle (ChequeTemplate/Banque)
    if (!this.fields || this.fields.length === 0) return;
    this.loading = true;
    let completed = 0;

    this.fields.forEach(field => {
      this.chequeService.saveFieldConfig(field.id, {
        x: field.x_mm,
        y: field.y_mm,
        w: field.largeur_mm,
        h: field.hauteur_mm,
        fontSize: field.font_size,
        font: field.font,
        fontStyle: field.font_style,
        obligatoire: field.obligatoire
      }).subscribe({
        next: () => {
          completed++;
          if (completed === this.fields.length) {
            // Sauvegarder aussi l'image choisie dans le template
            const templateId = this.templateId;
            if (templateId) {
              const newName = this.injectImageIntoTemplateName(this.template?.nom_template, this.selectedModelImage);
              this.chequeService.updateTemplate(templateId, { nom_template: newName }).subscribe({
                next: () => {
                  this.loading = false;
                  Swal.fire({ icon: 'success', title: 'Succès', text: 'Modèle sauvegardé (positions + image) !' });
                },
                error: () => {
                  this.loading = false;
                  Swal.fire({ icon: 'warning', title: 'Attention', text: 'Positions sauvegardées, mais erreur sauvegarde image modèle.' });
                }
              });
            } else {
              this.loading = false;
              Swal.fire({ icon: 'success', title: 'Succès', text: 'Modèle (Positions) sauvegardé !' });
            }
          }
        },
        error: () => completed++
      });
    });
  }

  saveData() {
    // Sauvegarde uniquement les DONNÉES du chèque (RegleSettings)
    const targetId = (this.reglementId && this.reglementId !== 'new') ? this.reglementId : 'new';
    this.loading = true;

    const payload = { ...this.formData, banqueId: this.banqueId };

    this.chequeService.saveChequeData(targetId, payload).subscribe({
      next: (res) => {
        this.loading = false;
        Swal.fire({ icon: 'success', title: 'Succès', text: res?.message || 'Enregistré.' });
        if (res.id && targetId === 'new') {
          this.reglementId = res.id;
        }
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur enregistrement." });
      }
    });
  }

  goToPreview() {
    const id = (this.reglementId && this.reglementId !== 'new') ? this.reglementId : 'test';
    this.router.navigate(['/generation/preview'], {
      queryParams: {
        id,
        banqueId: this.banqueId,
        templateId: this.templateId,
        docType: this.docType
      }
    });
  }

  printNow() {
    const targetId = (this.reglementId && this.reglementId !== 'new') ? this.reglementId : 'test';

    // Normaliser les clés nécessaires à l'impression
    this.formData.banqueId = this.banqueId;
    this.formData.templateId = this.templateId;
    this.formData.docType = this.docType;
    this.formData.montant_chiffres = this.formData.montant;

    this.chequeService.generatePDF(targetId, false, this.formData).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.src = url;

        iframe.onload = () => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } finally {
            setTimeout(() => {
              window.URL.revokeObjectURL(url);
              iframe.remove();
            }, 30000);
          }
        };

        document.body.appendChild(iframe);
      },
      error: (err) => {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de l'impression." });
      }
    });
  }

  // compat ancien template html (si un bouton l'appelle encore)
  printCheque() {
    this.printNow();
  }

  // --- Logic Metier Conversion ---
  private numberToFrench(num: number): string {
    if (!num && num !== 0) return '';
    if (num === 0) return 'Zéro Dirhams';
    const str = num.toString();
    const parts = str.split('.');
    let integerPart = parseInt(parts[0], 10);
    let decimalPart = parts[1] ? parseInt(parts[1].substring(0, 2), 10) : 0;

    let text = this.convertInteger(integerPart) + ' Dirhams';
    if (decimalPart > 0) text += ' et ' + this.convertInteger(decimalPart) + ' Centimes';
    return text;
  }

  private convertInteger(n: number): string {
    if (n === 0) return '';
    if (n < 10) return this.units[n];
    if (n < 20) return this.teens[n - 10];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const unit = n % 10;
      if (ten === 7 || ten === 9) return this.tens[ten - 1] + (unit === 1 ? '-et-Onze' : '-' + this.teens[unit]);
      return this.tens[ten] + (unit > 0 ? (unit === 1 ? '-et-Un' : '-' + this.units[unit]) : '');
    }
    if (n < 1000) {
      const hundred = Math.floor(n / 100);
      const rest = n % 100;
      return (hundred === 1 ? 'Cent' : this.units[hundred] + ' Cents') + (rest > 0 ? ' ' + this.convertInteger(rest) : '');
    }
    if (n < 1000000) {
      const thousand = Math.floor(n / 1000);
      const rest = n % 1000;
      return (thousand === 1 ? 'Mille' : this.convertInteger(thousand) + ' Mille') + (rest > 0 ? ' ' + this.convertInteger(rest) : '');
    }
    return n.toString();
  }

  onMontantChange() {
    if (this.formData.montant !== undefined) {
      this.formData.montant_lettres = this.numberToFrench(this.formData.montant);
      this.formData.montant_chiffres = this.formData.montant;
    }
  }

  getFieldStyle(fieldName: string): any {
    const field = this.fields.find((f: any) => f.nom_champ === fieldName);
    if (!field) return { display: 'none' };

    const fontStyle = (field.font_style || '').toString().toLowerCase();
    const isBold = !field.font_style || fontStyle.includes('bold') || fontStyle.includes('gras');
    const isItalic = fontStyle.includes('italic') || fontStyle.includes('italique') || fontStyle.includes('oblique');
    const alignRight = ['montant_chiffres', 'date', 'lieu'].includes(fieldName);
    const padRight = fieldName === 'montant_chiffres';
    const widthMm = field.largeur_mm ? `${field.largeur_mm}mm` : (alignRight ? '40mm' : 'auto');

    return {
      position: 'absolute',
      left: `calc(${(field.x_mm || 0)}mm + ${(this.calibration?.offset_x_mm || 0)}mm)`,
      top: `calc(${(field.y_mm || 0)}mm + ${(this.calibration?.offset_y_mm || 0)}mm)`,
      width: widthMm,
      height: field.hauteur_mm ? `${field.hauteur_mm}mm` : 'auto',
      fontSize: `${(field.font_size || 12)}pt`,
      fontWeight: isBold ? 'bold' : 'normal',
      fontStyle: isItalic ? 'italic' : 'normal',
      fontFamily: field.font ? `'${field.font}', sans-serif` : "'Helvetica', Arial, sans-serif",
      whiteSpace: 'nowrap',
      display: 'block',
      textAlign: alignRight ? 'right' : 'left',
      // Padding uniquement pour le montant (évite les "espaces" visuels entre lieu/date)
      paddingRight: padRight ? '1mm' : undefined
    };
  }

  async saveAll() {
    if (this.loading) return;
    this.loading = true;

    try {
      const targetId = (this.reglementId && this.reglementId !== 'new') ? this.reglementId : 'new';
      const payload = { ...this.formData, banqueId: this.banqueId, templateId: this.templateId };

      const res: any = await firstValueFrom(this.chequeService.saveChequeData(targetId, payload));
      if (res?.id && targetId === 'new') {
        this.reglementId = res.id;
      }
      // regle_ref (formData.numero) est statique: ne pas le remplacer par un compteur

      if (this.designMode) {
        await this.saveModelOnly(true);
      }

      Swal.fire({
        icon: 'success',
        title: 'Succès',
        text: this.designMode ? 'Enregistré (données + modèle).' : (res?.message || 'Enregistré.')
      });
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur enregistrement.' });
    } finally {
      this.loading = false;
    }
  }

  async openPrintPreview() {
    if (this.pdfLoading) return;

    const targetId = (this.reglementId && this.reglementId !== 'new') ? this.reglementId : 'test';

    // Toujours pré-calculer (montant_lettres)
    this.onMontantChange();

    this.formData.banqueId = this.banqueId;
    this.formData.templateId = this.templateId;
    this.formData.docType = this.docType;
    this.formData.montant_chiffres = this.formData.montant;

    this.pdfLoading = true;
    try {
      const blob = await firstValueFrom(this.chequeService.generatePDF(targetId, true, this.formData));
      this.closePdfModal(true);
      this.pdfPreviewObjectUrl = window.URL.createObjectURL(blob);
      this.pdfPreviewSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfPreviewObjectUrl);
      this.showPdfModal = true;
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur génération aperçu PDF." });
    } finally {
      this.pdfLoading = false;
    }
  }

  async printFromPreview() {
    // Générer le PDF final (qui marque imprimé) puis lancer le print navigateur
    const targetId = (this.reglementId && this.reglementId !== 'new') ? this.reglementId : 'test';
    this.onMontantChange();

    this.formData.banqueId = this.banqueId;
    this.formData.templateId = this.templateId;
    this.formData.docType = this.docType;
    this.formData.montant_chiffres = this.formData.montant;

    this.pdfLoading = true;
    try {
      const blob = await firstValueFrom(this.chequeService.generatePDF(targetId, false, this.formData));
      const url = window.URL.createObjectURL(blob);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(() => {
            window.URL.revokeObjectURL(url);
            iframe.remove();
          }, 30000);
        }
      };

      document.body.appendChild(iframe);
      this.closePdfModal(true);
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur impression." });
    } finally {
      this.pdfLoading = false;
    }
  }

  closePdfModal(revoke: boolean = true) {
    this.showPdfModal = false;
    if (revoke && this.pdfPreviewObjectUrl) {
      window.URL.revokeObjectURL(this.pdfPreviewObjectUrl);
    }
    this.pdfPreviewObjectUrl = null;
    this.pdfPreviewSafeUrl = null;
  }

  private async saveModelOnly(silent: boolean) {
    if (!this.fields || this.fields.length === 0) return;

    const requests = this.fields.map(field => this.chequeService.saveFieldConfig(field.id, {
      x: field.x_mm,
      y: field.y_mm,
      w: field.largeur_mm,
      h: field.hauteur_mm,
      fontSize: field.font_size,
      font: field.font,
      fontStyle: field.font_style,
      obligatoire: field.obligatoire
    }));

    await firstValueFrom(forkJoin(requests));

    if (this.templateId) {
      const newName = this.injectImageIntoTemplateName(this.template?.nom_template, this.selectedModelImage);
      await firstValueFrom(this.chequeService.updateTemplate(this.templateId, {
        nom_template: newName,
        largeur_mm: this.template?.largeur_mm,
        hauteur_mm: this.template?.hauteur_mm
      }));
    }

    if (!silent) Swal.fire({ icon: 'success', title: 'Succès', text: 'Modèle sauvegardé.' });
  }

  private getBackgroundImagePath(): string {
    // Ne jamais construire une URL vers un fichier qui n'existe pas: on se base sur models.json
    const img = this.isModelImageKnown(this.selectedModelImage) ? this.selectedModelImage : 'poste.png';
    return `assets/img/generation/${img}`;
  }

  onModelImageChange() {
    if (!this.isModelImageKnown(this.selectedModelImage)) {
      this.selectedModelImage = this.modelImages[0] || 'poste.png';
    }
    this.formData.templateImage = this.selectedModelImage;
  }

  private isModelImageKnown(filename: string): boolean {
    return !!filename && (this.modelImages || []).includes(filename);
  }

  private extractImageFromTemplateName(name: string | null | undefined): string | null {
    if (!name) return null;
    const match = name.match(/\[img:([^\]]+)\]/i);
    return match?.[1] ? match[1].trim() : null;
  }

  private injectImageIntoTemplateName(name: string | null | undefined, filename: string): string {
    const base = (name || '').replace(/\[img:[^\]]+\]/i, '').trim();
    const clean = filename ? filename.trim() : 'poste.png';
    return `${base} [img:${clean}]`.trim();
  }

  getContainerStyle(): any {
    // L'éditeur doit respecter les dimensions du modèle (image support)
    const w = this.template?.largeur_mm || 175;
    const h = this.template?.hauteur_mm || 80;
    const bgImage = this.getBackgroundImagePath();

    return {
      width: `${w}mm`,
      height: `${h}mm`,
      position: 'relative',
      backgroundImage: bgImage ? `url(${bgImage})` : 'none',
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat'
    };
  }
}
