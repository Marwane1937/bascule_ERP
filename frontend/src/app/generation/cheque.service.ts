import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class ChequeGenerationService {
    private apiUrl = `${environment.apiUrl}/generation/cheque`;

    constructor(private http: HttpClient) { }

    getReglementsCheque(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/reglements`);
    }

    loadEditorData(regleId: any, banqueId: number): Observable<any> {
        const idPath = regleId ? regleId : 'new';
        return this.http.get<any>(`${this.apiUrl}/edit/${idPath}?banqueId=${banqueId}`);
    }

    loadEditorDataWithTemplate(regleId: any, banqueId: number, templateId: number | null, docType: 'CHEQUE' | 'EFFET'): Observable<any> {
        const idPath = regleId ? regleId : 'new';
        const params = new URLSearchParams();
        params.set('banqueId', String(banqueId));
        if (templateId) params.set('templateId', String(templateId));
        if (docType) params.set('docType', docType);
        return this.http.get<any>(`${this.apiUrl}/edit/${idPath}?${params.toString()}`);
    }

    /**
     * Charger un règlement existant sans forcer banqueId/templateId côté frontend.
     * Le backend résout banqueId depuis regle_settings.compte_bnq et templateId depuis regle_settings.mode.
     */
    loadExistingEditorData(regleId: any): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/edit/${regleId}`);
    }

    saveFieldConfig(fieldId: number, config: any): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/save-field/${fieldId}`, config);
    }

    getBanques(): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/banques`);
    }

    getTemplates(banqueId: number, docType?: 'CHEQUE' | 'EFFET'): Observable<any[]> {
        const params = new URLSearchParams();
        params.set('banqueId', String(banqueId));
        if (docType) params.set('docType', docType);
        return this.http.get<any[]>(`${this.apiUrl}/templates?${params.toString()}`);
    }

    getTemplate(templateId: number): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/template/${templateId}`);
    }

    updateTemplate(templateId: number, payload: any): Observable<any> {
        return this.http.put<any>(`${this.apiUrl}/template/${templateId}`, payload);
    }

    getCalibration(banqueId: number): Observable<any> {
        return this.http.get<any>(`${this.apiUrl}/calibration?banqueId=${banqueId}`);
    }

    saveCalibration(payload: { id?: number; banqueId: number; imprimante?: string | null; offset_x_mm: number; offset_y_mm: number }): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/calibration`, {
            id: payload.id,
            banqueId: payload.banqueId,
            imprimante: payload.imprimante ?? null,
            offset_x_mm: payload.offset_x_mm,
            offset_y_mm: payload.offset_y_mm
        });
    }

    /**
     * Liste des images-modèles disponibles pour aider au paramétrage.
     * Source: `frontend/src/assets/img/generation/models.json`
     */
    getModelImages(): Observable<string[]> {
        return this.http.get<string[]>(`assets/img/generation/models.json`);
    }

    generatePDF(regleId: any, isPreview: boolean, data: any = null): Observable<Blob> {
        return this.http.post(`${this.apiUrl}/generate-pdf/${regleId}`, { isPreview, data }, { responseType: 'blob' });
    }

    saveChequeData(regleId: any, data: any): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/save-data/${regleId}`, data);
    }

    convertirMontantLettres(montant: number): string {
        return `${montant}`; // Placeholder handled in component
    }
}
