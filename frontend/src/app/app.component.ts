import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from './service/auth.service';
import { PermissionsService } from './service/permissions.service';
import { UserPermissionsService, MenuCategory } from './service/user-permissions.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'frontend';
  sidebarHidden = false;
  menuCategories: MenuCategory[] = [];
  filteredMenuCategories: MenuCategory[] = [];
  
  constructor(
    public authService: AuthService,
    private router: Router,
    private permissionsService: PermissionsService,
    private userPermissionsService: UserPermissionsService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnInit(): void {
    // Si pas connecté, rediriger vers la page de login
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    // PRIORITÉ 1: S'assurer que les permissions sont chargées depuis localStorage
    // Les permissions sont chargées dans le constructeur de AuthService via checkStoredAuth()
    const initialPermissions = this.authService.getUserPermissions();
    const currentUser = this.authService.getCurrentUser();

    // Écouter les changements de permissions
    // BehaviorSubject émet immédiatement la valeur actuelle lors de l'abonnement
    this.authService.userPermissions$.subscribe((permissions) => {
      // Si on a des permissions, TOUJOURS charger/filtrer les catégories
      if (permissions && permissions.length > 0) {
        // Si les catégories sont déjà chargées, filtrer immédiatement
        if (this.menuCategories.length > 0) {
          this.filterMenuCategories();
          
          // Forcer la détection de changement
          setTimeout(() => {
            this.cdr.detectChanges();
          }, 0);
        } else {
          // Si les catégories ne sont pas encore chargées, les charger maintenant
          this.loadMenuCategories();
        }
      }
    });

    // PRIORITÉ 2: Charger les catégories de menu seulement si on a des permissions
    // Si on a des permissions, charger les catégories immédiatement
    if (initialPermissions && initialPermissions.length > 0) {
      this.loadMenuCategories();
    }

    // Nettoyer les overlays et backdrops à chaque changement de route
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.cleanupOverlays();
      });

    // Nettoyer les overlays au démarrage
    this.cleanupOverlays();

    // Nettoyer périodiquement les overlays orphelins (toutes les 2 secondes)
    setInterval(() => {
      this.cleanupOverlays();
    }, 2000);

    // Exposer la fonction de nettoyage dans la console pour débogage
    (window as any).cleanupOverlays = () => this.cleanupOverlays();
  }

  loadMenuCategories(): void {
    // Récupérer les permissions AVANT de charger les catégories
    const currentPermissions = this.authService.getUserPermissions();
    const currentUser = this.authService.getCurrentUser();
    
    this.userPermissionsService.getAvailableMenuItems().subscribe({
      next: (response) => {
        if (response.success) {
          this.menuCategories = response.data;
          
          // Récupérer les permissions MAINTENANT (elles devraient être disponibles)
          const permissions = this.authService.getUserPermissions();
          
          // Filtrer IMMÉDIATEMENT après le chargement des catégories
          // Les permissions devraient être disponibles depuis localStorage
          this.filterMenuCategories();
          
          // Forcer la détection de changement pour mettre à jour la vue
          setTimeout(() => {
            this.cdr.detectChanges();
          }, 0);
        }
      },
      error: (error) => {
        console.error('❌ [AppComponent] Erreur chargement menu categories:', error);
      }
    });
  }

  filterMenuCategories(): void {
    const permissions = this.authService.getUserPermissions();
    const currentUser = this.authService.getCurrentUser();
    
    // Si pas de catégories, ne rien faire
    if (!this.menuCategories || this.menuCategories.length === 0) {
      this.filteredMenuCategories = [];
      return;
    }
    
    const filtered = this.permissionsService.filterMenuCategories(this.menuCategories);

    // Masquer uniquement les sous-menus Generation: Calibration / Aperçu / Impression (demande utilisateur)
    const bannedRoutes = new Set([
      '/generation/calibration',
      '/generation/apercu',
      '/generation/preview',
      '/generation/impression'
    ]);
    const bannedNames = ['calibration', 'aperçu', 'apercu', 'impression'];

    this.filteredMenuCategories = (filtered || [])
      .filter((cat) => {
        // Masquer la catégorie "Permissions Notifications" du menu de gauche
        const categoryName = (cat.category || '').toString().toLowerCase();
        if (categoryName.includes('permissions notifications')) {
          return false;
        }
        return true;
      })
      .map((cat) => ({
        ...cat,
        items: (cat.items || []).filter((item) => {
          const route = (item.route || '').toString();
          const name = (item.name || '').toString().toLowerCase();

          if (bannedRoutes.has(route)) return false;
          if (route.startsWith('/generation/') && bannedNames.some((x) => name.includes(x))) return false;
          return true;
        })
      }))
      .filter((cat) => (cat.items || []).length > 0);
  }

  hasAccessToRoute(route: string): boolean {
    return this.permissionsService.hasAccessToRoute(route);
  }

  // Convertir le nom de catégorie en ID pour le collapse Bootstrap
  getCategoryId(categoryName: string): string {
    return categoryName.toLowerCase().replace(/\s+/g, '-');
  }

  /**
   * Nettoie les overlays, backdrops et modals qui pourraient bloquer l'interface
   */
  cleanupOverlays(): void {
    // Supprimer les backdrops Bootstrap orphelins
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => {
      backdrop.remove();
    });

    // Supprimer les classes 'show' des modals qui ne sont pas réellement ouvertes
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      if (!modal.classList.contains('show')) {
        // Le modal n'est pas ouvert, s'assurer qu'il n'y a pas de classe qui bloque
        modal.classList.remove('show');
        document.body.classList.remove('modal-open');
      }
    });

    // Supprimer la classe modal-open du body si aucun modal n'est ouvert
    const openModals = document.querySelectorAll('.modal.show');
    if (openModals.length === 0) {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }

    // Supprimer les overlays de note-editor
    const noteBackdrops = document.querySelectorAll('.note-modal-backdrop');
    noteBackdrops.forEach(backdrop => {
      if (!backdrop.classList.contains('open')) {
        backdrop.remove();
      }
    });
  }

  toggleSidebar() {
    this.sidebarHidden = !this.sidebarHidden;
  }
}
