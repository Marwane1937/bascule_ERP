import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../service/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Récupérer le token
    const token = this.authService.getToken();
    
    // Récupérer l'ID de la société actuelle
    const societeId = localStorage.getItem('currentSocieteId');
    
    // Récupérer le nom de la base de données
    const databaseName = localStorage.getItem('currentDatabaseName');
    
    // Récupérer la société complète si disponible
    const currentSocieteStr = localStorage.getItem('currentSociete');
    let currentSociete = null;
    if (currentSocieteStr) {
      try {
        currentSociete = JSON.parse(currentSocieteStr);
      } catch (e) {
        console.warn('⚠️ [AuthInterceptor] Erreur parsing currentSociete:', e);
      }
    }
    
    // Cloner la requête et ajouter le token, l'ID de société et le nom de la base de données si disponibles
    let authReq = req;
    const headers: { [key: string]: string } = {};
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (societeId) {
      headers['x-societe-id'] = societeId;
    }
    
    // Ajouter le nom de la base de données
    // IMPORTANT: priorité à currentDatabaseName (db réelle sélectionnée) pour éviter que currentSociete.nom_base
    // (souvent la base "mère") écrase le choix de l'utilisateur.
    const dbNameToUse = databaseName || currentSociete?.nom_base;
    if (dbNameToUse) {
      headers['x-database-name'] = dbNameToUse;
    } else {
      console.warn('⚠️ [AuthInterceptor] No database name found in localStorage');
    }
    
    if (Object.keys(headers).length > 0) {
      authReq = req.clone({
        setHeaders: headers
      });
    }

    // Continuer avec la requête modifiée
    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        // Si erreur 401 (non autorisé)
        if (error.status === 401) {
          const errorData = error.error;
          
          // Vérifier si c'est une erreur de token WhatsApp expiré (ne pas rediriger)
          const isWhatsAppTokenError = errorData?.message === 'Token WhatsApp expiré' || 
                                       errorData?.error?.includes('expiré') ||
                                       errorData?.error?.includes('WhatsApp');
          
          if (!isWhatsAppTokenError) {
            // C'est une erreur d'authentification JWT, rediriger vers login
            this.authService.logout();
            this.router.navigate(['/login']);
          }
          // Si c'est une erreur WhatsApp, laisser le composant gérer l'affichage
        }
        
        // Si erreur 403 (interdit), afficher un message
        if (error.status === 403) {
          console.error('Accès interdit:', error);
        }

        return throwError(() => error);
      })
    );
  }
}
