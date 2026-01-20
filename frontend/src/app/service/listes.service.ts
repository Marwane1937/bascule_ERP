import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Liste {
  id: number;
  code: string;
  nom: string;
  group_id: number;
}

export interface GroupId {
  group_id: number;
  group_nom: string;
}

@Injectable({
  providedIn: 'root'
})
export class ListesService {
  private apiUrl = `${environment.apiUrl}/listes`;
  private httpHeaders = new HttpHeaders().set('Content-Type', 'application/json');

  constructor(private http: HttpClient) {}

  // Récupérer tous les group_id distincts
  getAllGroupIds(): Observable<GroupId[]> {
    return this.http.get<GroupId[]>(`${this.apiUrl}/group-ids`);
  }

  // Récupérer les listes par group_id
  getListesByGroupId(group_id: number): Observable<Liste[]> {
    return this.http.get<Liste[]>(`${this.apiUrl}/group/${group_id}`);
  }

  // Récupérer une liste par ID
  getListeById(id: number): Observable<Liste> {
    return this.http.get<Liste>(`${this.apiUrl}/${id}`);
  }

  // Créer une nouvelle liste
  createListe(listeData: { code: string; nom: string; group_id: number }): Observable<any> {
    return this.http.post(`${this.apiUrl}`, listeData, {
      headers: this.httpHeaders
    });
  }

  // Mettre à jour une liste
  updateListe(id: number, listeData: { code: string; nom: string; group_id: number }): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, listeData, {
      headers: this.httpHeaders
    });
  }

  // Supprimer une liste
  deleteListe(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}

