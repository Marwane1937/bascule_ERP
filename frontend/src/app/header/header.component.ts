import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, User, Societe } from '../service/auth.service';
import { NotificationService, Notification } from '../service/notification.service';
import { PermissionsService } from '../service/permissions.service';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  societes: Societe[] = [];
  selectedSociete: Societe | null = null;
  isLoadingSocietes = false;
  
  // Notifications
  urgentCount = 0; // Compte uniquement les notifications urgentes (< 5 jours)
  recentNotifications: Notification[] = [];
  showNotificationDropdown = false;
  loadingNotifications = false;
  rememberEnabled = false; // État du bouton Remember
  private notificationRefreshSubscription?: Subscription;
  private rememberNotificationSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
    private notificationService: NotificationService,
    private permissionsService: PermissionsService
  ) {}

  ngOnInit(): void {
    // S'abonner aux changements de l'utilisateur connecté
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        // Si le nom est vide, essayer de récupérer les infos depuis le serveur
        if (!user.nom || user.nom.trim() === '') {
          this.authService.getMe().subscribe({
            next: (userInfo) => {
              this.currentUser = { ...this.currentUser, ...userInfo };
              // Mettre à jour le localStorage
              localStorage.setItem('user', JSON.stringify(this.currentUser));
            },
            error: (error) => {
              // Erreur silencieuse
            }
          });
        }
        // this.loadSocietes(); // Désactivé - API /api/societes génère une erreur 500
        
        // Charger les notifications si l'utilisateur a la permission
        if (this.hasNotificationPermission()) {
          this.loadNotifications();
          // Rafraîchir toutes les 30 secondes
          this.notificationRefreshSubscription = interval(30000).subscribe(() => {
            this.loadNotifications();
          });
          
          // Demander la permission pour les notifications système du navigateur
          this.requestNotificationPermission();
        }
      }
    });

    // S'abonner aux changements de société
    this.authService.currentSociete$.subscribe(societe => {
      this.selectedSociete = societe;
    });
  }

  ngOnDestroy(): void {
    if (this.notificationRefreshSubscription) {
      this.notificationRefreshSubscription.unsubscribe();
    }
    if (this.rememberNotificationSubscription) {
      this.rememberNotificationSubscription.unsubscribe();
    }
  }

  loadSocietes(): void {
    this.isLoadingSocietes = true;
    this.authService.getAllSocietes().subscribe({
      next: (societes) => {
        this.societes = societes;
        this.isLoadingSocietes = false;
      },
      error: (error) => {
        this.isLoadingSocietes = false;
      }
    });
  }

  selectSociete(societe: Societe): void {
    this.authService.changeSociete(societe);
    this.authService.switchDatabase(societe.id).subscribe({
      next: (response) => {
        // Recharger la page pour appliquer le changement
        window.location.reload();
      },
      error: (error) => {
        // Erreur silencieuse
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  getRoleDisplayName(type: number): string {
    switch (type) {
      case 1: return 'Administrateur';
      case 2: return 'Utilisateur';
      case 3: return 'Gestionnaire';
      default: return 'Inconnu';
    }
  }

  // Notifications
  hasNotificationPermission(): boolean {
    return this.permissionsService.hasPermission('notification_view');
  }

  hasMarkReadPermission(): boolean {
    return this.permissionsService.hasPermission('notification_mark_read');
  }

  loadNotifications(): void {
    if (!this.hasNotificationPermission()) {
      return;
    }
    
    this.loadingNotifications = true;
    
    // Charger toutes les notifications pour compter les urgentes
    this.notificationService.getNotifications({ etat: '0' }).subscribe({
      next: (response: any) => {
        if (response && response.success) {
          const notifications = response.data || [];
          
          if (notifications.length === 0) {
            this.urgentCount = 0;
            this.recentNotifications = [];
            this.loadingNotifications = false;
            return;
          }
          
          // Filtrer uniquement les notifications avec date_alarme, moins de 5 jours restants,
          // non archivées (etat = 0) et non lues (lire !== 3)
          const urgentNotifications: Notification[] = [];
          
          notifications.forEach((n: Notification) => {
            // Exclure les notifications sans date_alarme
            if (!n.date_alarme) {
              return;
            }
            
            // Exclure les notifications archivées (etat = 1)
            if (n.etat === 1) {
              return;
            }
            
            // Exclure les notifications marquées comme lues (lire = 3)
            if (n.lire === 3) {
              return;
            }
            
            // Vérifier si la notification est urgente (< 5 jours)
            const isUrgentResult = this.isUrgent(n);
            
            if (isUrgentResult) {
              urgentNotifications.push(n);
            }
          });
          
          // Compter uniquement les notifications urgentes (< 5 jours)
          this.urgentCount = urgentNotifications.length;
          
          // Charger toutes les notifications urgentes triées par urgence
          this.recentNotifications = urgentNotifications
            .sort((a: Notification, b: Notification) => {
              const timeA = this.getTimeRemaining(a.date_alarme);
              const timeB = this.getTimeRemaining(b.date_alarme);
              
              // Trier d'abord par statut (en retard en premier)
              if (timeA.isOverdue && !timeB.isOverdue) return -1;
              if (!timeA.isOverdue && timeB.isOverdue) return 1;
              
              // Ensuite par jours restants (les plus urgents en premier)
              return timeA.days - timeB.days;
            });
        } else {
          this.urgentCount = 0;
          this.recentNotifications = [];
        }
        this.loadingNotifications = false;
      },
      error: (error) => {
        this.urgentCount = 0;
        this.recentNotifications = [];
        this.loadingNotifications = false;
      }
    });
  }

  // Vérifier si une notification est urgente (< 5 jours)
  isUrgent(notification: Notification): boolean {
    if (!notification.date_alarme) {
      return false;
    }
    
    try {
      const alarmDate = new Date(notification.date_alarme);
      
      // Vérifier si la date est valide
      if (isNaN(alarmDate.getTime())) {
        return false;
      }
      
      const now = new Date();
      
      // Réinitialiser les heures pour comparer uniquement les dates
      const nowNormalized = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const alarmDateNormalized = new Date(alarmDate.getFullYear(), alarmDate.getMonth(), alarmDate.getDate());
      
      const diffTime = alarmDateNormalized.getTime() - nowNormalized.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      // Urgent si moins de 5 jours restants (y compris les dates passées)
      return diffDays < 5;
    } catch (error) {
      return false;
    }
  }

  toggleNotificationDropdown(): void {
    this.showNotificationDropdown = !this.showNotificationDropdown;
    
    if (this.showNotificationDropdown) {
      this.loadNotifications();
    }
  }

  closeNotificationDropdown(): void {
    this.showNotificationDropdown = false;
  }

  goToNotifications(): void {
    this.closeNotificationDropdown();
    this.router.navigate(['/Notifications']);
  }

  markNotificationAsRead(id: number, event: Event): void {
    event.stopPropagation();
    if (!this.hasMarkReadPermission()) return;
    
    this.notificationService.markAsRead(id).subscribe({
      next: () => {
        // Recharger les notifications pour mettre à jour la liste
        this.loadNotifications();
      },
      error: () => {
        // Erreur silencieuse
      }
    });
  }

  // Toggle le bouton Remember
  toggleRemember(): void {
    this.rememberEnabled = !this.rememberEnabled;
    
    if (this.rememberEnabled) {
      // Activer les notifications toutes les 10 minutes (600000 ms)
      this.rememberNotificationSubscription = interval(600000).subscribe(() => {
        this.showRememberNotification();
      });
      // Afficher immédiatement une notification
      this.showRememberNotification();
    } else {
      // Désactiver les notifications
      if (this.rememberNotificationSubscription) {
        this.rememberNotificationSubscription.unsubscribe();
        this.rememberNotificationSubscription = undefined;
      }
    }
  }

  // Demander la permission pour les notifications système
  requestNotificationPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // Afficher une notification Remember
  showRememberNotification(): void {
    // Créer une notification système du navigateur si supportée
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Rappel - Notifications', {
        body: 'N\'oubliez pas de vérifier vos notifications urgentes !',
        icon: '/assets/img/LOGO white.png',
        tag: 'remember-notification'
      });
    }
  }

  // Priorités: 1=Élevé, 2=Normal, 3=Faible, 4=Info
  getPriorityLabel(type: number): string {
    switch (type) {
      case 1: return 'Élevé';
      case 2: return 'Normal';
      case 3: return 'Faible';
      case 4: return 'Info';
      default: return 'Normal';
    }
  }

  getPriorityColor(type: number): string {
    switch (type) {
      case 1: return '#dc3545'; // Rouge pour élevé
      case 2: return '#ffc107'; // Jaune pour normal
      case 3: return '#0dcaf0'; // Cyan pour faible
      case 4: return '#198754'; // Vert pour info
      default: return '#6c757d'; // Gris par défaut
    }
  }

  getTypeIcon(type: number): string {
    switch (type) {
      case 1: return 'fas fa-exclamation-circle';
      case 2: return 'fas fa-info-circle';
      case 3: return 'fas fa-info-circle';
      case 4: return 'fas fa-check-circle';
      default: return 'fas fa-bell';
    }
  }

  // Calculer le temps restant jusqu'à date_alarme
  getTimeRemaining(dateAlarme: string | undefined): { days: number; text: string; isOverdue: boolean } {
    if (!dateAlarme) {
      return { days: 0, text: 'Pas de date', isOverdue: false };
    }

    try {
      const alarmDate = new Date(dateAlarme);
      
      // Vérifier si la date est valide
      if (isNaN(alarmDate.getTime())) {
        return { days: 0, text: 'Date invalide', isOverdue: false };
      }
      
      const now = new Date();
      
      // Normaliser les dates (sans heures)
      const nowNormalized = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const alarmDateNormalized = new Date(alarmDate.getFullYear(), alarmDate.getMonth(), alarmDate.getDate());
      
      const diffTime = alarmDateNormalized.getTime() - nowNormalized.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        // Date passée - afficher le nombre de jours de retard
        const daysOverdue = Math.abs(diffDays);
        return { 
          days: daysOverdue, 
          text: `Dépassé de ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}`, 
          isOverdue: true 
        };
      } else if (diffDays === 0) {
        return { days: 0, text: "il reste 0 jour avant l'échéance", isOverdue: false };
      } else if (diffDays === 1) {
        return { days: 1, text: "il reste 1 jour avant l'échéance", isOverdue: false };
      } else {
        return { days: diffDays, text: `il reste ${diffDays} jours avant l'échéance`, isOverdue: false };
      }
    } catch (error) {
      return { days: 0, text: 'Erreur de calcul', isOverdue: false };
    }
  }

  // Obtenir la couleur de l'icône de notification selon la priorité la plus élevée
  getNotificationIconColor(): string {
    if (this.recentNotifications.length === 0) {
      return 'white';
    }
    
    // Trouver la notification avec la priorité la plus élevée (1 = élevé)
    const highPriority = this.recentNotifications.find(n => n.type === 1);
    if (highPriority) {
      return this.getPriorityColor(1); // Rouge
    }
    
    const normalPriority = this.recentNotifications.find(n => n.type === 2);
    if (normalPriority) {
      return this.getPriorityColor(2); // Jaune
    }
    
    return 'white'; // Par défaut
  }

  // Obtenir la couleur du badge selon la priorité et le temps restant
  getNotificationBadgeColor(): string {
    if (this.recentNotifications.length === 0) {
      return '#ff4444';
    }
    
    // Vérifier s'il y a des notifications en retard
    const overdue = this.recentNotifications.find(n => {
      const timeRemaining = this.getTimeRemaining(n.date_alarme);
      return timeRemaining.isOverdue;
    });
    if (overdue) {
      return '#dc3545'; // Rouge pour retard
    }
    
    // Vérifier s'il y a des notifications urgentes (<= 3 jours)
    const urgent = this.recentNotifications.find(n => {
      const timeRemaining = this.getTimeRemaining(n.date_alarme);
      return !timeRemaining.isOverdue && timeRemaining.days <= 3;
    });
    if (urgent) {
      return '#ffc107'; // Jaune pour urgent
    }
    
    // Vérifier la priorité la plus élevée
    const highPriority = this.recentNotifications.find(n => n.type === 1);
    if (highPriority) {
      return this.getPriorityColor(1); // Rouge pour élevé
    }
    
    return '#ff4444'; // Par défaut
  }

  formatDate(date: string | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
