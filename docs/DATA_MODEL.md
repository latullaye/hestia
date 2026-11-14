# Modèle de données

Source de vérité : `supabase/migrations/`. Types côté app : `src/lib/types.ts`.

## Colonnes communes aux tables synchronisées

| Colonne | Rôle |
|---|---|
| `id` | Clé (uuid créé par l'app ; texte pour `settings`). |
| `created_at`, `updated_at` | Posés par le serveur. `updated_at` est le curseur de synchro des appareils. |
| `updated_by` | Membre auteur du changement. Forcé au compte connecté pour un adulte ; libre pour le kiosque et le serveur. |
| `updated_via` | `app`, `kiosk`, `intercom`, `mcp`, `gcal`, `system`. |
| `deleted_at` | Suppression douce. |

`private.setup_synced_table(table, colonne_nom)` attache les déclencheurs `touch` et `audit`, l'index et la règle d'accès.

Les colonnes `emoji` (tâches, listes, rayons, décomptes) contiennent le **nom d'une icône** de la liste
`supabase/functions/_shared/icons.ts` (`cat`, `trash`, `shopping-cart`…), que l'app dessine au trait. Leur nom date des
débuts ; les quelques emoji encore présents dans les données sont traduits à l'affichage.

## Tables (`public`)

| Table | Contenu | À savoir |
|---|---|---|
| `members` | Adultes, enfants, appareils (`role` : `adult`, `child`, `device`). | `auth_user_id` relie un compte. `needs_caregiver` : ne va nulle part seul. `aliases` : surnoms reconnus dans les titres Google et à l'interphone. Écriture : adultes seulement. |
| `settings` | Réglages de la maison (clé / JSON). | `household` : `{name, timezone, locale, weather: {label, latitude, longitude}}` ; `reminders` : `{morning, evening, event_minutes_before}`. |
| `events` | Événements. | Voir ci-dessous. |
| `event_comments` | Commentaires d'un événement. | Notifie les adultes concernés. |
| `birthdays` | Anniversaires (`birthday`), dates de couple ou de famille (`anniversary`), souvenirs (`memorial`). | `year` facultatif. `gcal_recurring_id` : la série Google reconnue. |
| `countdowns` | Décomptes. | `yearly` : revient chaque année. |
| `dishes` | Plats de la famille. | `ingredients`, `recipe` en Markdown ; `favorite`, `archived`. |
| `meal_plan` | Un plat à un repas. | `slot` : `lunch`, `dinner` (`breakfast` prévu). `member_ids` vide = tout le monde. `dish_id` ou `label` (texte libre). `kind` : `home`, `leftovers`, `restaurant`, `takeout`, `other`. `cook_ids` : qui cuisine. |
| `shopping_lists`, `shopping_sections` | Listes et rayons (ordre du magasin : `sort_order`). | |
| `shopping_items` | Articles. | Un article reste dans sa liste ; `needed` dit s'il est à acheter. Cocher = `needed = false` + `purchased_at`. `purchase_count` tenu par déclencheur. |
| `chores` | Règles des tâches régulières. | `schedule` (JSON, ci-dessous), `assignment` : `fixed` ou `rotate`. |
| `chore_occurrences` | Ce qui est à faire un jour donné. | Générées depuis les règles ; `chore_id` nul = tâche ponctuelle. `due_until` : dernier jour possible (nul : reste jusqu'à ce que ce soit fait). `status` : `todo`, `done`, `skipped`. |
| `notifications` | Boîte de réception, une ligne par destinataire. | Chaque insertion déclenche un envoi push. |
| `push_subscriptions` | Abonnements Web Push, un par app installée. | |
| `activity_log` | Journal : `at`, `actor_id`, `via`, `action`, `entity_type`, `entity_id`, `label`, `data`. | Écrit par déclencheur uniquement. |
| `intercom_log` | Échanges avec l'interphone. | Écrit par la fonction `intercom`. |
| `purchases` (vue) | Chaque achat, prêt pour les statistiques. | Dérivée du journal. |

### `events`

| Colonnes | Sens |
|---|---|
| `all_day`, `starts_at`, `ends_at`, `start_date`, `end_date` | Horaire. Journée entière : `start_date` / `end_date` (inclus), `starts_at` = minuit local. |
| `participant_ids` | Qui est concerné. Vide = toute la famille. |
| `caregiver_ids` | Qui accompagne les participants `needs_caregiver`. |
| `status` | `confirmed`, `pending` (en attente d'approbation), `declined`, `cancelled`. |
| `approver_ids`, `approval_*` | À qui l'accord est demandé ; qui a décidé, quand, avec quel mot. |
| `kind` | `event`, `medical`, `activity`, `social`, `work`, `travel`, `other`, et `birthday` (masqué : affiché par `birthdays`). |
| `source` | `hestia` ou `gcal` (créé dans Google, ou par une autre app à travers Google). |
| `gcal_*` | Lien avec Google : identifiant, version, « à envoyer », occurrence d'une série. Possédées par le serveur. |

Flux d'approbation : `pending` à la création (ou plus tard) → notification aux `approver_ids` → `confirmed` ou `declined`
→ notification au demandeur. Dans Google : `⏳` devant le titre tant que c'est en attente ; un refus retire l'événement.

### `chores.schedule`

Tous acceptent `grace_days` (l'occurrence reste ouverte N jours de plus).

| Rythme | JSON |
|---|---|
| Tous les jours / tous les N jours | `{"type": "daily"}` · `{"type": "daily", "every": 3}` |
| Jours de la semaine (1 = lundi … 7 = dimanche) | `{"type": "weekly", "weekdays": [3]}` · `{"type": "weekly", "weekdays": [1], "every": 2}` |
| Samedi, sinon dimanche | `{"type": "weekly", "weekdays": [6], "grace_days": 1}` |
| Jours du mois (−1 = dernier) | `{"type": "monthly", "days": [1, 15]}` |
| Nième jour de semaine du mois (−1 = dernier) | `{"type": "monthly", "nth": 1, "weekday": 6}` |
| Dans le courant d'un mois, chaque année | `{"type": "yearly", "months": [5]}` (ouverte du 1er à la fin du mois) |
| Une date, chaque année | `{"type": "yearly", "month": 11, "day": 15}` |

`public.generate_chore_occurrences()` écrit les occurrences des 60 prochains jours (idempotent ; chaque nuit et à chaque
changement de règle). Une règle modifiée retire ce qui restait à faire puis le réécrit ; ce qui est fait ne bouge pas.

### Journal : valeurs de `action`

`create`, `update`, `delete`, `restore` partout ; `purchased`, `needed`, `unneeded` (courses) ; `done`, `reopened`, `skipped`
(tâches) ; `approval_requested`, `approved`, `declined`, `cancelled` (événements). `data` : la ligne à la création, sinon
`{champ: [avant, après]}`. Une réécriture sans changement n'écrit rien. Les lignes générées (`system`) ne sont pas journalisées.

Exemple : à quelle fréquence achète-t-on des œufs ?

```sql
select at::date, actor from public.purchases where name_key = 'oeufs' order by at;
```

## Schéma `private`

| Objet | Rôle |
|---|---|
| `config (key, value)` | `internal_secret`, `functions_url`, `vapid_public`, `vapid_private`, `gcal_last_sync`, et valeurs de repli des secrets (`anthropic_api_key`, `google_calendar_id`, `google_service_account_json`, `google_oauth_*`). |
| `mcp_tokens` | Empreintes des jetons du connecteur Claude. |
| `sent` | Rappels déjà envoyés (pas de doublon). |
| `is_family()`, `is_adult()`, `current_member_id()` | Utilisées par les règles d'accès. |
| `tz()`, `today()` | Fuseau de la maison et « aujourd'hui » dans ce fuseau. |
| `call_function(nom, corps)` | Appel base → fonction (pg_net), sans jamais faire échouer l'écriture qui l'a causé. |

## Accès

- `anon` : aucun droit sur aucune table.
- `authenticated` : lecture et écriture seulement si le compte est un membre actif (`private.is_family()`) ; `members` et
  `settings` en écriture pour les adultes ; `activity_log` et `intercom_log` en lecture seule.
- Les fonctions passent par la connexion directe à la base (`SUPABASE_DB_URL`) et posent elles-mêmes `updated_by` / `updated_via`.
