# Guide pour qui reprend le développement (agent ou humain)

Hestia est l'application de la maison d'une famille : calendrier, repas, courses, tâches, anniversaires, kiosque de
cuisine, interphone vocal, connecteur MCP. Elle est appelée à grandir (« FamilyOS ») : chaque ajout doit rester simple à
reprendre. Lire d'abord [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), puis [docs/DATA_MODEL.md](docs/DATA_MODEL.md).

## Règles qui ne se discutent pas

1. **Le dépôt est public : aucune donnée personnelle, aucun secret.** Pas de prénom réel, courriel, date de naissance,
   anniversaire, liste de courses, adresse, identifiant de calendrier, clé d'API, mot de passe de base, jeton. Dans le code,
   les commentaires, les tests, la doc et les messages de commit, la famille est fictive : Alex, Sam, Léo (enfant), Kiosque.
   Les données réelles s'insèrent par `supabase/seed/family.private.sql` (ignoré par git) ou par l'app. L'adresse du projet
   Supabase et sa clé « publishable » sont publiques par nature (elles sont dans l'app) : `src/config.ts`.
2. **Les secrets vont dans Supabase › Edge Functions › Secrets** (ou `private.config`), jamais dans le dépôt, jamais dans
   une variable `VITE_*` (tout ce qui est `VITE_*` finit dans l'app publique).
3. **Rien n'est supprimé pour de bon.** Suppression = `deleted_at` ; un événement s'annule (`status`), une tâche se passe.
4. **Toute écriture dit qui et d'où** : `updated_by` (membre) et `updated_via` (`app`, `kiosk`, `intercom`, `mcp`, `gcal`,
   `system`). Le journal (`activity_log`) est écrit par des déclencheurs, jamais par le code applicatif.
5. **Un changement de schéma = une nouvelle migration** dans `supabase/migrations/` (jamais modifier une migration déjà
   appliquée en production), avec son test dans `scripts/test-db.sql`.
6. **Un nouvel outil pour Claude s'écrit une seule fois**, dans `supabase/functions/_shared/tools-*.ts` : il sert au MCP et
   à l'interphone. Avec son test dans `tests/tools.test.ts`.
7. **La doc suit le code dans le même commit.** Une fonctionnalité sans sa ligne dans `docs/FEATURES.md` n'est pas finie.

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `npm run dev` | L'app en local. `http://localhost:5173/?demo` : famille fictive, sans compte. |
| `npm run check` | Types (app, tests, code partagé). |
| `npm test` | Tests unitaires (dates, rythmes des tâches, conventions Google Agenda). |
| `npm run test:db` | Applique les migrations sur un Postgres jetable et vérifie les règles (`scripts/test-db.sql`). |
| `npm run test:tools` | Idem, puis les outils et la synchro Google Agenda contre cette base. |
| `npm run check:functions` | Types des Edge Functions (Deno). |
| `npm run check:privacy` | Cherche secrets et courriels réels dans les fichiers suivis par git (lancé par la CI). |
| `npm run build` | Construit l'app dans `dist/`. |
| `npm run icons` | Régénère les icônes PNG depuis `public/icons/icon.svg`. |

`test:db` et `test:tools` demandent les binaires du serveur PostgreSQL (`initdb`, `pg_ctl`), pas Docker ni la CLI Supabase.
La CI (`.github/workflows/ci.yml`) lance tout cela à chaque pull request.

## Carte du dépôt

```
src/                      l'app web (React + TypeScript + Vite)
  lib/store.ts            copie locale des tables, file d'attente hors ligne, synchro
  lib/session.tsx         qui utilise l'app (adulte, kiosque, démo)
  lib/domain.ts           ce que les écrans affichent, calculé depuis les tables
  lib/demo.ts             la famille fictive de ?demo
  pages/                  un fichier par écran (Kiosk.tsx : la tablette)
  components/             feuilles d'édition, interphone, bannière d'installation
  sw.ts                   service worker : hors ligne et notifications
supabase/
  migrations/             le schéma, dans l'ordre
  functions/_shared/      code commun aux fonctions ET à l'app (sans dépendance à Deno, sauf runtime.ts)
    tools*.ts, registry.ts  les outils de Claude (MCP + interphone)
    gcal*.ts, calendar-codec.ts  le miroir Google Agenda
    schedule.ts           rythmes des tâches (même règle que private.chore_matches en SQL)
  functions/mcp|intercom|gcal-sync|notify/   les quatre points d'entrée
  seed/family.example.sql le modèle des données de la famille
scripts/                  tests de base, vérification des fonctions, icônes
tests/                    tests (vitest)
docs/                     la documentation
```

## Pièges connus

- `private.chore_matches` (SQL) et `matches` (`_shared/schedule.ts`) sont la même règle écrite deux fois : changer les deux,
  et leurs tests (`scripts/test-db.sql`, `tests/shared.test.ts`).
- Les déclencheurs « avant » s'exécutent par ordre alphabétique : `touch` (auteur, horodatage) puis ceux préfixés `v_`.
- Une écriture faite par le serveur à la place de Google met `updated_via = 'gcal'` : c'est ce qui évite la boucle
  Hestia → Google → Hestia. Ne pas l'oublier dans un nouveau chemin d'écriture.
- L'app n'envoie jamais les colonnes que le serveur possède (`SERVER_COLUMNS` dans `src/lib/store.ts`). Une nouvelle colonne
  calculée par un déclencheur s'ajoute à cette liste.
- Une migration qui crée une fonction dans `private` doit finir par les deux lignes `revoke execute on all functions in
  schema private from public, anon, authenticated;` puis `grant execute on function …` (voir la fin de la migration 05) :
  Postgres donne `execute` à tout le monde par défaut.
- Une colonne dont la valeur par défaut appelle une fonction de `private` (ex. `chores.start_date`) exige que
  `authenticated` puisse exécuter cette fonction.
- Les quatre `deno.json` des fonctions sont identiques : les garder en phase, et en phase avec les versions de `package.json`.
- Les fonctions sont déployées avec `verify_jwt = false` et vérifient elles-mêmes l'appelant (`_shared/http.ts`).
- L'interphone utilise `claude-opus-5-5` par défaut (secret `HESTIA_MODEL` pour changer), effort `low`, avec repli côté
  serveur (`fallbacks: "default"`).

## Style

Code et commentaires en anglais, interface et documentation en français (Québec). Commentaires : le pourquoi, pas le quoi.
Pas de dépendance ajoutée sans raison : l'app tient en peu de bibliothèques, c'est voulu.
