import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../service/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  showPassword = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.formBuilder.group({
      login: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  ngOnInit(): void {
    // Si déjà connecté, rediriger vers le dashboard
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/Dashbord']);
      return;
    }

    // Vérifier si on vient d'une redirection d'expiration
    const queryParams = this.route.snapshot.queryParams;
    if (queryParams['expired'] === 'true') {
      const message = queryParams['message'] || 'Votre session a expiré. Veuillez vous reconnecter.';
      this.errorMessage = message;
    }
  }

  onSubmit(): void {

    if (this.loginForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';

      const { login, password } = this.loginForm.value;

      this.authService.login(login, password).subscribe({
        next: (response) => {
          if (response.success) {
            this.router.navigate(['/Dashbord']);
          } else {
            this.errorMessage = response.message || 'Erreur de connexion';
          }
          this.isLoading = false;
        },
        error: (error) => {
          this.errorMessage = error.error?.message || 'Erreur de connexion';
          this.isLoading = false;
        }
      });
    } else {
      this.errorMessage = 'Veuillez remplir tous les champs';
    }
  }

  getFieldError(fieldName: string): string {
    const field = this.loginForm.get(fieldName);
    if (field?.errors && field.touched) {
      if (field.errors['required']) {
        return `${fieldName} est requis`;
      }
      if (field.errors['minlength']) {
        return `${fieldName} doit contenir au moins 6 caractères`;
      }
    }
    return '';
  }
}
