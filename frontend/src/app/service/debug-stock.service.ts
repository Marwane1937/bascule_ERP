import { Injectable } from '@angular/core';
import { StockService } from './stock.service';

@Injectable({
  providedIn: 'root'
})
export class DebugStockService {
  constructor(private stockService: StockService) {}

  checkMethods(): any {
    return {
      service: this.stockService,
      methods: {
        getVentesNonSortiesStock: typeof (this.stockService as any).getVentesNonSortiesStock,
        getVenteDetailsForStock: typeof (this.stockService as any).getVenteDetailsForStock,
        createSortieStockFromVente: typeof (this.stockService as any).createSortieStockFromVente
      },
      debug: (this.stockService as any).debugMethods?.()
    };
  }
}
