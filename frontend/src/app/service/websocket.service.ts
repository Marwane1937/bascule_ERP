import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private ws: WebSocket | null = null;
  private messageSubject = new Subject<any>();
  public messages$ = this.messageSubject.asObservable();

  constructor() {
    this.connect();
  }

  connect(): void {
    this.ws = new WebSocket('ws://localhost:3500');

    this.ws.onopen = () => {
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.messageSubject.next(data);
    };

    this.ws.onclose = () => {
      console.warn('❌ WebSocket fermé');
      setTimeout(() => this.connect(), 3000); // tentative de reconnexion
    };

    this.ws.onerror = (error) => {
      console.error('Erreur WebSocket :', error);
    };
  }

  sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket non connecté, message non envoyé');
    }
  }

  
}
