import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
  id: number;
  nom: string;
  login: string;
  group_id: number;
  contact_id: number;
  type: number;
  etat: number | boolean;
  expire: number;
  expire_dat: string;
}

export interface CreateUserRequest {
  nom: string;
  login: string;
  password: string;
  group_id?: number;
  contact_id?: number;
  type?: number;
}

export interface UpdateUserRequest {
  nom: string;
  login: string;
  group_id?: number;
  contact_id?: number;
  type?: number;
  etat?: number;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = environment.apiUrl;
  private httpHeaders = new HttpHeaders().set('Content-Type', 'application/json');

  constructor(private http: HttpClient) { }

  // Récupérer tous les utilisateurs
  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`);
  }

  // Récupérer un utilisateur par ID
  getUserById(id: number): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/${id}`);
  }

  // Créer un nouvel utilisateur
  createUser(userData: CreateUserRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/users`, userData, {
      headers: this.httpHeaders
    });
  }

  // Mettre à jour un utilisateur
  updateUser(id: number, userData: UpdateUserRequest): Observable<any> {
    return this.http.put(`${this.apiUrl}/users/${id}`, userData, {
      headers: this.httpHeaders
    });
  }

  // Supprimer un utilisateur
  deleteUser(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/${id}`);
  }

  // Activer/Désactiver un utilisateur
  toggleUserStatus(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/${id}/toggle-status`, {}, {
      headers: this.httpHeaders
    });
  }

  // Réinitialiser le mot de passe d'un utilisateur
  resetPassword(id: number, newPassword: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/${id}/reset-password`, {
      password: newPassword
    }, {
      headers: this.httpHeaders
    });
  }

  // Changer le mot de passe de l'utilisateur connecté
  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/change-password`, {
      currentPassword,
      newPassword
    }, {
      headers: this.httpHeaders
    });
  }

  // Obtenir les statistiques des utilisateurs
  getUserStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/users/stats`);
  }

  // Rechercher des utilisateurs
  searchUsers(query: string): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users/search?q=${encodeURIComponent(query)}`);
  }

  // Exporter la liste des utilisateurs
  exportUsers(format: 'csv' | 'excel' | 'pdf' = 'csv'): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/users/export?format=${format}`, {
      responseType: 'blob'
    });
  }

  // Importer des utilisateurs depuis un fichier
  importUsers(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post(`${this.apiUrl}/users/import`, formData);
  }

  // Obtenir l'historique des connexions d'un utilisateur
  getUserLoginHistory(id: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users/${id}/login-history`);
  }

  // Bloquer/Débloquer un utilisateur
  blockUser(id: number, reason?: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/${id}/block`, {
      reason: reason || 'Bloqué par un administrateur'
    }, {
      headers: this.httpHeaders
    });
  }

  unblockUser(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/${id}/unblock`, {}, {
      headers: this.httpHeaders
    });
  }

  // Obtenir les permissions d'un utilisateur
  getUserPermissions(id: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users/${id}/permissions`);
  }

  // Mettre à jour les permissions d'un utilisateur
  updateUserPermissions(id: number, permissions: any[]): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/${id}/permissions`, {
      permissions
    }, {
      headers: this.httpHeaders
    });
  }
}
