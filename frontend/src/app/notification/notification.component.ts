import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService, Notification, NotificationFilters } from '../service/notification.service';
import { AuthService } from '../service/auth.service';
import { PermissionsService } from '../service/permissions.service';
import Swal from 'sweetalert2';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-notification',
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.css']
})
export class NotificationComponent implements OnInit, OnDestroy {
  notifications: Notification[] = [];
  filteredNotifications: Notification[] = [];
  loading = false;
  selectedNotification: Notification | null = null;
  
  filters: NotificationFilters = {
    etat: 'ALL',
    lire: 'ALL'
  };

  etats = [
    { value: 'ALL', label: 'Tous les états' },
    { value: '0', label: 'Non archivé' },
    { value: '1', label: 'Archivé' }
  ];

  lireOptions = [
    { value: 'ALL', label: 'Toutes' },
    { value: '0', label: 'Non lue' },
    { value: '3', label: 'Lue' }
  ];

  private refreshSubscription?: Subscription;

  constructor(
    private notificationService: NotificationService,
    private authService: AuthService,
    private permissionsService: PermissionsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
    // Désactiver l'actualisation automatique
    // this.refreshSubscription = interval(30000).subscribe(() => {
    //   this.loadNotifications();
    // });
  }

  ngOnDestroy(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  loadNotifications(): void {
    this.loading = true;
    this.notificationService.getNotifications(this.filters).subscribe({
      next: (response: any) => {
        const normalNotifications = response.success ? (response.data || []) : [];
        
        // Charger les notifications calculées
        this.notificationService.getCalculatedNotifications().subscribe({
          next: (calcResponse: any) => {
            const calculatedNotifications = calcResponse.success ? (calcResponse.data || []) : [];
            
            // Combiner les deux listes (notifications calculées en premier)
            this.notifications = [...calculatedNotifications, ...normalNotifications];
            this.applyFilters();
            this.loading = false;
          },
          error: (err) => {
            console.error('Erreur chargement notifications calculées:', err);
            this.notifications = normalNotifications;
            this.applyFilters();
            this.loading = false;
          }
        });
      },
      error: (error) => {
        // En cas d'erreur, essayer quand même de charger les notifications calculées
        this.notificationService.getCalculatedNotifications().subscribe({
          next: (calcResponse: any) => {
            this.notifications = calcResponse.success ? (calcResponse.data || []) : [];
            this.applyFilters();
            this.loading = false;
          },
          error: () => {
            this.notifications = [];
            this.filteredNotifications = [];
            this.loading = false;
          }
        });
      }
    });
  }

  applyFilters(): void {
    // Appliquer les filtres côté client pour un filtrage immédiat
    let filtered = [...this.notifications];

    // Filtrer par état
    if (this.filters.etat !== undefined && this.filters.etat !== 'ALL' && this.filters.etat !== '') {
      const etatNum = parseInt(this.filters.etat);
      filtered = filtered.filter(n => n.etat === etatNum);
    }

    // Filtrer par lire
    if (this.filters.lire !== undefined && this.filters.lire !== 'ALL' && this.filters.lire !== '') {
      const lireNum = parseInt(this.filters.lire);
      if (lireNum === 3) {
        // Lue
        filtered = filtered.filter(n => n.lire === 3);
      } else if (lireNum === 0) {
        // Non lue
        filtered = filtered.filter(n => !n.lire || n.lire !== 3);
      }
    }

    // Trier les notifications : celles avec < 5 jours en premier
    this.filteredNotifications = filtered.sort((a, b) => {
      const timeA = this.getTimeRemaining(a.date_alarme);
      const timeB = this.getTimeRemaining(b.date_alarme);
      
      // Si une notification est en retard, elle passe en premier
      if (timeA.isOverdue && !timeB.isOverdue) return -1;
      if (!timeA.isOverdue && timeB.isOverdue) return 1;
      
      // Si les deux sont en retard ou non, trier par jours restants
      if (timeA.days !== timeB.days) {
        return timeA.days - timeB.days;
      }
      
      // Si même nombre de jours, trier par priorité (1 = élevé en premier)
      return a.type - b.type;
    });
  }

  // Vérifier si une notification est urgente (< 10 jours)
  isUrgent(notification: Notification): boolean {
    // Pour les notifications calculées, utiliser jours_restants
    if (notification.isCalculated && notification.jours_restants !== undefined) {
      return notification.jours_restants < 10 && notification.jours_restants >= 0;
    }
    
    // Pour les notifications normales, utiliser date_alarme
    if (!notification.date_alarme) return false;
    const timeRemaining = this.getTimeRemaining(notification.date_alarme);
    return !timeRemaining.isOverdue && timeRemaining.days < 10;
  }

  // Helper pour obtenir la classe de ligne selon l'état
  getRowClass(notification: Notification): string {
    // Les notifications d'erreur (type 3) ont toujours la priorité
    if (notification.type === 3) {
      return 'table-danger';
    }
    
    const isUrgent = this.isUrgent(notification);
    const isOverdue = this.isOverdue(notification.date_alarme);
    
    if (isUrgent) {
      return 'table-warning';
    }
    if (isOverdue) {
      return 'table-danger';
    }
    if (notification.etat === 0 && !isUrgent && !isOverdue) {
      return 'table-primary';
    }
    return '';
  }

  // Vérifier s'il y a des notifications urgentes
  hasUrgentNotifications(): boolean {
    return this.filteredNotifications.some(n => this.isUrgent(n));
  }

  // Changer le type/priorité d'une notification
  changePriority(notification: Notification, event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newType = parseInt(target.value);
    
    if (notification.type === newType) return;
    
    // Les notifications calculées ne peuvent pas avoir leur priorité changée
    if (notification.isCalculated || typeof notification.id !== 'number') {
      return;
    }
    
    // Mettre à jour localement
    notification.type = newType;
    
    // Appeler l'API pour mettre à jour
    this.notificationService.updateType(notification.id, newType).subscribe({
      next: () => {
        // Succès silencieux
        this.applyFilters(); // Réappliquer le tri
      },
      error: (error) => {
        Swal.fire('Erreur', 'Impossible de mettre à jour la priorité', 'error');
        // Recharger les notifications pour restaurer l'état
        this.loadNotifications();
      }
    });
  }

  onFilterChange(): void {
    // Recharger les notifications avec les nouveaux filtres
    this.loadNotifications();
  }

  viewNotification(notification: Notification): void {
    // Si c'est une notification calculée avec redirection
    if (notification.isCalculated && notification.redirectRoute) {
      // Rediriger vers la route spécifiée
      this.router.navigate([notification.redirectRoute]);
      return;
    }
    
    this.selectedNotification = notification;
    // Marquer comme lue si elle est nouvelle (etat = 0)
    if (notification.etat === 0 && this.hasPermission('notification_mark_read') && typeof notification.id === 'number') {
      this.markAsRead(notification.id, false);
    }
  }

  onNotificationClick(notification: Notification): void {
    // Si c'est une notification calculée avec redirection
    if (notification.isCalculated && notification.redirectRoute) {
      // Rediriger vers la route spécifiée
      this.router.navigate([notification.redirectRoute]);
    } else {
      // Comportement normal : ouvrir les détails
      this.viewNotification(notification);
    }
  }

  markAsReadAndClose(id: number | string): void {
    if (typeof id === 'number') {
      this.markAsRead(id);
      this.closeDetails();
    }
  }

  restoreAndClose(id: number | string): void {
    if (typeof id === 'number') {
      this.restore(id);
      this.closeDetails();
    }
  }

  closeDetails(): void {
    this.selectedNotification = null;
  }

  stopEventPropagation(event: Event): void {
    event.stopPropagation();
  }

  markAsRead(id: number | string, showMessage: boolean = true): void {
    if (!this.hasPermission('notification_mark_read')) {
      Swal.fire('Erreur', 'Permission insuffisante', 'error');
      return;
    }

    // Les notifications calculées ne peuvent pas être marquées comme lues
    if (typeof id !== 'number') {
      return;
    }

    this.notificationService.markAsRead(id).subscribe({
      next: () => {
        if (showMessage) {
          Swal.fire('Succès', 'Notification marquée comme lue', 'success');
        }
        this.loadNotifications();
      },
      error: (error) => {
        Swal.fire('Erreur', 'Impossible de marquer comme lue', 'error');
      }
    });
  }

  markAllAsRead(): void {
    if (!this.hasPermission('notification_mark_read')) {
      Swal.fire('Erreur', 'Permission insuffisante', 'error');
      return;
    }

    const unreadIds = this.filteredNotifications
      .filter(n => n.etat === 0 && typeof n.id === 'number' && !n.isCalculated)
      .map(n => n.id as number);

    if (unreadIds.length === 0) {
      Swal.fire('Info', 'Aucune notification non lue', 'info');
      return;
    }

    this.notificationService.markMultipleAsRead(unreadIds).subscribe({
      next: () => {
        Swal.fire('Succès', `${unreadIds.length} notification(s) marquée(s) comme lue(s)`, 'success');
        this.loadNotifications();
      },
      error: (error) => {
        Swal.fire('Erreur', 'Impossible de marquer comme lues', 'error');
      }
    });
  }

  archive(id: number | string): void {
    if (!this.hasPermission('notification_archive')) {
      Swal.fire('Erreur', 'Permission insuffisante', 'error');
      return;
    }

    // Les notifications calculées ne peuvent pas être archivées
    if (typeof id !== 'number') {
      return;
    }

    Swal.fire({
      title: 'Archiver cette notification ?',
      text: 'Elle sera masquée par défaut',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, archiver',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.notificationService.archive(id).subscribe({
          next: () => {
            Swal.fire('Succès', 'Notification archivée', 'success');
            this.loadNotifications();
            if (this.selectedNotification?.id === id) {
              this.closeDetails();
            }
          },
          error: (error) => {
            Swal.fire('Erreur', 'Impossible d\'archiver', 'error');
          }
        });
      }
    });
  }

  restore(id: number | string): void {
    if (!this.hasPermission('notification_restore')) {
      Swal.fire('Erreur', 'Permission insuffisante', 'error');
      return;
    }

    // Les notifications calculées ne peuvent pas être restaurées
    if (typeof id !== 'number') {
      return;
    }

    this.notificationService.restore(id).subscribe({
      next: () => {
        Swal.fire('Succès', 'Notification restaurée', 'success');
        this.loadNotifications();
      },
      error: (error) => {
        Swal.fire('Erreur', 'Impossible de restaurer', 'error');
      }
    });
  }

  delete(id: number | string): void {
    if (!this.hasPermission('notification_delete')) {
      Swal.fire('Erreur', 'Permission insuffisante', 'error');
      return;
    }

    // Les notifications calculées ne peuvent pas être supprimées
    if (typeof id !== 'number') {
      return;
    }

    Swal.fire({
      title: 'Supprimer cette notification ?',
      text: 'Cette action est irréversible',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#d33'
    }).then((result) => {
      if (result.isConfirmed) {
        this.notificationService.delete(id).subscribe({
          next: () => {
            Swal.fire('Succès', 'Notification supprimée', 'success');
            this.loadNotifications();
            if (this.selectedNotification?.id === id) {
              this.closeDetails();
            }
          },
          error: (error) => {
            Swal.fire('Erreur', 'Impossible de supprimer', 'error');
          }
        });
      }
    });
  }

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

  getTypeBadgeClass(type: number): string {
    switch (type) {
      case 1: return 'badge';
      case 2: return 'badge';
      case 3: return 'badge';
      case 4: return 'badge';
      default: return 'badge bg-secondary';
    }
  }

  getTypeLabel(type: number): string {
    return this.getPriorityLabel(type);
  }

  // Calculer le temps restant jusqu'à date_alarme
  getTimeRemaining(dateAlarme: string | undefined): { days: number; text: string; isOverdue: boolean } {
    if (!dateAlarme) {
      return { days: 0, text: 'Pas de date', isOverdue: false };
    }

    const alarmDate = new Date(dateAlarme);
    const now = new Date();
    const diffTime = alarmDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { days: Math.abs(diffDays), text: `Dépassé de ${Math.abs(diffDays)} jour(s)`, isOverdue: true };
    } else if (diffDays === 0) {
      return { days: 0, text: "Aujourd'hui", isOverdue: false };
    } else if (diffDays === 1) {
      return { days: 1, text: 'Demain', isOverdue: false };
    } else {
      return { days: diffDays, text: `Dans ${diffDays} jour(s)`, isOverdue: false };
    }
  }

  // Helper pour obtenir le badge class selon le temps restant
  getTimeRemainingBadgeClass(dateAlarme: string | undefined): string {
    const timeRemaining = this.getTimeRemaining(dateAlarme);
    if (timeRemaining.isOverdue) {
      return 'bg-danger';
    } else if (timeRemaining.days < 5) {
      return 'bg-warning';
    } else {
      return 'bg-success';
    }
  }

  // Helper pour obtenir le texte du temps restant
  getTimeRemainingText(dateAlarme: string | undefined): string {
    return this.getTimeRemaining(dateAlarme).text;
  }

  // Helper pour vérifier si en retard
  isOverdue(dateAlarme: string | undefined): boolean {
    return this.getTimeRemaining(dateAlarme).isOverdue;
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

  hasPermission(permission: string): boolean {
    return this.permissionsService.hasPermission(permission);
  }

  // Helper pour vérifier si l'ID est un nombre (utilisable dans le template)
  isNumericId(id: number | string): boolean {
    return typeof id === 'number';
  }

  get unreadCount(): number {
    return this.notifications.filter(n => n.etat === 0).length;
  }

  // Création de notification
  showCreateModal = false;
  newNotification = {
    description: '',
    emetteur: 'SYSTEM',
    type: 1, // 1=INFO par défaut
    date_alarme: this.formatDateTimeLocal(new Date())
  };

  openCreateModal(): void {
    this.newNotification = {
      description: '',
      emetteur: 'SYSTEM',
      type: 1, // 1=INFO par défaut
      date_alarme: this.formatDateTimeLocal(new Date())
    };
    this.showCreateModal = true;
  }

  formatDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  get minDate(): string {
    return this.formatDateTimeLocal(new Date());
  }

  setQuickDate(option: 'today' | 'tomorrow' | 'week' | 'month'): void {
    const now = new Date();
    let targetDate = new Date();

    switch (option) {
      case 'today':
        targetDate = new Date(now);
        break;
      case 'tomorrow':
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 1);
        break;
      case 'week':
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 7);
        break;
      case 'month':
        targetDate = new Date(now);
        targetDate.setMonth(targetDate.getMonth() + 1);
        break;
    }

    // Définir l'heure à 9h00 du matin par défaut
    targetDate.setHours(9, 0, 0, 0);
    this.newNotification.date_alarme = this.formatDateTimeLocal(targetDate);
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  createNotification(): void {
    if (!this.newNotification.description || !this.newNotification.description.trim()) {
      Swal.fire('Erreur', 'La description est requise', 'error');
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    
    // Convertir datetime-local en format ISO pour l'API
    let dateAlarme = new Date().toISOString();
    if (this.newNotification.date_alarme) {
      // datetime-local retourne "YYYY-MM-DDTHH:mm", on doit le convertir en ISO
      const dateStr = this.newNotification.date_alarme;
      dateAlarme = new Date(dateStr).toISOString();
    }

    const data = {
      description: this.newNotification.description.trim(),
      emetteur: this.newNotification.emetteur || 'SYSTEM',
      type: this.newNotification.type, // Entier: 1=INFO, 2=WARNING, 3=ERROR, 4=SUCCESS
      date_alarme: dateAlarme,
      user_id: currentUser?.id || undefined
    };

    this.loading = true;
    this.notificationService.create(data).subscribe({
      next: (response: any) => {
        if (response.success) {
          Swal.fire('Succès', 'Notification créée avec succès', 'success');
          this.closeCreateModal();
          this.loadNotifications();
        } else {
          Swal.fire('Erreur', response.message || 'Erreur lors de la création', 'error');
        }
        this.loading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Impossible de créer la notification', 'error');
        this.loading = false;
      }
    });
  }
}
