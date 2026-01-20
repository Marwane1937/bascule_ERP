import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Intervention {
  id?: number;
  numero?: string;
  date: string;
  employe_id: number;
  part_id: number;
  description: string;
  etat: 'EN_COURS' | 'TERMINEE' | 'ANNULEE' | string;
  type?: string;
  technicien?: string;
  client?: string;
  technicien_nom?: string; // Pour compatibilité
  client_nom?: string; // Pour compatibilité
  reparations_count?: number;
  total_cout?: number;
  details?: InterventionDetail[];
  stats?: InterventionStats;

  // Propriétés pour compatibilité
  technicien_id?: number;
  client_id?: number;
  statut?: string;
  date_intervention?: string;
  vehicule_immatriculation?: string; // Gardé pour compatibilité si ajouté plus tard
}

export interface InterventionDetail {
  id?: number;
  intervention_id?: number;
  article_id?: number;
  rubrique_id?: number;
  quantite: number;
  prix: number;
  taux_tva?: number;
  remise?: number;
  description: string;
  ligne?: number;
  cr_date?: string;

  // Propriétés pour compatibilité
  description_reparation?: string;
  cout_main_oeuvre?: number;
  cout_pieces?: number;
  temps_estime?: number;
  date_creation?: string;

  // Propriétés calculées
  rubrique_nom?: string;
  article_nom?: string;
  unite_nom?: string;
  total_ligne?: number;
}

export interface InterventionStats {
  total_reparations: number;
  total_main_oeuvre: number;
  total_pieces: number;
  total_general: number;
  temps_moyen: number;
}

export interface Client {
  part_id: number;
  nom: string;
}

export interface Employe {
  id: number;
  nom: string;
}

export interface Rubrique {
  id: number;
  nom: string;
  code?: string;
  group_id?: number;
}

export interface RubriqueDetail {
  rubrique_id: number;
  quantite: number;
  prix: number;
}

export interface InterventionFormData {
  date: string;
  part_id: number;
  employe_id: number;
  rubriques: RubriqueDetail[];
}

@Injectable({
  providedIn: 'root'
})
export class InterventionService {
  private apiUrl = `${environment.apiUrl}/interventions`;
  private httpHeaders = new HttpHeaders().set('Content-Type', 'application/json');

  constructor(private http: HttpClient) { }

  // Récupérer toutes les interventions
  getInterventions(options: any = {}): Observable<{
    data: Intervention[];
    pagination: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }
  }> {
    const params = this.buildParams(options);
    return this.http.get<{
      data: Intervention[];
      pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }
    }>(`${this.apiUrl}${params}`);
  }

  // Récupérer une intervention par ID
  getIntervention(id: number): Observable<Intervention> {
    return this.http.get<Intervention>(`${this.apiUrl}/${id}`);
  }

  // Créer une intervention
  createIntervention(intervention: Intervention): Observable<any> {
    return this.http.post(this.apiUrl, intervention, { headers: this.httpHeaders });
  }

  // Mettre à jour une intervention
  updateIntervention(id: number, intervention: Partial<Intervention>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, intervention, { headers: this.httpHeaders });
  }

  // Supprimer une intervention
  deleteIntervention(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // Ajouter un détail à une intervention
  addInterventionDetail(interventionId: number, detail: InterventionDetail): Observable<any> {
    return this.http.post(`${this.apiUrl}/${interventionId}/details`, detail, { headers: this.httpHeaders });
  }

  // Mettre à jour un détail
  updateInterventionDetail(detailId: number, detail: InterventionDetail): Observable<any> {
    return this.http.put(`${this.apiUrl}/details/${detailId}`, detail, { headers: this.httpHeaders });
  }

  // Supprimer un détail
  deleteInterventionDetail(detailId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/details/${detailId}`);
  }

  // Récupérer les statistiques
  getInterventionStats(options: any = {}): Observable<{
    total_interventions: number;
    interventions_terminees: number;
    interventions_en_cours: number;
    total_revenus: number;
    reparations_moyennes: number;
  }> {
    const params = this.buildParams(options);
    return this.http.get<{
      total_interventions: number;
      interventions_terminees: number;
      interventions_en_cours: number;
      total_revenus: number;
      reparations_moyennes: number;
    }>(`${this.apiUrl}/stats${params}`);
  }

  // Construire les paramètres de requête
  private buildParams(options: any): string {
    const params = new URLSearchParams();

    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.etat || options.statut) params.append('etat', options.etat || options.statut);
    if (options.employe_id || options.technicien_id) params.append('employe_id', (options.employe_id || options.technicien_id).toString());
    if (options.part_id || options.client_id) params.append('part_id', (options.part_id || options.client_id).toString());
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);

    return params.toString() ? '?' + params.toString() : '';
  }

  // Formater le statut pour l'affichage
  formatStatut(statut: string): { label: string; class: string } {
    const etat = statut || 'EN_COURS';
    switch (etat.toUpperCase()) {
      case 'TERMINEE':
      case 'TERMINE':
      case 'FINI':
        return { label: 'Terminée', class: 'badge bg-success' };
      case 'EN_COURS':
      case 'EN COURS':
      case 'EN_COUR':
        return { label: 'En cours', class: 'badge bg-warning' };
      case 'ANNULEE':
      case 'ANNULER':
      case 'CANCELED':
        return { label: 'Annulée', class: 'badge bg-danger' };
      case 'EN_ATTENTE':
      case 'WAITING':
        return { label: 'En attente', class: 'badge bg-info' };
      default:
        return { label: etat, class: 'badge bg-secondary' };
    }
  }

  // Récupérer la liste des clients
  getClients(): Observable<Client[]> {
    return this.http.get<Client[]>(`${this.apiUrl}/form-data/clients`);
  }

  // Récupérer la liste des employés (techniciens)
  getEmployes(): Observable<Employe[]> {
    return this.http.get<Employe[]>(`${this.apiUrl}/form-data/employes`);
  }

  // Récupérer la liste des rubriques
  getRubriques(): Observable<Rubrique[]> {
    return this.http.get<Rubrique[]>(`${this.apiUrl}/form-data/rubriques`);
  }

  // Créer une intervention avec ses détails
  createInterventionWithDetails(formData: InterventionFormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/with-details`, formData, { headers: this.httpHeaders });
  }

  // Calculer le total d'une intervention
  calculateTotal(details: InterventionDetail[]): number {
    if (!details) return 0;
    return details.reduce((total, detail) =>
      total + (detail.cout_main_oeuvre || 0) + (detail.cout_pieces || 0), 0
    );
  }
}
