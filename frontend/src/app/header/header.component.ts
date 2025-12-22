import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, User, Societe } from '../service/auth.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit {
  currentUser: User | null = null;
  societes: Societe[] = [];
  selectedSociete: Societe | null = null;
  isLoadingSocietes = false;

  constructor(
    private authService: AuthService,
    private router: Router
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
        this.loadSocietes();
      }
    });

    // S'abonner aux changements de société
    this.authService.currentSociete$.subscribe(societe => {
      this.selectedSociete = societe;
    });
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
}
