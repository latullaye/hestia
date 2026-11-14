# Feuille de route et décisions

## Ce qui existe (v0.1)

Calendrier relié à Google Agenda avec approbations, repas et plats, courses par rayon, tâches régulières et ponctuelles,
anniversaires, décomptes, kiosque, interphone, connecteur MCP, notifications push, journal, hors-ligne, mode démo.
Détail : [FEATURES.md](FEATURES.md).

## État du déploiement

- Base : toutes les migrations du dépôt sont appliquées au projet (jusqu'à `20261114012829_plain_notifications.sql`),
  **sauf** `20261114020000_cleanup.sql` (ménage quotidien
  des vieux rappels et notifications). Elle partira au prochain passage du flux « Deploy Supabase » ; d'ici là, rien ne
  casse, les vieilles lignes s'accumulent simplement.
- Fonctions : à déployer par le flux « Deploy Supabase » ([SETUP.md](SETUP.md), étape 2).

## Ensuite (par ordre de valeur estimée)

| Idée | Notes pour qui s'y met |
|---|---|
| **Vue mois** dans l'agenda et sur le kiosque | `eventsOn` par jour existe ; il manque la grille. |
| **Transcription côté serveur** pour l'interphone | Pour les appareils sans reconnaissance vocale (Fire, iPad installé). `intercom` accepterait un audio ; il faut un service de transcription et sa clé. L'API de Claude ne prend pas l'audio. |
| **Mot d'éveil** sur le kiosque (« Hestia… ») | Écoute continue : à étudier (vie privée, batterie, fiabilité du navigateur). |
| **Statistiques** : fréquence d'achat, répartition des tâches, plats les plus cuisinés | Les données sont dans `activity_log` et la vue `purchases` ; il manque les écrans. |
| **Du plat à la liste** : ajouter les ingrédients d'un plat prévu aux courses | Claude sait déjà le faire par l'interphone ; un bouton dans la fiche du repas le rendrait direct. |
| **Suggestions de repas** selon l'historique et la saison | Outil + bouton. |
| **Anniversaires vers Google** | Aujourd'hui, ils se lisent depuis Google ; un anniversaire créé dans Hestia n'y va pas. |
| **Notifications Google en direct** (webhooks « watch ») | Remplacerait l'attente de 10 minutes dans le sens Google → Hestia. |
| **Tâches : historique et équité** | Qui a fait quoi sur un mois ; points, si un jour les enfants participent. |
| **Arrimage plus étroit avec l'app santé du bébé** | Aujourd'hui par l'agenda Google partagé. Une lecture directe de ses rendez-vous éviterait de deviner par le titre. |
| **Comptes enfants** | Rôle `child` avec compte : vue réduite, ses tâches. Les règles d'accès distinguent déjà adulte et appareil. |
| **Inventaire** (congélateur, garde-manger) | Nouveau domaine : suivre « Faire évoluer » dans [ARCHITECTURE.md](ARCHITECTURE.md). |
| **Alléger la copie locale** | Les occurrences de tâches et les événements anciens s'accumulent : ne garder sur l'appareil que les 12 derniers mois. |
| **Mot de passe oublié / changement dans l'app** | Aujourd'hui par le tableau de bord Supabase. |

## Décisions prises, et pourquoi

| Décision | Raison | Ce qui la ferait changer |
|---|---|---|
| Une seule app pour le téléphone et le kiosque | Un code, une base, une doc. | Un kiosque aux besoins très différents (affichage passif sur e-ink, par exemple). |
| Supabase (Postgres, Auth, Realtime, Edge Functions) | Tout le serveur sans serveur à gérer ; déjà utilisé par l'autre app de la famille. | — |
| Synchro « maison » plutôt qu'une bibliothèque | Peu de tables, peu d'utilisateurs : 300 lignes lisibles valent mieux qu'une dépendance lourde. Dernière écriture gagne. | Des conflits réels entre appareils (édition simultanée de textes longs). |
| Journal par déclencheurs SQL | Aucun chemin d'écriture ne peut l'oublier. | — |
| Les occurrences de tâches sont écrites en base | Notifications, statistiques et hors-ligne en dépendent ; la règle est une seule fonction SQL. | — |
| Repas hors de Google Agenda | Demande explicite. | — |
| Google reste un miroir ; Hestia garde ce que Google ignore | L'agenda de la famille reste utilisable partout ; pas de champs cachés indispensables dans Google. | — |
| Connexion par courriel et mot de passe, comptes créés à la main | Deux adultes et une tablette : simple, et aucun courriel à envoyer. | Plus de membres avec compte. |
| Jeton personnel dans l'adresse du connecteur | claude.ai n'envoie pas d'en-têtes personnalisés ; le jeton est long, propre à chacun, révocable. | Prise en charge d'OAuth par le connecteur. |
| Reconnaissance vocale du navigateur | Gratuite, instantanée, bonne en français sur Chrome. | Un kiosque sans Chrome : voir « Transcription côté serveur ». |
| `claude-opus-5-5`, effort `low`, pour l'interphone | Comprend les demandes floues et choisit bien ses outils ; l'effort bas garde la réponse rapide. | Coût ou latence : `HESTIA_MODEL`. |
| Interface et doc en français, code en anglais | La famille parle français ; le code suit l'usage. | — |
