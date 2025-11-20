const APP_CONFIG = {
  appName: "Compta locale",
  storageKey: "comptaLocaleTemplate",
  exportFilePrefix: "compta",
  theme: {
    colors: {
      primary: "#0f172a",
      accent: "#10b981",
      bg: "#f6f7fb",
      surface: "#ffffff",
      text: "#0f172a",
      muted: "#475569",
      border: "#d6dde8",
    },
    metaThemeColor: "#0f172a",
  },
  branding: {
    employerLogoSrc: "logoOfficielRMS.svg",
    employerLogoAlt: "Logo RMS Suite",
    previewLogoSrc: "logoOfficielRMS.svg",
    footerText: "Compta locale — RMS Suite",
    footerLogoSrc: "logo-footer-placeholder.svg",
    footerLogoAlt: "Logo partenaire",
  },
  pwa: {
    cacheName: "compta-locale-cache-v1",
    iosHintStorageKey: "iosA2hsHintDismissed",
    assets: [
      "./",
      "./index.html",
      "./calendar.html",
      "./contacts.html",
      "./support.html",
      "./artisan.html",
      "./mode-emploi.html",
      "./styles.css",
      "./config.js",
      "./app.js",
      "./manifest.webmanifest",
      "./logoOfficielRMS.svg",
      "./logo-footer-placeholder.svg",
      "./icons/icon-192.png",
      "./icons/icon-512.png",
    ],
  },
  images: {
    ticketMaxDimension: 1600,
    ticketMaxBytes: 700 * 1024,
    signatureMaxDimension: 1000,
    signatureMaxBytes: 450 * 1024,
  },
  accounting: {
    currency: "EUR",
    statuses: ["prévu", "enregistré", "payé"],
    paymentMethods: ["CB", "Espèces", "Virement", "Chèque", "Prélèvement"],
    tvaRates: [0, 5.5, 10, 20],
    incomeCategories: [
      "Ventes produits",
      "Prestations de services",
      "Abonnements",
      "Locations",
      "Formation",
      "Commissions",
      "Licence logicielle",
      "Maintenance / support",
      "Subventions / primes",
      "Autre recette",
    ],
    expenseCategories: [
      "Achats marchandises",
      "Matières premières",
      "Sous-traitance / prestations",
      "Abonnements & logiciels",
      "Loyer / charges / énergie",
      "Télécom & internet",
      "Transport / carburant / livraison",
      "Marketing / publicité",
      "Honoraires (compta / juridique)",
      "Impôts / taxes / cotisations",
      "Investissements / matériel",
      "Autre dépense",
    ],
  },
  texts: {
    header: {
      tagline:
        "Centralisez vos écritures comptables, stockez-les hors ligne et exportez un journal clair prêt à imprimer.",
      summaryPlaceholder:
        "Période active : du {start} au {end} — {datetime}",
    },
    usage: {
      title: "Mode d'emploi simplifié",
      intro:
        "Tous vos montants et pièces restent en local (navigateur). Exportez un JSON pour sauvegarder ou migrer vos dossiers.",
      steps: [
        {
          title: "Saisie rapide",
          description:
            "Ajoutez vos recettes et dépenses avec TVA, moyen de paiement et statut. Les totaux se recalculent automatiquement.",
        },
        {
          title: "Contacts réutilisables",
          description:
            "Créez vos fiches clients et fournisseurs pour alimenter les listes déroulantes des écritures.",
        },
        {
          title: "Pièces justificatives",
          description:
            "Importez des photos compressées de factures ou tickets et reliez-les à une écriture via le n° de pièce.",
        },
        {
          title: "Exports & import",
          description:
            "Sauvegardez le dossier au format JSON, réimportez-le plus tard et continuez la saisie sans connexion.",
        },
        {
          title: "Impression locale",
          description:
            "Produisez un journal des écritures ou une mosaïque des pièces au format A4 paysage.",
        },
      ],
    },
    fileOrganization: {
      title: "Organisation des fichiers",
      intro:
        "Rangez vos exports et pièces dans des sous-dossiers pour sécuriser vos sauvegardes locales ou partagées.",
      steps: [
        "Créez un dossier /Comptabilite puis /Exports et /PiecesJustificatives.",
        "Exportez le JSON après chaque session et déplacez-le dans /Exports.",
        "Glissez les copies de vos factures dans /PiecesJustificatives (ou faites une capture photo ici).",
        "Pour reprendre un dossier, cliquez sur « Importer » et sélectionnez le JSON correspondant.",
      ],
      downloadLabel: "Télécharger la structure recommandée",
      openLabel: "Ouvrir les fichiers téléchargés",
      reminder:
        "Astuce : nommez vos fichiers avec l'année et le mois (ex : compta-2024-04.json) pour garder l'historique clair.",
      downloadUrl: "#",
    },
    generalInfo: {
      title: "Informations du dossier comptable",
    },
    tabs: {
      dashboard: "Tableau de bord",
      incomes: "Recettes",
      expenses: "Dépenses",
      clients: "Clients",
      fournisseurs: "Fournisseurs",
      pieces: "Pièces justificatives",
      exports: "Exports & impression",
    },
    preview: {
      title: "Journal comptable & sauvegarde",
    },
    buttons: {
      save: "Exporter en JSON",
      load: "Importer un dossier",
      reset: "Réinitialiser le dossier",
      printWeek: "Imprimer le journal",
      printFuel: "Imprimer les pièces",
    },
    pwa: {
      installButton: "Ajouter à l’écran d’accueil",
      iosHint:
        "Pour ajouter cette compta sur votre écran d’accueil iPhone ou iPad : ouvrez le menu <strong>Partager</strong> de Safari puis choisissez <strong>« Sur l’écran d’accueil »</strong>.",
      iosAlert: "Sur iOS, utilisez le menu Partager puis « Sur l'écran d'accueil ».",
    },
    alerts: {
      storageError:
        "Le stockage local a échoué (données trop volumineuses). Réduisez la taille des images ou supprimez-en quelques-unes.",
      invalidJson: "Ce fichier n'est pas valide ou dépasse la limite autorisée.",
      unreadableFile: "Impossible de lire ce fichier.",
      signatureTooLarge:
        "La signature est trop volumineuse. Réessayez avec une image plus légère (PNG recommandé).",
      signatureImportError: "La signature n'a pas pu être importée.",
      ticketTooLarge:
        "L'image de la pièce est trop volumineuse. Choisissez un fichier plus léger.",
      ticketProcessError:
        "La pièce justificative n'a pas pu être chargée. Essayez avec une image plus petite.",
      ticketImportDrop:
        "Certaines pièces étaient trop volumineuses et n'ont pas pu être importées : {tickets}.",
      fileManagerReminder:
        "Après le téléchargement, déplacez vos fichiers exportés vers votre dossier projet.",
    },
    prompts: {
      resetConfirm: "Supprimer toutes les données du dossier et recommencer ?",
    },
  },
};
