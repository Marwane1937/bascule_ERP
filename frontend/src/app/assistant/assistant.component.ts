import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AssistantStep, assistantSteps } from '../assistant-steps.config';

@Component({
  selector: 'app-assistant',
  templateUrl: './assistant.component.html',
  styleUrls: ['./assistant.component.css']
})
export class AssistantComponent {
  messages: { sender: 'marouane' | 'bot', text: string }[] = [];
  userInput = '';
  loading = false;
  showPopup = false;

  constructor(private http: HttpClient, private router: Router) {}

  sendMessage() {
    const input = this.userInput.trim();
    if (!input) return;

    this.messages.push({ sender: 'marouane', text: input });
    this.userInput = '';
    this.loading = true;

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer d41403a18bd6e204ef7462b9e6be0ab56c20fa7a84a6fa3eb75c077507ae45d0'
    });

    const systemPrompt = `
Tu es un assistant intégré à une application Angular de gestion commerciale.
Réponds toujours sous forme de liste claire et étape par étape. Ne parle que du périmètre métier.
`;

    const body = {
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input }
      ]
    };

    this.http.post<any>('https://api.together.xyz/v1/chat/completions', body, { headers }).subscribe(
      res => {
        const reply = res.choices[0].message.content;
        this.messages.push({ sender: 'bot', text: reply });
        this.loading = false;

        const actionDetected = this.detectActionFromReply(reply);
        const stepData = this.getStepsFor(actionDetected);

        if (stepData) {
          // Reset previous highlights
          document.querySelectorAll('.highlighted').forEach(el =>
            el.classList.remove('highlighted')
          );

          this.router.navigate([stepData.navigation.routerLink]);

          setTimeout(() => {
            document.getElementById(stepData.navigation.scrollTarget)?.scrollIntoView();

            const inputElement = document.getElementById(stepData.navigation.focus) as HTMLElement;
            if (inputElement) inputElement.focus();

            document.getElementById(stepData.highlightId)?.classList.add('highlighted');
          }, 300);
        } else {
          this.showPopup = true;
          this.messages.push({
          sender: 'bot',
          text: '❓ Action non reconnue. Tu peux essayer par exemple :\n' +
                '• Ajouter un client\n' +
                '• Créer une facture\n' +
                '• Ajouter un devis\n' +
                '• Consulter les factures\n\n' +
                '💡 Tape par exemple : "Comment créer un client ?"'
        });

        }
      },
      err => {
        this.messages.push({ sender: 'bot', text: '❌ Erreur Together AI.' });
        this.loading = false;
      }
    );
  }

  getStepsFor(action: string): AssistantStep | undefined {
    return assistantSteps.find((step: any) => step.action === action);
  }

  detectActionFromReply(reply: string): string {
    const actionKeywords: Record<string, string> = {
      'ajouter un client': 'create-client',
      'ajouter un devis': 'create-devis',
      'modifier devis': 'edit-devis',
      'voir facture': 'view-invoice'
    };

    for (const keyword in actionKeywords) {
      if (reply.includes(keyword)) return actionKeywords[keyword];
    }
    return '';
  }
}