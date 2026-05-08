// Fichier de test pour vérifier que les méthodes du StockService sont accessibles
import { StockService } from './service/stock.service';

export function testStockMethods() {
  const service = new StockService(null as any);

  // Test des méthodes
  const result1 = service.getVentesNonSortiesStock({});
  const result2 = service.getVenteDetailsForStock(1);
  const result3 = service.createSortieStockFromVente(1, []);

  return {
    getVentesNonSortiesStock: result1,
    getVenteDetailsForStock: result2,
    createSortieStockFromVente: result3
  };
}
