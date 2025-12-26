import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Notification {
  id: number;
  description: string;
  date: string;
  part_ref?: string;
  part_id?: number;
  employe_id?: number;
  date_alarme?: string;
  emetteur?: string;
  type: number; // 1=INFO, 2=WARNING, 3=ERROR, 4=SUCCESS
  etat: number; // 0=non archivé, 1=archivé
  lire?: number; // 3 = lue
  user_id?: number;
}

export interface NotificationFilters {
  type?: string;
  etat?: string;
  lire?: string;
  dateFrom?: string;
  dateTo?: string;
  includeArchived?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private apiUrl = 'http://localhost:3500/api/notifications';

  constructor(private http: HttpClient) {}

  /**
   * Récupérer les notifications de l'utilisateur connecté
   */
  getNotifications(filters?: NotificationFilters): Observable<any> {
    let params = new HttpParams();
    
    if (filters) {
      if (filters.type) params = params.set('type', filters.type);
      if (filters.etat) params = params.set('etat', filters.etat);
      if (filters.lire) params = params.set('lire', filters.lire);
      if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params = params.set('dateTo', filters.dateTo);
      if (filters.includeArchived) params = params.set('includeArchived', 'true');
    }

    return this.http.get(`${this.apiUrl}`, { params });
  }

  /**
   * Récupérer le nombre de notifications non lues
   */
  getUnreadCount(): Observable<any> {
    return this.http.get(`${this.apiUrl}/unread-count`);
  }

  /**
   * Récupérer les dernières notifications (pour le header)
   */
  getRecentNotifications(limit: number = 5): Observable<any> {
    return this.http.get(`${this.apiUrl}/recent`, {
      params: { limit: limit.toString() }
    });
  }

  /**
   * Récupérer une notification par ID
   */
  getNotificationById(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  /**
   * Marquer une notification comme lue
   */
  markAsRead(id: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/read`, {});
  }

  /**
   * Marquer plusieurs notifications comme lues
   */
  markMultipleAsRead(ids: number[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/mark-read`, { ids });
  }

  /**
   * Archiver une notification
   */
  archive(id: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/archive`, {});
  }

  /**
   * Restaurer une notification archivée
   */
  restore(id: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/restore`, {});
  }

  /**
   * Supprimer une notification
   */
  delete(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  /**
   * Créer une nouvelle notification
   */
  create(data: {
    description: string;
    date?: string;
    part_ref?: string;
    part_id?: number;
    employe_id?: number;
    date_alarme?: string;
    emetteur?: string;
    type?: number; // 1=INFO, 2=WARNING, 3=ERROR, 4=SUCCESS
    user_id?: number;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}`, data);
  }

  /**
   * Mettre à jour le type/priorité d'une notification
   */
  updateType(id: number, type: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/type`, { type });
  }
}

