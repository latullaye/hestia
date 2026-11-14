# Architecture

## Vue d'ensemble

```
 Téléphones, ordinateur ─┐                          ┌─ Google Agenda « Family »
 (PWA installée)         │   HTTPS + temps réel     │    (API Calendar)
                         ├──► Supabase ◄────────────┤
 Tablette de la cuisine ─┘    ├ Postgres (tables, règles d'accès, déclencheurs, journal)
 (même PWA, vue kiosque)      ├ Auth (un compte par adulte, un pour la tablette)
                              ├ Realtime (changements en direct)
 Claude (claude.ai, Code) ───►├ Edge Functions
      connecteur MCP          │   mcp        serveur MCP : les outils pour Claude
                              │   intercom   une phrase → Claude + les mêmes outils → actions
 GitHub Pages                 │   gcal-sync  miroir Google Agenda
   └ sert l'app (statique)    │   notify     notifications push et rappels
                              └ pg_cron + pg_net (horaires, appels base → fonctions)
                                         │
                                         └──► API Anthropic (interphone) · services push · Open-Meteo (depuis l'app)
```

Une seule base, une seule app. La tablette n'est pas une deuxième application : c'est la même, connectée avec un compte
« appareil », qui ouvre la route `/kiosk`.

## Choix structurants

| Choix | Pourquoi |
|---|---|
| **Une app, deux visages** (`/` et `/kiosk`) | Un seul code à maintenir ; la tablette accède aussi aux autres écrans. |
| **PWA statique sur GitHub Pages** | Gratuit, simple, rien à administrer. Tout le « serveur » est dans Supabase. |
| **Local d'abord** (`src/lib/store.ts`) | L'app lit toujours sa copie locale (IndexedDB) : elle s'ouvre hors ligne, les écritures sont immédiates et partent quand le réseau revient. |
| **Identifiants créés par l'app** (uuid) | Une écriture hors ligne rejouée deux fois donne le même résultat (upsert). |
| **Suppression douce** (`deleted_at`) | Les appareils hors ligne apprennent les suppressions ; rien n'est perdu. |
| **Journal par déclencheurs** | Quel que soit le chemin (app, kiosque, interphone, Claude, Google), l'action est notée. |
| **Un registre d'outils** (`_shared/registry.ts`) | Le MCP et l'interphone font exactement la même chose, testée une fois. |
| **Hestia enrichit, Google reflète** | Google Agenda reste l'agenda que tout le monde voit ; ce que Google ne sait pas (qui, accompagnateur, approbation) vit dans Hestia. |
| **Données personnelles hors du dépôt** | Le dépôt est public. |

## L'app (`src/`)

- **React + TypeScript + Vite**, routes par `HashRouter` (compatible GitHub Pages), styles en CSS simple (`styles.css`),
  polices Ubuntu (titres, chiffres) et Atkinson Hyperlegible (texte).
- **`lib/store.ts`** : pour chaque table, une copie en mémoire persistée dans IndexedDB.
  - *Lire* : `useTable("events")` rend les lignes locales, tout de suite.
  - *Écrire* : `store.put(table, ligne)` / `store.remove(table, id)` modifient la copie locale et ajoutent l'opération à
    la file d'attente (« outbox », elle aussi persistée).
  - *Synchroniser* : la file part par `upsert` ; puis chaque table est rafraîchie avec `updated_at > dernier vu` ; les
    changements des autres appareils arrivent par Supabase Realtime. Reprise à la reconnexion, au retour au premier plan,
    et toutes les 5 minutes. Dernière écriture gagne.
  - L'app n'envoie pas les colonnes que le serveur possède (`SERVER_COLUMNS`).
- **`lib/session.tsx`** : l'utilisateur est le membre dont `auth_user_id` est le compte connecté. Un compte de rôle
  `device` est le kiosque : on y choisit « qui est là » (oublié après 2 minutes) pour que les actions portent un nom.
- **`sw.ts`** (service worker, Workbox) : copie de l'app pour le hors-ligne, affichage des notifications push, boutons
  « Approuver / Refuser » sur la notification (Android, ordinateur).
- **Mode démo** (`?demo`) : `lib/demo.ts` remplit le magasin avec une famille fictive ; rien ne sort de la page. Sert aux
  essais, aux captures et aux agents sans identifiants.
- **Météo** : Open-Meteo, appelé par l'app, dernière réponse gardée sur l'appareil.

## La base (`supabase/migrations/`)

Détail dans [DATA_MODEL.md](DATA_MODEL.md). En bref :

- schéma `public` : les tables de la famille, toutes protégées par des règles d'accès (RLS) : il faut être un membre actif ;
- schéma `private` (jamais exposé par l'API) : configuration, jetons MCP, fonctions internes ;
- déclencheurs communs : `touch` (horodatage serveur, auteur réel) et `audit` (une ligne au journal) ;
- déclencheurs métier : approbation → notifications ; événement modifié → Google ; règle de tâche modifiée → occurrences ;
- `pg_cron` : occurrences des tâches (chaque nuit), synchro Google (10 min), rappels (15 min), ménage.

## Les fonctions (`supabase/functions/`)

Toutes vérifient elles-mêmes l'appelant (`_shared/http.ts`) :

| Appelant | Preuve |
|---|---|
| L'app | Jeton Supabase de l'utilisateur (`Authorization: Bearer`), vérifié auprès du serveur d'authentification, puis relié à un membre. |
| La base (cron, déclencheurs) | En-tête `x-hestia-secret` = `private.config.internal_secret` (généré à l'installation). |
| Claude (MCP) | Jeton personnel `hst_…` (dans l'adresse ou en `Bearer`), dont seule l'empreinte est gardée. |
| Bouton d'une notification | Jeton à usage de la notification (`notifications.action_token`). |

Le code commun est dans `_shared/`, écrit sans dépendance à Deno (sauf `runtime.ts`) : il tourne aussi dans les tests
(Node) et, pour la logique pure (`time.ts`, `schedule.ts`), dans l'app.

### Interphone

1. L'appareil transforme la voix en texte (reconnaissance vocale du navigateur, `fr-CA`) ; sans elle, on tape ou on dicte
   avec le clavier.
2. `intercom` reçoit le texte, construit le contexte (date, qui parle), et laisse Claude (`claude-opus-5-5`, effort `low`)
   utiliser les outils, en boucle, jusqu'à 8 tours.
3. La réponse (une ou deux phrases) est affichée et lue à voix haute ; l'app se resynchronise.
4. Chaque échange est noté dans `intercom_log` (texte, réponse, outils, durée, jetons).

### Google Agenda (`gcal-sync`)

- **Vers Google** : un événement modifié dans Hestia est marqué `gcal_dirty` ; un déclencheur appelle la fonction, qui le
  crée, le met à jour ou le retire. Le titre porte les conventions de la famille (`Prénom : titre`, `titre (Enfant)`,
  `⏳` en attente), la description un pied « — Hestia — » (statut, accompagnateur).
- **Depuis Google** : toutes les 10 minutes, les événements de la fenêtre (−45 jours, +400 jours) sont lus ; les nouveaux
  entrent (participants devinés par le titre), les modifiés suivent, les disparus sont retirés. Les anniversaires
  (« Anniversaire … », journée entière) alimentent la table `birthdays`.
- Les occurrences d'un événement récurrent de Google ne sont jamais renvoyées vers Google.
- Arrimage avec l'app santé du bébé : elle écrit ses rendez-vous dans le même agenda Google (`titre (Prénom)`) ; Hestia
  les reconnaît par cette convention et demande qui accompagne.

### Notifications (`notify`)

Une ligne dans `notifications` = une entrée dans la boîte de l'app + un envoi push (Web Push, clés VAPID générées au
premier appel et gardées en base). Rappels par `pg_cron` : résumé du matin, rappel du soir, « dans une heure ».

## Déploiement

- **App** : `.github/workflows/deploy-pages.yml` construit et publie sur GitHub Pages à chaque push sur `main`.
- **Supabase** : `.github/workflows/deploy-supabase.yml` applique les migrations et déploie les fonctions (secrets GitHub).
- **Vérifications** : `.github/workflows/ci.yml` à chaque pull request.

## Faire évoluer

Ajouter un domaine (budget, garde, école…) suit toujours le même chemin :

1. une migration : table(s) + `select private.setup_synced_table('ma_table', 'colonne_nom')` + ajout à la publication temps réel ;
2. son type dans `src/lib/types.ts` (et `TABLES`) : la synchro hors ligne vient toute seule ;
3. un écran dans `src/pages/` (et, si utile, une carte sur le kiosque) ;
4. des outils dans `supabase/functions/_shared/tools-*.ts` : le MCP et l'interphone en profitent ;
5. tests (`scripts/test-db.sql`, `tests/`) et documentation (`FEATURES.md`, `DATA_MODEL.md`, `MCP.md`).
