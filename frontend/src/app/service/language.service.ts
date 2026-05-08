import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AppLanguage = 'fr' | 'en';

type TranslationMap = Record<string, string>;

const TRANSLATIONS: Record<AppLanguage, TranslationMap> = {
  fr: {
    'header.system_title': 'Système de Gestion',
    'header.notifications': 'Notifications',
    'header.permission_required': 'Permission requise',
    'header.close': 'Fermer',
    'header.no_urgent_notifications': 'Aucune notification urgente',
    'header.notifications_up_to_date': 'Toutes vos notifications sont à jour',
    'header.click_for_details': 'Cliquez pour voir les détails',
    'header.mark_as_read': 'Marquer comme lue',
    'header.calculated_notification': 'Notification calculée automatiquement',
    'header.profile': 'Profil',
    'header.logout': 'Déconnexion',
    'header.language': 'Langue',
    'header.user': 'Utilisateur',
    'header.administrator': 'Administrateur',
    'header.manager': 'Gestionnaire',
    'header.unknown': 'Inconnu',
    'header.enable_reminders': 'Activer les rappels toutes les 10 minutes',
    'header.disable_reminders': 'Désactiver les rappels',
    'header.remember': 'Rappels',
    'profile.page_title': 'Profil',
    'profile.breadcrumb_security': 'Sécurité',
    'profile.breadcrumb_profile': 'Profil',
    'profile.connected_profile': 'Profil connecté',
    'profile.connected_profile_text': 'Informations du compte actuellement connecté à l application.',
    'profile.full_name': 'Nom complet',
    'profile.login': 'Login',
    'profile.role': 'Rôle',
    'profile.status': 'Statut',
    'profile.active_session': 'Session active',
    'profile.language': 'Langue',
    'profile.change_password': 'Changer le mot de passe',
    'profile.change_password_text': 'Renseignez votre mot de passe actuel puis le nouveau mot de passe.',
    'profile.current_password': 'Mot de passe actuel',
    'profile.new_password': 'Nouveau mot de passe',
    'profile.confirm_password': 'Confirmer le mot de passe',
    'profile.save_password': 'Mettre à jour le mot de passe',
    'profile.password_updated': 'Mot de passe mis à jour.',
    'profile.password_error': 'Impossible de changer le mot de passe.',
    'profile.password_mismatch': 'La confirmation du mot de passe est incorrecte.',
    'profile.required': 'Champ obligatoire',
    'profile.min_password': 'Minimum 6 caractères',
    'profile.active': 'Actif',
    'profile.inactive': 'Inactif',
    'common.french': 'Français',
    'common.english': 'Anglais'
  },
  en: {
    'header.system_title': 'Management System',
    'header.notifications': 'Notifications',
    'header.permission_required': 'Permission required',
    'header.close': 'Close',
    'header.no_urgent_notifications': 'No urgent notifications',
    'header.notifications_up_to_date': 'All your notifications are up to date',
    'header.click_for_details': 'Click to view details',
    'header.mark_as_read': 'Mark as read',
    'header.calculated_notification': 'Automatically calculated notification',
    'header.profile': 'Profile',
    'header.logout': 'Logout',
    'header.language': 'Language',
    'header.user': 'User',
    'header.administrator': 'Administrator',
    'header.manager': 'Manager',
    'header.unknown': 'Unknown',
    'header.enable_reminders': 'Enable reminders every 10 minutes',
    'header.disable_reminders': 'Disable reminders',
    'header.remember': 'Reminders',
    'profile.page_title': 'Profile',
    'profile.breadcrumb_security': 'Security',
    'profile.breadcrumb_profile': 'Profile',
    'profile.connected_profile': 'Connected profile',
    'profile.connected_profile_text': 'Information about the account currently connected to the application.',
    'profile.full_name': 'Full name',
    'profile.login': 'Login',
    'profile.role': 'Role',
    'profile.status': 'Status',
    'profile.active_session': 'Active session',
    'profile.language': 'Language',
    'profile.change_password': 'Change password',
    'profile.change_password_text': 'Enter your current password, then the new password.',
    'profile.current_password': 'Current password',
    'profile.new_password': 'New password',
    'profile.confirm_password': 'Confirm password',
    'profile.save_password': 'Update password',
    'profile.password_updated': 'Password updated.',
    'profile.password_error': 'Unable to change the password.',
    'profile.password_mismatch': 'Password confirmation does not match.',
    'profile.required': 'Required field',
    'profile.min_password': 'Minimum 6 characters',
    'profile.active': 'Active',
    'profile.inactive': 'Inactive',
    'common.french': 'French',
    'common.english': 'English'
  }
};

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private readonly storageKey = 'appLanguage';
  private readonly languageSubject = new BehaviorSubject<AppLanguage>(this.getInitialLanguage());

  readonly language$ = this.languageSubject.asObservable();

  constructor() {
    this.applyDocumentLanguage(this.languageSubject.value);
  }

  get currentLanguage(): AppLanguage {
    return this.languageSubject.value;
  }

  setLanguage(language: AppLanguage): void {
    if (language === this.languageSubject.value) {
      return;
    }
    localStorage.setItem(this.storageKey, language);
    this.languageSubject.next(language);
    this.applyDocumentLanguage(language);
  }

  instant(key: string): string {
    const language = this.languageSubject.value;
    return TRANSLATIONS[language][key] || TRANSLATIONS.fr[key] || key;
  }

  private getInitialLanguage(): AppLanguage {
    const stored = localStorage.getItem(this.storageKey);
    return stored === 'en' ? 'en' : 'fr';
  }

  private applyDocumentLanguage(language: AppLanguage): void {
    document.documentElement.lang = language;
  }
}
