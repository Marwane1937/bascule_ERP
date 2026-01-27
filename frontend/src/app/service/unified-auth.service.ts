import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface User {
  id: number;
  name: string;
  email: string;
  username: string;
  role: string;
  allowed_databases: string[];
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class UnifiedAuthService {
  private apiUrl = `${environment.apiUrl}/unified-auth`;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    // Vérifier si l'utilisateur est déjà connecté au démarrage
    this.checkStoredAuth();
  }

  // Vérifier l'authentification stockée
  private checkStoredAuth(): void {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        this.currentUserSubject.next(user);
      } catch (error) {
        this.clearAuth();
      }
    }
  }

  // Connexion
  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { username, password })
      .pipe(
        map(response => {
          if (response.success) {
            // Stocker les données
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
            
            this.currentUserSubject.next(response.data.user);
          }
          return response;
        }),
        catchError(error => {
          return throwError(() => error);
        })
      );
  }

  // Déconnexion
  logout(): void {
    this.clearAuth();
  }

  // Nettoyer les données d'authentification
  private clearAuth(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentDatabase');
    this.currentUserSubject.next(null);
  }

  // Vérifier si l'utilisateur est connecté
  isAuthenticated(): boolean {
    const token = localStorage.getItem('token');
    return !!token;
  }

  // Obtenir l'utilisateur actuel
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  // Obtenir le token
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  // Récupérer les informations de l'utilisateur connecté
  getMe(): Observable<User> {
    return this.http.get<{success: boolean, data: User}>(`${this.apiUrl}/me`)
      .pipe(
        map(response => response.data),
        catchError(error => {
          return throwError(() => error);
        })
      );
  }

  // Récupérer les bases de données disponibles
  getAvailableDatabases(): Observable<string[]> {
    return this.http.get<{success: boolean, data: {databases: string[]}}>(`${this.apiUrl}/databases`)
      .pipe(
        map(response => response.data.databases),
        catchError(error => {
          return throwError(() => error);
        })
      );
  }

  // Changer de base de données
  switchDatabase(databaseName: string): Observable<any> {
    return this.http.post<{success: boolean, message: string, data: any}>(`${this.apiUrl}/switch-database`, {
      database_name: databaseName
    })
      .pipe(
        map(response => {
          return response;
        }),
        catchError(error => {
          return throwError(() => error);
        })
      );
  }

  // Obtenir la base de données actuelle
  getCurrentDatabase(): string | null {
    return localStorage.getItem('currentDatabase');
  }

  // Définir la base de données actuelle
  setCurrentDatabase(databaseName: string): void {
    localStorage.setItem('currentDatabase', databaseName);
  }

  // Obtenir le statut de connexion
  getConnectionStatus(): Observable<any> {
    return this.http.get<{success: boolean, data: any}>(`${environment.apiUrl}/database/connection-status`)
      .pipe(
        map(response => response.data),
        catchError(error => {
          return throwError(() => error);
        })
      );
  }
}
