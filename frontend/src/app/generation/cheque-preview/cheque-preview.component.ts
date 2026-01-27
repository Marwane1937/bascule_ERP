import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChequeGenerationService } from '../cheque.service';

@Component({
  selector: 'app-cheque-preview',
  templateUrl: './cheque-preview.component.html',
  styleUrls: ['./cheque-preview.component.css']
})
export class ChequePreviewComponent implements OnInit {
  loading = false;

  reglementId: any = 'new';
  docType: 'CHEQUE' | 'EFFET' = 'CHEQUE';
  banques: any[] = [];
  banqueId: number | null = null;
  templates: any[] = [];
  templateId: number | null = null;
  modelImages: string[] = [];
  selectedModelImage: string = 'poste.png';

  template: any = null;
  fields: any[] = [];
  calibration: { id: number; offset_x_mm: number; offset_y_mm: number } = { id: 0, offset_x_mm: 0, offset_y_mm: 0 };

  formData: any = {};

  private units = ['', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf'];
  private teens = ['Dix', 'Onze', 'Douze', 'Treize', 'Quatorze', 'Quinze', 'Seize', 'Dix-sept', 'Dix-huit', 'Dix-neuf'];
  private tens = ['', 'Dix', 'Vingt', 'Trente', 'Quarante', 'Cinquante', 'Soixante', 'Soixante-dix', 'Quatre-vingt', 'Quatre-vingt-dix'];

  constructor(
    private route: ActivatedRoute,
    private chequeService: ChequeGenerationService
  ) { }

  ngOnInit(): void {
    this.chequeService.getModelImages().subscribe({
      next: (imgs) => {
        this.modelImages = Array.isArray(imgs) ? imgs : [];
        if (!this.modelImages.includes(this.selectedModelImage)) {
          this.selectedModelImage = this.modelImages[0] || 'poste.png';
        }
      },
      error: () => {
        this.modelImages = ['poste.png'];
        this.selectedModelImage = 'poste.png';
      }
    });

    this.route.queryParams.subscribe(q => {
      if (q['id']) this.reglementId = q['id'];
      if (q['banqueId']) this.banqueId = parseInt(q['banqueId'], 10);
      if (q['templateId']) this.templateId = parseInt(q['templateId'], 10);
      if (q['docType']) this.docType = (q['docType'] === 'EFFET' ? 'EFFET' : 'CHEQUE');
      this.init();
    });
  }

  private init() {
    this.loading = true;
    this.chequeService.getBanques().subscribe({
      next: (b) => {
        this.banques = b || [];
        if (!this.banqueId && this.banques.length > 0) this.banqueId = this.banques[0].id;
        this.refreshTemplatesAndData();
      },
      error: (err) => {
        this.loading = false;
        alert("Erreur chargement banques.");
      }
    });
  }

  onDocTypeChange() {
    this.templateId = null;
    this.refreshTemplatesAndData();
  }

  onBanqueChange() {
    this.templateId = null;
    this.refreshTemplatesAndData();
  }

  onTemplateChange() {
    this.loadData();
  }

  onReglementChange() {
    this.loadData();
  }

  private refreshTemplatesAndData() {
    if (!this.banqueId) return;
    this.loading = true;

    this.chequeService.getTemplates(this.banqueId, this.docType).subscribe({
      next: (templates) => {
        this.templates = templates || [];
        if (this.templates.length > 0) {
          // Conserver templateId si déjà fourni (query params), sinon premier
          if (!this.templateId || !this.templates.some(t => t.id === this.templateId)) {
            this.templateId = this.templates[0].id;
          }
        }
        this.loadData();
      },
      error: (err) => {
        this.loading = false;
        alert("Erreur chargement modèles.");
      }
    });
  }

  private loadData() {
    if (!this.banqueId) return;

    this.loading = true;
    this.chequeService.loadEditorDataWithTemplate(this.reglementId, this.banqueId, this.templateId, this.docType).subscribe({
      next: (res) => {
        this.template = res.template;
        this.fields = res.fields || [];
        // Calibration désactivée (offsets forcés à 0)
        this.calibration = { id: 0, offset_x_mm: 0, offset_y_mm: 0 };

        this.formData = { ...(res.values || {}) };
        this.formData.banqueId = this.banqueId;
        this.formData.templateId = this.templateId;
        this.formData.docType = this.docType;
        this.formData.montant_chiffres = this.formData.montant;
        this.selectedModelImage = this.pickTemplateImage(this.template?.nom_template);
        this.onMontantChange();

        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        alert("Erreur chargement aperçu.");
      }
    });
  }

  onMontantChange() {
    if (this.formData.montant !== undefined) {
      this.formData.montant_lettres = this.numberToFrench(this.formData.montant);
      this.formData.montant_chiffres = this.formData.montant;
    }
  }

  private numberToFrench(num: number): string {
    if (!num && num !== 0) return '';
    if (num === 0) return 'Zéro Dirhams';
    const str = num.toString();
    const parts = str.split('.');
    const integerPart = parseInt(parts[0], 10);
    const decimalPart = parts[1] ? parseInt(parts[1].substring(0, 2), 10) : 0;

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

  getFieldStyle(fieldName: string): any {
    const field = this.fields.find((f: any) => f.nom_champ === fieldName);
    if (!field) return { display: 'none' };

    const fontStyle = (field.font_style || '').toString().toLowerCase();
    const isBold = !field.font_style || fontStyle.includes('bold') || fontStyle.includes('gras');
    const isItalic = fontStyle.includes('italic') || fontStyle.includes('italique') || fontStyle.includes('oblique');
    const alignRight = ['montant_chiffres', 'date', 'lieu'].includes(fieldName);
    const padRight = fieldName === 'montant_chiffres'; // Padding uniquement pour montant, pas pour lieu/date
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
      // Pas de padding pour lieu/date pour éviter l'espace entre eux
      paddingRight: padRight ? '1mm' : undefined
    };
  }

  getContainerStyle(): any {
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

  print() {
    const targetId = (this.reglementId && this.reglementId !== 'new') ? this.reglementId : 'test';
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
        alert("Erreur impression.");
      }
    });
  }

  private getBackgroundImagePath(): string {
    const img = this.isModelImageKnown(this.selectedModelImage) ? this.selectedModelImage : 'poste.png';
    return `assets/img/generation/${img}`;
  }

  private pickTemplateImage(templateName: string | null | undefined): string {
    const img = this.extractImageFromTemplateName(templateName);
    if (img && this.isModelImageKnown(img)) return img;
    return this.modelImages[0] || 'poste.png';
  }

  private isModelImageKnown(filename: string): boolean {
    return !!filename && (this.modelImages || []).includes(filename);
  }

  private extractImageFromTemplateName(name: string | null | undefined): string | null {
    if (!name) return null;
    const match = name.match(/\[img:([^\]]+)\]/i);
    return match?.[1] ? match[1].trim() : null;
  }
}
