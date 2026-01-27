import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';

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
    // Convertir http:// en ws:// pour WebSocket
    const wsUrl = environment.apiUrl.replace('http://', 'ws://').replace('/api', '');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.messageSubject.next(data);
    };

    this.ws.onclose = () => {
      setTimeout(() => this.connect(), 3000); // tentative de reconnexion
    };

    this.ws.onerror = (error) => {
    };
  }

  sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
    }
  }

  
}
