import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface UserPermission {
  id?: number;
  user_id: number;
  menu_item: string;
  access: number | boolean | string; // 0/1, true/false, ou '0'/'1' = pas d'accès, 1/true/'1' = accès activé
}

export interface MenuItem {
  name: string;
  route: string;
}

export interface MenuCategory {
  category: string;
  icon: string;
  items: MenuItem[];
}

@Injectable({
  providedIn: 'root'
})
export class UserPermissionsService {
  private apiUrl = 'http://localhost:3500/api/user-permissions';
  private httpHeaders = new HttpHeaders().set('Content-Type', 'application/json');

  constructor(private http: HttpClient) {}

  // Récupérer les permissions d'un utilisateur
  getUserPermissions(userId: number): Observable<{ success: boolean; data: UserPermission[] }> {
    return this.http.get<{ success: boolean; data: UserPermission[] }>(`${this.apiUrl}/${userId}`);
  }

  // Mettre à jour les permissions d'un utilisateur
  updateUserPermissions(userId: number, permissions: UserPermission[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/${userId}`, { permissions }, {
      headers: this.httpHeaders
    });
  }

  // Obtenir les menu items disponibles
  getAvailableMenuItems(): Observable<{ success: boolean; data: MenuCategory[] }> {
    return this.http.get<{ success: boolean; data: MenuCategory[] }>(`${this.apiUrl}/menu-items`);
  }

  // Déconnecter un utilisateur
  disconnectUser(userId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${userId}/disconnect`, {}, {
      headers: this.httpHeaders
    });
  }
}

