import { Component, OnInit } from '@angular/core';
import { AuthService, Societe } from '../../service/auth.service';


@Component({
  selector: 'app-societe-management',
  templateUrl: './societe-management.component.html',
  styleUrls: ['./societe-management.component.css']
})
export class SocieteManagementComponent implements OnInit {
  societes: Societe[] = [];
  selectedSociete: Societe | null = null;
  isLoading = false;
  successMessage = '';
  errorMessage = '';

  // Formulaire pour les documents
  documentForm = {
    entete: '',
    pied_page: '',
    logo: null as File | null
  };
  logoPreview: string | null = null;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.loadSocietes();
  }

  loadSocietes(): void {
    this.isLoading = true;
    this.authService.getAllSocietes().subscribe({
      next: (societes) => {
        this.societes = societes;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erreur chargement sociétés:', error);
        this.errorMessage = 'Erreur lors du chargement des sociétés';
        this.isLoading = false;
      }
    });
  }

  selectSociete(societe: Societe): void {
    this.selectedSociete = societe;
    this.documentForm = {
      entete: societe.documentSociete?.entete || '',
      pied_page: societe.documentSociete?.pied_page || '',
      logo: null
    };
    this.logoPreview = societe.documentSociete?.logo || null;
    this.errorMessage = '';
    this.successMessage = '';
  }

  onLogoSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.documentForm.logo = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.logoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  saveDocuments(): void {
    if (!this.selectedSociete) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formData = new FormData();
    formData.append('entete', this.documentForm.entete);
    formData.append('pied_page', this.documentForm.pied_page);
    if (this.documentForm.logo) {
      formData.append('logo', this.documentForm.logo);
    }

    this.authService.updateDocumentSociete(formData)
      .subscribe({
        next: (response: any) => {
          this.successMessage = 'Documents sauvegardés avec succès !';
          this.isLoading = false;
          this.loadSocietes(); // Recharger la liste
        },
        error: (error) => {
          console.error('Erreur sauvegarde documents:', error);
          this.errorMessage = error.error?.message || 'Erreur lors de la sauvegarde';
          this.isLoading = false;
        }
      });
  }

  resetForm(): void {
    this.documentForm = {
      entete: '',
      pied_page: '',
      logo: null
    };
    this.logoPreview = null;
    this.selectedSociete = null;
    this.errorMessage = '';
    this.successMessage = '';
  }
}
