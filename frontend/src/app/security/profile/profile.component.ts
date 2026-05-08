import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import Swal from 'sweetalert2';
import { AuthService, User } from '../../service/auth.service';
import { LanguageService } from '../../service/language.service';
import { UserService } from '../../service/user.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  currentUser: User | null = null;
  loading = false;
  savingPassword = false;
  passwordForm!: FormGroup;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;
  readonly passwordRules = [
    'Minimum 8 caractères',
    'Au moins une lettre majuscule',
    'Au moins une lettre minuscule',
    'Au moins un chiffre',
    'Au moins un caractère spécial'
  ];

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private languageService: LanguageService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8), this.passwordPolicyValidator()]],
      confirmPassword: ['', [Validators.required]]
    }, {
      validators: [this.passwordMatchValidator(), this.passwordDifferentValidator()]
    });

    this.currentUser = this.authService.getCurrentUser();
    this.loading = true;
    this.authService.getMe().subscribe({
      next: (user) => {
        this.currentUser = user;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  get currentLanguageLabel(): string {
    return this.languageService.instant(
      this.languageService.currentLanguage === 'fr' ? 'common.french' : 'common.english'
    );
  }

  getRoleDisplayName(type: number | undefined): string {
    switch (type) {
      case 1:
        return this.languageService.instant('header.administrator');
      case 2:
        return this.languageService.instant('header.user');
      case 3:
        return this.languageService.instant('header.manager');
      default:
        return this.languageService.instant('header.unknown');
    }
  }

  getStatusLabel(): string {
    return Number(this.currentUser?.etat || 0) === 1
      ? this.languageService.instant('profile.active')
      : this.languageService.instant('profile.inactive');
  }

  get userInitials(): string {
    const source = String(this.currentUser?.nom || this.currentUser?.login || 'U').trim();
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'U';
  }

  get passwordStrengthLabel(): string {
    const value = String(this.passwordForm?.get('newPassword')?.value || '');
    if (this.isPasswordStrong(value)) return 'Fort';
    if (value.length >= 8) return 'Moyen';
    return 'Faible';
  }

  get newPasswordControl(): AbstractControl | null {
    return this.passwordForm.get('newPassword');
  }

  get confirmPasswordControl(): AbstractControl | null {
    return this.passwordForm.get('confirmPassword');
  }

  get formErrors(): ValidationErrors | null {
    return this.passwordForm.errors;
  }

  togglePasswordVisibility(field: 'current' | 'new' | 'confirm'): void {
    if (field === 'current') this.showCurrentPassword = !this.showCurrentPassword;
    if (field === 'new') this.showNewPassword = !this.showNewPassword;
    if (field === 'confirm') this.showConfirmPassword = !this.showConfirmPassword;
  }

  submitPasswordChange(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();

    this.savingPassword = true;
    this.userService.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.savingPassword = false;
        this.passwordForm.reset();
        Swal.fire('Succès', this.languageService.instant('profile.password_updated'), 'success');
      },
      error: (err) => {
        this.savingPassword = false;
        Swal.fire('Erreur', err?.error?.message || this.languageService.instant('profile.password_error'), 'error');
      }
    });
  }

  private isPasswordStrong(value: string): boolean {
    return /[A-Z]/.test(value)
      && /[a-z]/.test(value)
      && /\d/.test(value)
      && /[^A-Za-z0-9]/.test(value)
      && value.length >= 8;
  }

  private passwordPolicyValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = String(control.value || '');
      if (!value) return null;
      return this.isPasswordStrong(value) ? null : { weakPassword: true };
    };
  }

  private passwordMatchValidator(): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const next = String(group.get('newPassword')?.value || '');
      const confirm = String(group.get('confirmPassword')?.value || '');
      if (!next || !confirm) return null;
      return next === confirm ? null : { passwordMismatch: true };
    };
  }

  private passwordDifferentValidator(): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const current = String(group.get('currentPassword')?.value || '');
      const next = String(group.get('newPassword')?.value || '');
      if (!current || !next) return null;
      return current !== next ? null : { samePassword: true };
    };
  }
}

