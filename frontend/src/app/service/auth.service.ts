import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface User {
  id: number;
  nom: string;
  login: string;
  type: number;
  etat: number;
}

export interface DocumentSociete {
  id: number;
  logo: string | null;
  entete: string | null;
  pied_page: string | null;
}

export interface Societe {
  id: number;
  nom: string;
  nom_base: string;
  actif: boolean;
  documentSociete?: DocumentSociete;
}

export interface UserPermission {
  id?: number;
  user_id: number;
  menu_item: string;
  access: number | boolean; // Peut être un nombre (0/1) ou un booléen (true/false)
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
    permissions?: UserPermission[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:3500/api/auth';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private documentSocieteSubject = new BehaviorSubject<DocumentSociete | null>(null);
  private currentSocieteSubject = new BehaviorSubject<Societe | null>(null);
  private userPermissionsSubject = new BehaviorSubject<UserPermission[]>([]);

  public currentUser$ = this.currentUserSubject.asObservable();
  public documentSociete$ = this.documentSocieteSubject.asObservable();
  public currentSociete$ = this.currentSocieteSubject.asObservable();
  public userPermissions$ = this.userPermissionsSubject.asObservable();

  constructor(private http: HttpClient) {
    // Vérifier si l'utilisateur est déjà connecté au démarrage
    this.checkStoredAuth();
  }

  // Vérifier l'authentification stockée
  private checkStoredAuth(): void {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const documentStr = localStorage.getItem('documentSociete');
    const currentSocieteStr = localStorage.getItem('currentSociete');
    const permissionsStr = localStorage.getItem('userPermissions');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        this.currentUserSubject.next(user);

        if (documentStr) {
          const document = JSON.parse(documentStr);
          this.documentSocieteSubject.next(document);
        }

        if (currentSocieteStr) {
          try {
            const societe = JSON.parse(currentSocieteStr);
            this.currentSocieteSubject.next(societe);
          } catch { }
        }

        if (permissionsStr) {
          try {
            const permissions = JSON.parse(permissionsStr);
            this.userPermissionsSubject.next(permissions);
          } catch (error) {
            console.error('❌ [AuthService] Erreur parsing permissions:', error);
          }
        } else {
          console.warn('⚠️ [AuthService] Aucune permission trouvée dans localStorage');
        }
      } catch (error) {
        console.error('Erreur parsing données stockées:', error);
        this.clearAuth();
      }
    }
  }

  // Connexion
  login(login: string, password: string, societeId?: number, databaseName?: string): Observable<LoginResponse> {
    // Récupérer le nom de la base de données depuis localStorage si disponible
    const savedDatabaseName = localStorage.getItem('currentDatabaseName');
    const databaseNameToUse = databaseName || savedDatabaseName;
    
    // Récupérer la société sélectionnée si disponible
    const currentSociete = this.currentSocieteSubject.value;
    const societeIdToUse = societeId || currentSociete?.id;
    
    // Préparer les headers avec l'ID de la société si disponible
    let headers = new HttpHeaders();
    if (societeIdToUse) {
      headers = headers.set('x-societe-id', societeIdToUse.toString());
    }
    
    // Préparer le body avec l'ID de la société et le nom de la base
    const body: any = { login, password };
    if (societeIdToUse) {
      body.societe_id = societeIdToUse;
    }
    if (databaseNameToUse) {
      body.database_name = databaseNameToUse;
    }
    
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, body, { headers })
      .pipe(
        map(response => {
          if (response.success) {
            // Stocker les données
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
            
            // Stocker le nom de la base de données si fourni
            if (databaseNameToUse) {
              localStorage.setItem('currentDatabaseName', databaseNameToUse);
            }

            // Stocker les permissions si disponibles
            if (response.data.permissions && Array.isArray(response.data.permissions) && response.data.permissions.length > 0) {
              localStorage.setItem('userPermissions', JSON.stringify(response.data.permissions));
              this.userPermissionsSubject.next(response.data.permissions);
            } else {
              // Si l'utilisateur est admin, ce n'est pas grave s'il n'y a pas de permissions
              // car le frontend autorise tout pour les admins
              // Stocker un tableau vide pour éviter les erreurs
              localStorage.setItem('userPermissions', JSON.stringify([]));
              this.userPermissionsSubject.next([]);
            }

            this.currentUserSubject.next(response.data.user);
          }
          return response;
        }),
        catchError(error => {
          console.error('[AuthService] ❌ Erreur de connexion:', error);
          console.error('[AuthService] Status:', error.status);
          console.error('[AuthService] StatusText:', error.statusText);
          console.error('[AuthService] Error body:', error.error);
          console.error('[AuthService] ========================================');
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
    localStorage.removeItem('userPermissions');
    // IMPORTANT: éviter que currentSociete (souvent base mère) écrase currentDatabaseName dans l'interceptor
    localStorage.removeItem('currentSociete');
    localStorage.removeItem('currentSocieteId');
    this.currentUserSubject.next(null);
    this.documentSocieteSubject.next(null);
    this.currentSocieteSubject.next(null);
    this.userPermissionsSubject.next([]);
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

  // Obtenir les documents de la société
  getDocumentSociete(): DocumentSociete | null {
    return this.documentSocieteSubject.value;
  }

  // Récupérer les informations de l'utilisateur connecté
  getMe(): Observable<User> {
    return this.http.get<{ success: boolean, data: User }>(`${this.apiUrl}/me`)
      .pipe(
        map(response => response.data),
        catchError(error => {
          console.error('Erreur récupération utilisateur:', error);
          return throwError(() => error);
        })
      );
  }

  // Récupérer les documents de la société
  getDocumentSocieteFromServer(): Observable<DocumentSociete> {
    return this.http.get<{ success: boolean, data: DocumentSociete }>(`${this.apiUrl}/document-societe`)
      .pipe(
        map(response => response.data),
        catchError(error => {
          console.error('Erreur récupération documents société:', error);
          return throwError(() => error);
        })
      );
  }

  // Mettre à jour les documents de la société (accepte FormData ou Partial<DocumentSociete>)
  updateDocumentSociete(documentData: FormData | Partial<DocumentSociete>): Observable<DocumentSociete> {
    return this.http.post<{ success: boolean, data: DocumentSociete }>(`http://localhost:3500/api/document-societe/`, documentData)
      .pipe(
        map(response => {
          this.documentSocieteSubject.next(response.data);
          localStorage.setItem('documentSociete', JSON.stringify(response.data));
          return response.data;
        }),
        catchError(error => {
          console.error('Erreur mise à jour documents société:', error);
          return throwError(() => error);
        })
      );
  }

  // Récupérer toutes les sociétés
  getAllSocietes(): Observable<Societe[]> {
    return this.http.get<{ success: boolean, data: Societe[] }>(`http://localhost:3500/api/societes`)
      .pipe(
        map(response => response.data),
        catchError(error => {
          console.error('Erreur récupération sociétés:', error);
          return throwError(() => error);
        })
      );
  }

  // Récupérer toutes les bases de données disponibles
  getAvailableDatabases(): Observable<Societe[]> {
    return this.http.get<{ success: boolean, data: Societe[] }>(`http://localhost:3500/api/societes/available-databases`)
      .pipe(
        map(response => {
          return response.data;
        }),
        catchError(error => {
          console.error('[AuthService] ❌ Erreur récupération bases de données:', error);
          console.error('[AuthService] Status:', error.status);
          console.error('[AuthService] Error body:', error.error);
          return throwError(() => error);
        })
      );
  }

  // Changer de société/base de données (ancienne méthode - gardée pour compatibilité)
  switchDatabase(societeId?: number, databaseName?: string): Observable<any> {
    return this.http.post<{ success: boolean, message: string, data: any }>(`http://localhost:3500/api/societes/switch-database`, {
      societe_id: societeId,
      database_name: databaseName
    })
      .pipe(
        map(response => {
          return response;
        }),
        catchError(error => {
          console.error('❌ Erreur changement de base de données:', error);
          return throwError(() => error);
        })
      );
  }

  // Récupérer les bases de données depuis la table db
  getDatabasesFromTable(): Observable<any[]> {
    return this.http.get<{ success: boolean, data: any[] }>(`http://localhost:3500/api/database/list-databases`)
      .pipe(
        map(response => {
          return response.data || [];
        }),
        catchError(error => {
          console.error('[AuthService] ❌ Erreur récupération bases depuis table db:', error);
          return throwError(() => error);
        })
      );
  }

  // Changer de base de données avec db_id (nouvelle méthode)
  switchDatabaseByDbId(dbId: number): Observable<any> {
    return this.http.post<{ success: boolean, message: string, data: any }>(`http://localhost:3500/api/database/switch-database`, {
      db_id: dbId
    })
      .pipe(
        map(response => {
          return response;
        }),
        catchError(error => {
          console.error('❌ Erreur changement de base de données:', error);
          return throwError(() => error);
        })
      );
  }

  // Changer de société
  changeSociete(societe: Societe): void {
    this.currentSocieteSubject.next(societe);
    localStorage.setItem('currentSociete', JSON.stringify(societe));
    localStorage.setItem('currentSocieteId', String(societe.id));

    // Mettre à jour les documents de la société
    if (societe.documentSociete) {
      this.documentSocieteSubject.next(societe.documentSociete);
      localStorage.setItem('documentSociete', JSON.stringify(societe.documentSociete));
    }
  }

  // Obtenir la société actuelle
  getCurrentSociete(): Societe | null {
    return this.currentSocieteSubject.value;
  }

  // Obtenir les permissions de l'utilisateur
  getUserPermissions(): UserPermission[] {
    return this.userPermissionsSubject.value;
  }

  // Vérifier si l'utilisateur a accès à une interface
  hasPermission(menuItemName: string): boolean {
    const permissions = this.userPermissionsSubject.value;
    const currentUser = this.getCurrentUser();
    
    // Si l'utilisateur est admin, tout autoriser
    if (currentUser && currentUser.type === 1) {
      return true;
    }
    
    const permission = permissions.find(p => p.menu_item === menuItemName);
    // Gérer les deux formats : 1/0 (int) ou true/false (bool) ou '1'/'0' (string)
    const hasAccess = permission ? this.checkAccess(permission.access) : false;
    
    return hasAccess;
  }

  // Helper pour vérifier l'accès (gère différents formats)
  private checkAccess(access: number | boolean | string | undefined): boolean {
    if (access === undefined || access === null) {
      return false;
    }
    
    // Si c'est déjà un booléen true, retourner true immédiatement
    if (access === true) {
      return true;
    }
    
    // Si c'est déjà un booléen false, retourner false immédiatement
    if (access === false) {
      return false;
    }
    
    // Si c'est déjà un nombre 1, retourner true
    if (access === 1) {
      return true;
    }
    
    // Si c'est déjà un nombre 0, retourner false
    if (access === 0) {
      return false;
    }
    
    // Convertir en string pour comparaison
    const accessStr = String(access).trim().toLowerCase();
    return accessStr === '1' || accessStr === 'true';
  }

  // Recharger les permissions depuis le serveur
  reloadPermissions(userId: number): Observable<UserPermission[]> {
    return this.http.get<{ success: boolean; data: UserPermission[] }>(`http://localhost:3500/api/user-permissions/${userId}`)
      .pipe(
        map(response => {
          if (response.success) {
            localStorage.setItem('userPermissions', JSON.stringify(response.data));
            this.userPermissionsSubject.next(response.data);
            return response.data;
          }
          return [];
        }),
        catchError(error => {
          console.error('Erreur rechargement permissions:', error);
          return of([]);
        })
      );
  }
}
