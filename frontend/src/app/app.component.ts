import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from './service/auth.service';
import { PermissionsService } from './service/permissions.service';
import { UserPermissionsService, MenuCategory } from './service/user-permissions.service';
import { CaisseModeService } from './service/caisse-mode.service';
import { BaseService } from './service/base.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'frontend';
  sidebarHidden = false;
  mobileNavOpen = false;
  private sidebarHiddenByFinanceReportingRoute = false;
  private sidebarHiddenBeforeFinanceReporting = false;
  menuCategories: MenuCategory[] = [];
  filteredMenuCategories: MenuCategory[] = [];
  logoUrl: string = './assets/img/LOGO white.png'; // Logo par défaut
  
  constructor(
    public authService: AuthService,
    public caisseModeService: CaisseModeService,
    private router: Router,
    private permissionsService: PermissionsService,
    private userPermissionsService: UserPermissionsService,
    private baseService: BaseService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnInit(): void {
    /**
     * IMPORTANT:
     * On ne doit PAS "return" quand l'utilisateur n'est pas connecté.
     * Sinon, après login (navigation vers /Dashbord), ngOnInit() du root ne se relance pas
     * et le menu ne se charge qu'après refresh.
     */

    // Charger le logo depuis pdf-config.json si l'utilisateur est connecté
    if (this.authService.isAuthenticated()) {
      this.loadLogo();
    }

    // Écouter les changements de base de données via localStorage
    window.addEventListener('storage', (e) => {
      if (e.key === 'currentDatabaseName' && this.authService.isAuthenticated()) {
        //console.log('[AppComponent] Base de données changée (autre onglet), rechargement du logo...');
        this.loadLogo();
        this.cdr.detectChanges();
      }
    });

    // Écouter aussi les changements dans la même fenêtre (pour les cas où storage event ne se déclenche pas)
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      originalSetItem(key, value);
      if (key === 'currentDatabaseName' && this.authService.isAuthenticated()) {
        console.log('[AppComponent] Base de données changée (même fenêtre), rechargement du logo...');
        setTimeout(() => {
          this.loadLogo();
          this.cdr.detectChanges();
        }, 100);
      }
    };

    // Écouter les changements de permissions (après login, elles arrivent via AuthService.login)
    this.authService.userPermissions$.subscribe((permissions) => {
      if (this.authService.isAuthenticated() && permissions && permissions.length > 0) {
        // Si les catégories sont déjà chargées, filtrer immédiatement
        if (this.menuCategories.length > 0) {
          this.filterMenuCategories();
          setTimeout(() => this.cdr.detectChanges(), 0);
        } else {
          // Sinon, charger les catégories maintenant
          this.loadMenuCategories();
        }
        // Recharger le logo au cas où la base de données a changé
        this.loadLogo();
      }
    });

    // Si pas connecté, rediriger vers la page de login (sans return)
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
    } else {
      // Si déjà connecté au démarrage (refresh), charger le menu si permissions disponibles
      const initialPermissions = this.authService.getUserPermissions();
      if (initialPermissions && initialPermissions.length > 0) {
        this.loadMenuCategories();
      }
    }

    // Nettoyer les overlays et backdrops à chaque changement de route
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.cleanupOverlays();
        this.closeMobileMenuOnSmallScreen();
        this.applyRouteSidebarVisibility(event as NavigationEnd);
      });

    this.applyRouteSidebarVisibility(this.router.url);

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

    const profileItem = { name: 'Profil', route: '/Profile' };
    const securityCategoryIndex = this.filteredMenuCategories.findIndex((cat) =>
      String(cat.category || '').toLowerCase().includes('secur')
    );

    if (securityCategoryIndex >= 0) {
      const securityCategory = this.filteredMenuCategories[securityCategoryIndex];
      const alreadyExists = (securityCategory.items || []).some((item) => item.route === '/Profile');
      if (!alreadyExists) {
        securityCategory.items = [...(securityCategory.items || []), profileItem];
      }
    } else {
      this.filteredMenuCategories.push({
        category: 'Securite',
        icon: 'fas fa-user-shield',
        items: [profileItem]
      });
    }
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

  private applyRouteSidebarVisibility(eventOrUrl: NavigationEnd | string): void {
    const url = typeof eventOrUrl === 'string'
      ? eventOrUrl
      : (eventOrUrl.urlAfterRedirects || eventOrUrl.url);

    if (this.isFinanceReportingRoute(url)) {
      if (!this.sidebarHiddenByFinanceReportingRoute) {
        this.sidebarHiddenBeforeFinanceReporting = this.sidebarHidden;
      }
      this.sidebarHidden = true;
      this.sidebarHiddenByFinanceReportingRoute = true;
      return;
    }

    if (this.sidebarHiddenByFinanceReportingRoute) {
      this.sidebarHidden = this.sidebarHiddenBeforeFinanceReporting;
      this.sidebarHiddenByFinanceReportingRoute = false;
    }
  }

  private isFinanceReportingRoute(url: string): boolean {
    const normalizedUrl = String(url || '').split('?')[0].split('#')[0].toLowerCase();
    return normalizedUrl === '/finance/reporting'
      || normalizedUrl.startsWith('/finance/reporting/')
      || normalizedUrl === '/vente/reporting'
      || normalizedUrl.startsWith('/vente/reporting/')
      || normalizedUrl === '/achat/reporting'
      || normalizedUrl.startsWith('/achat/reporting/')
      || normalizedUrl === '/stock/reporting'
      || normalizedUrl.startsWith('/stock/reporting/');
  }

  toggleSidebar() {
    this.sidebarHiddenByFinanceReportingRoute = false;
    this.sidebarHiddenBeforeFinanceReporting = false;
    this.sidebarHidden = !this.sidebarHidden;
  }

  toggleMobileMenu(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    if (!this.isMobileView()) {
      return;
    }

    this.mobileNavOpen = !this.mobileNavOpen;
  }

  closeMobileMenu(): void {
    this.mobileNavOpen = false;
  }

  closeMobileMenuOnSmallScreen(): void {
    if (this.isMobileView()) {
      this.mobileNavOpen = false;
    }
  }

  isMobileView(): boolean {
    return window.innerWidth <= 991.5;
  }

  toggleCaisseBlackMode(): void {
    this.caisseModeService.toggleMode();
  }

  ngOnDestroy(): void {
    // Libérer le blob URL du logo lors de la destruction du composant
    if (this.logoUrl && this.logoUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(this.logoUrl);
      } catch (e) {
        // Ignorer les erreurs de révocation
      }
    }
  }

  /**
   * Charge le logo depuis pdf-config.json
   */
  loadLogo(): void {
    // Libérer l'ancien blob URL s'il existe
    if (this.logoUrl && this.logoUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(this.logoUrl);
      } catch (e) {
        // Ignorer les erreurs de révocation
      }
    }

    this.baseService.getLogo().subscribe({
      next: (blob: Blob) => {
        // Créer un blob URL à partir du blob
        const blobUrl = URL.createObjectURL(blob);
        this.logoUrl = blobUrl;
      //.log('[AppComponent] ✅ Logo chargé depuis pdf-config.json');
      },
      error: (error) => {
        console.warn('[AppComponent] ⚠️ Erreur chargement logo, utilisation du logo par défaut:', error);
        // En cas d'erreur, utiliser le logo par défaut
        this.logoUrl = './assets/img/LOGO white.png';
      }
    });
  }
}
