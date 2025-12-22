import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../service/auth.service';
import { PermissionsService } from '../service/permissions.service';

@Injectable({
  providedIn: 'root'
})
export class PermissionGuard implements CanActivate {

  constructor(
    private authService: AuthService,
    private permissionsService: PermissionsService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    // Vérifier d'abord l'authentification
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }

    // Si l'utilisateur est admin (type 1), autoriser l'accès
    const currentUser = this.authService.getCurrentUser();
    if (currentUser && currentUser.type === 1) {
      return true;
    }

    // Vérifier les permissions pour la route
    const hasAccess = this.permissionsService.hasAccessToRoute(state.url);
    
    if (!hasAccess) {
      // Rediriger vers le dashboard si pas d'accès
      this.router.navigate(['/Dashbord']);
      return false;
    }

    return true;
  }
}

