export interface AssistantStep {
  module: string;
  menu: string;
  action: string;
  highlightId: string;
  steps: string[];
  navigation: {
    routerLink: string;
    scrollTarget: string;
    focus: string;
  };
}

export const assistantSteps: AssistantStep[] = [
  {
    module: "Base/client",
    menu: "Clients → Ajouter un client",
    action: "create-client",
    highlightId: "btn-add-client",
    steps: [
  "Connectez-vous à l’application",
    "Cliquez sur « Fournisseurs » dans la barre de navigation",
    "Sélectionnez « Ajouter un fournisseur »",
    "Remplissez les champs requis : Nom, Adresse, Téléphone",
    "Ajoutez les infos optionnelles : Fax, E-mail, Site web",
    "Cliquez sur « Enregistrer »",
    "Vérifiez la confirmation d'ajout"
    ],
    navigation: {
      routerLink: "/clients/add",
      scrollTarget: "form-client",
      focus: "input-nom-client"
    }
  },

    {
    module: "Base/fournisseur",
    menu: "fournisseurs → Ajouter un fournisseur",
    action: "create-fournisseur",
    highlightId: "btn-add-client",
    steps: [
     "Connectez-vous à l’application",
    "Cliquez sur « Fournisseurs » dans la barre de navigation",
    "Sélectionnez « Ajouter un fournisseur »",
    "Remplissez les champs requis : Nom, Adresse, Téléphone",
    "Ajoutez les infos optionnelles : Fax, E-mail, Site web",
    "Cliquez sur « Enregistrer »",
    "Vérifiez la confirmation d'ajout"
    ],
    navigation: {
      routerLink: "/fournisseurs/add",
      scrollTarget: "form-fournisseurs",
      focus: "input-nom-fournisseurs"
    }
  },
  {
    module: "Ventes",
    menu: "Ventes → Devis → Ajouter un devis",
    action: "create-devis",
    highlightId: "btn-add-devis",
    steps: [
      "Va dans le module « Ventes → Devis »",
      "Clique sur « Ajouter un devis »",
      "Sélectionne le client concerné",
      "Ajoute les articles avec quantités et remises",
      "Vérifie les informations",
      "Clique sur « Enregistrer »"
    ],
    navigation: {
      routerLink: "/devis/add",
      scrollTarget: "form-devis",
      focus: "select-client"
    }
  }
  // Tu peux ajouter d'autres modules ici…
];