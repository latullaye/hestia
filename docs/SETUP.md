# Mise en service

Tout se fait une fois, dans l'ordre. Compter une heure. Les secrets ne passent jamais par le dépôt ni par une conversation :
ils se saisissent directement dans GitHub, Supabase ou Google.

| Étape | Où | Durée |
|---|---|---|
| 1. Publier l'app | GitHub | 2 min |
| 2. Déployer la base et les fonctions | GitHub + Supabase | 10 min |
| 3. Créer les comptes | Supabase | 5 min |
| 4. Entrer les données de la famille | Supabase | 5 min |
| 5. Brancher l'interphone (clé Anthropic) | Supabase | 2 min |
| 6. Relier Google Agenda | Google Cloud + Supabase | 15 min |
| 7. Installer sur les téléphones | Téléphones | 5 min |
| 8. Installer la tablette | Tablette | voir [KIOSK.md](KIOSK.md) |
| 9. Brancher Claude | Claude | voir [MCP.md](MCP.md) |

## 1. Publier l'app (GitHub Pages)

1. Fusionner la branche de travail dans `main`.
2. Dépôt › **Settings › Pages › Build and deployment › Source** : choisir **GitHub Actions**.
3. Onglet **Actions** : le flux « Deploy web app » se lance à chaque push sur `main` (bouton *Run workflow* pour le lancer à la main).
4. L'app est à `https://<utilisateur>.github.io/hestia/`. Sans base configurée, `?demo` à la fin de l'adresse montre une famille fictive.

## 2. Déployer la base et les fonctions (Supabase)

Le flux « Deploy Supabase » applique les migrations (`supabase/migrations/`) et déploie les quatre fonctions.

1. **Jeton d'accès Supabase** : [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) › *Generate new token*. Le copier.
2. **Mot de passe de la base** : celui choisi à la création du projet. Oublié ? Projet › *Project Settings › Database › Reset database password*.
3. Dépôt GitHub › **Settings › Secrets and variables › Actions** :
   - onglet *Secrets* › *New repository secret* : `SUPABASE_ACCESS_TOKEN` (le jeton), puis `SUPABASE_DB_PASSWORD` (le mot de passe) ;
   - onglet *Variables* › *New repository variable* : `SUPABASE_PROJECT_REF` = la référence du projet (la première partie de son adresse, avant `.supabase.co`).
4. Onglet **Actions › Deploy Supabase › Run workflow**. Il doit finir en vert.
5. Vérifier dans Supabase : *Table Editor* montre les tables (`members`, `events`…) ; *Edge Functions* montre `mcp`, `intercom`, `gcal-sync`, `notify` ; *Database › Extensions* : `pg_cron` et `pg_net` activées (sinon, les activer puis relancer le flux).

Autre voie, à la main, depuis un ordinateur avec la [CLI Supabase](https://supabase.com/docs/guides/cli) :

```bash
supabase login
```

```bash
supabase link --project-ref <référence-du-projet>
```

```bash
supabase db push --include-all
```

```bash
supabase functions deploy
```

L'app pointe vers le projet indiqué dans `src/config.ts` (adresse et clé « publishable », publiques par nature). Pour un
autre projet : changer ces deux valeurs, ou définir `VITE_SUPABASE_URL` et `VITE_SUPABASE_KEY` à la construction.

## 3. Créer les comptes

Supabase › **Authentication** :

1. *Sign In / Providers* : désactiver **Allow new users to sign up** (personne d'autre ne doit pouvoir créer de compte ; même
   ouvert, un compte inconnu ne verrait rien, mais autant fermer).
2. *Users › Add user › Create new user*, en cochant **Auto Confirm User**, pour :
   - chaque adulte (son courriel, un mot de passe) ;
   - la tablette de la cuisine (une adresse à vous, par exemple un alias `+kiosque`, et un mot de passe long).

## 4. Entrer les données de la famille

1. Copier `supabase/seed/family.example.sql` en `supabase/seed/family.private.sql` (ce nom est ignoré par git : il ne sera
   jamais publié).
2. Y mettre les vraies valeurs : prénoms, courriels des comptes de l'étape 3, anniversaires, plats, articles, tâches.
3. Supabase › **SQL Editor** : coller le contenu, *Run*. Le script peut être relancé : il saute ce qui existe déjà.

Relier un compte créé plus tard :

```sql
update public.members set auth_user_id = (select id from auth.users where lower(email) = lower('<courriel>')) where name = '<prénom>';
```

Les anniversaires du calendrier Google « Family » arrivent aussi tout seuls à l'étape 6 (un événement « Anniversaire … »
d'une journée entière devient une ligne ; s'il existe déjà au même jour avec le même prénom, il est simplement relié).

## 5. Brancher l'interphone

1. [console.anthropic.com](https://console.anthropic.com) › *API keys* : créer une clé réservée à Hestia.
2. Supabase › **Edge Functions › Secrets** › ajouter `ANTHROPIC_API_KEY` avec cette clé.
3. Facultatif : `HESTIA_MODEL` pour un autre modèle que `claude-opus-5-5`.

Une clé qui a été copiée ailleurs (courriel, conversation) se remplace : en créer une nouvelle, la mettre dans le secret,
supprimer l'ancienne dans la console.

## 6. Relier Google Agenda « Family »

Il faut l'identifiant du calendrier et un moyen de s'y connecter.

**Identifiant** : Google Agenda (ordinateur) › roue dentée › *Paramètres* › calendrier « Family » › *Intégrer l'agenda* ›
**ID de l'agenda** (de la forme `family…@group.calendar.google.com`). Dans Supabase › Edge Functions › Secrets : `GOOGLE_CALENDAR_ID`.

Puis **l'une** des deux voies.

### Voie A : compte de service (la plus simple si le partage est possible)

1. [console.cloud.google.com](https://console.cloud.google.com) › créer un projet « Hestia » › *API et services › Bibliothèque* › activer **Google Calendar API**.
2. *API et services › Identifiants › Créer des identifiants › Compte de service* (nom : `hestia`). Puis, sur ce compte :
   *Clés › Ajouter une clé › JSON*. Un fichier est téléchargé.
3. Google Agenda › paramètres du calendrier « Family » › *Partager avec des personnes en particulier* › ajouter l'adresse
   du compte de service (`hestia@….iam.gserviceaccount.com`) avec le droit **Apporter des modifications aux événements**.
4. Supabase › Edge Functions › Secrets : `GOOGLE_SERVICE_ACCOUNT_JSON` = tout le contenu du fichier JSON. Supprimer le fichier.

Si Google refuse le partage du calendrier de la famille avec cette adresse, prendre la voie B.

### Voie B : votre propre accès (OAuth)

1. Même projet Google Cloud, API Calendar activée.
2. *API et services › Écran de consentement OAuth* : type **Externe**, vous ajouter comme utilisateur, puis **publier
   l'application** (« En production ») : en mode test, l'accès expire au bout de 7 jours.
3. *Identifiants › Créer des identifiants › ID client OAuth* : type **Application Web**, URI de redirection autorisé :
   `https://developers.google.com/oauthplayground`. Noter l'ID client et le secret.
4. [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground) › roue dentée › cocher *Use your
   own OAuth credentials* et saisir l'ID client et le secret › à gauche, saisir le scope
   `https://www.googleapis.com/auth/calendar.events` › *Authorize APIs* (accepter l'écran d'avertissement) › *Exchange
   authorization code for tokens* › copier le **Refresh token**.
5. Supabase › Edge Functions › Secrets : `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`.

### Vérifier

Dans l'app : **Plus › Réglages › Google Agenda › Synchroniser maintenant**. Les événements des 45 derniers jours et des
400 prochains apparaissent ; ensuite, la synchro tourne toutes les 10 minutes, et tout de suite quand un événement change
dans Hestia. L'état et la dernière erreur s'affichent au même endroit.

## 7. Sur chaque téléphone

1. Ouvrir l'adresse de l'app (iPhone : dans **Safari** ; Android : dans **Chrome**). Un bandeau propose l'installation :
   - iPhone : *Partager › Sur l'écran d'accueil* ;
   - Android : *Installer*.
2. Ouvrir Hestia depuis son icône, se connecter.
3. **Plus › Réglages › Notifications › Activer**, puis *Envoyer une notification de test*.

Sur iPhone, les notifications n'existent que pour l'app installée (iOS 16.4 ou plus récent).

## 8 et 9. Tablette, Claude

Voir [KIOSK.md](KIOSK.md) et [MCP.md](MCP.md).

## Liste de vérification

- [ ] L'app s'ouvre à son adresse, et encore en mode avion après une première ouverture.
- [ ] Chaque adulte se connecte et voit son prénom dans *Plus*.
- [ ] Un article coché sur un téléphone disparaît sur l'autre en quelques secondes.
- [ ] *Réglages › Envoyer une notification de test* arrive.
- [ ] Une demande d'approbation créée par l'un arrive en notification chez l'autre ; la réponse revient.
- [ ] Un événement créé dans Hestia apparaît dans Google Agenda « Family » (avec `⏳` s'il attend un accord), et l'inverse.
- [ ] L'interphone répond à « qu'est-ce qu'on mange ce soir ? ».
- [ ] *Plus › Journal* montre qui a fait quoi.

## En cas de souci

| Symptôme | Piste |
|---|---|
| « Ce compte n'est pas relié à un membre » | Étape 4 : `members.auth_user_id` n'est pas rempli pour ce compte. |
| Pas de notification | Notifications activées sur cet appareil ? Extensions `pg_net` et `pg_cron` actives ? `select * from private.config where key = 'functions_url'` doit rendre une ligne (sinon, ouvrir *Réglages* dans l'app, ou relancer le flux de déploiement). |
| L'interphone dit que la clé manque | Secret `ANTHROPIC_API_KEY` (étape 5). |
| Google Agenda : erreur dans *Réglages* | Lire le message : calendrier introuvable (identifiant, partage), connexion refusée (clé JSON, jeton expiré). |
| Voir ce que font les fonctions | Supabase › Edge Functions › une fonction › *Logs*. Appels programmés : `select * from cron.job_run_details order by start_time desc limit 20`. |
