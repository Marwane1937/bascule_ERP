import { Injectable } from '@angular/core';
import { PermissionsService } from './permissions.service';

export type PdfType = 'devis' | 'livraison' | 'facturation' | 'commande' | 'avoir' | 'retour' 
  | 'demande_achat' | 'bon_commande' | 'facture_fournisseur' | 'reception';

@Injectable({
  providedIn: 'root'
})
export class PdfPermissionsService {
  
  constructor(private permissionsService: PermissionsService) {}

  /**
   * Vérifie si l'utilisateur peut accéder à un type de PDF avec un mode spécifique
   */
  canAccessPdf(pdfType: PdfType, printMode: 'normal' | 'nomenclature' | 'non_valorise' = 'normal'): boolean {
    let permissionName: string;
    
    if (pdfType === 'devis') {
      if (printMode === 'nomenclature') {
        permissionName = 'pdf_devis_nomenclature';
      } else {
        permissionName = 'pdf_devis_normal';
      }
    } else if (pdfType === 'livraison') {
      if (printMode === 'non_valorise') {
        permissionName = 'pdf_livraison_non_valorise';
      } else {
        permissionName = 'pdf_livraison_normal';
      }
    } else {
      // Pour tous les autres types, utiliser le format pdf_[type]_normal
      permissionName = `pdf_${pdfType}_normal`;
    }
    
    return this.permissionsService.hasPermission(permissionName);
  }

  /**
   * Vérifie si l'utilisateur peut accéder à au moins un mode d'un type de PDF
   */
  hasAnyPdfAccess(pdfType: PdfType): boolean {
    if (pdfType === 'devis') {
      return this.permissionsService.hasPermission('pdf_devis_normal') || 
             this.permissionsService.hasPermission('pdf_devis_nomenclature');
    } else if (pdfType === 'livraison') {
      return this.permissionsService.hasPermission('pdf_livraison_normal') || 
             this.permissionsService.hasPermission('pdf_livraison_non_valorise');
    } else {
      return this.permissionsService.hasPermission(`pdf_${pdfType}_normal`);
    }
  }
}

