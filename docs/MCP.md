# Claude et Hestia : connecteur MCP et interphone

Les mêmes outils servent à deux endroits :

- **le connecteur MCP** (fonction `mcp`) : depuis une conversation avec Claude ;
- **l'interphone** (fonction `intercom`) : depuis le bouton micro de l'app ou du kiosque.

Ils sont définis une seule fois dans `supabase/functions/_shared/` (`tools.ts`, `tools-calendar.ts`, `tools-home.ts`,
`registry.ts`).

## Brancher Claude

1. Dans Hestia : **Plus › Réglages › Connecteur Claude › Créer une adresse de connecteur**. L'adresse s'affiche une seule
   fois : la copier. Elle contient un jeton personnel : ce que Claude fait avec est noté à votre nom.
2. Dans Claude (claude.ai) : **Paramètres › Connecteurs › Ajouter un connecteur personnalisé**, coller l'adresse, sans
   authentification.
   Dans Claude Code :

```bash
claude mcp add --transport http hestia "<adresse>"
```

3. Essayer : « Qu'est-ce qui est prévu cette semaine à la maison ? ».

Chaque adulte crée la sienne. Une adresse se révoque au même endroit (elle cesse de fonctionner aussitôt). Le jeton peut
aussi être envoyé en en-tête `Authorization: Bearer hst_…`. Option : `&tz=Europe/Paris` pour parler dans un autre fuseau.

L'adresse donne accès aux données de la famille : la traiter comme un mot de passe.

## Outils

| Outil | Ce qu'il fait |
|---|---|
| `hestia_aujourdhui` | Vue d'ensemble : date, famille, 7 jours d'événements, repas, tâches du jour, courses, anniversaires, décomptes. À appeler en premier. |
| `agenda` | Événements d'une période, filtrables par mots. |
| `evenement_ajouter` | Ajoute un événement : pour qui, accompagné par, approbation demandée à. Refuse un enfant sans accompagnateur. |
| `evenement_modifier` | Change titre, horaire, lieu, personnes ; ou annule. |
| `evenement_decider` | Approuve ou refuse une demande, avec un commentaire. |
| `evenement_commenter` | Lit ou ajoute des commentaires. |
| `repas` | Repas d'une période et derniers plats cuisinés. |
| `plats` | Liste des plats, ou la fiche d'un plat avec sa recette. |
| `plat_enregistrer` | Ajoute ou complète un plat (ingrédients, recette, tags). |
| `repas_planifier` | Indique ce qu'on mange (plat de la liste ou texte libre), pour qui, qui cuisine. |
| `repas_retirer` | Retire ce qui était prévu. |
| `courses` | Ce qu'il faut acheter, par liste et par rayon. |
| `courses_ajouter` | Ajoute des articles (un article connu revient dans son rayon). |
| `courses_cocher` | Acheté, ou finalement pas besoin. |
| `courses_historique` | Achats d'un article et rythme moyen, ou articles les plus achetés. |
| `courses_liste_enregistrer` | Crée une liste, ordonne ses rayons. |
| `taches` | Tâches d'un jour, ou des jours suivants, pour tous ou pour une personne. |
| `tache_cocher` | Fait, à refaire, ou passé pour cette fois. |
| `tache_ajouter` | Tâche ponctuelle, pour soi ou pour quelqu'un. |
| `taches_regles` | Les tâches régulières. |
| `tache_regle_enregistrer` | Crée, modifie, met en pause ou supprime une tâche régulière. |
| `anniversaires` | À venir, d'un mois, ou de l'année. |
| `anniversaire_enregistrer` | Ajoute ou complète (année, note, idées de cadeaux). |
| `decompte_enregistrer` | Ajoute, modifie ou retire un décompte. |
| `journal` | Qui a fait quoi : par domaine, action, personne, mots, période. |

Règles communes : rien n'est supprimé pour de bon ; l'icône d'une tâche, d'une liste ou d'un décompte (« icone ») est un
nom de la liste partagée (`cat`, `trash`, `umbrella`…), jamais un emoji ; les personnes se désignent par leur prénom (ou « moi », « tous »,
« nous deux ») ; les dates sont `AAAA-MM-JJ`, les heures `HH:MM`, à l'heure de la maison ; les réponses sont en français.

Exemples de demandes : « Ajoute les ingrédients de la carbonara à l'épicerie », « Enregistre cette recette dans nos
plats », « Qui a sorti les poubelles ces quatre dernières semaines ? », « Mets les rouleaux de printemps jeudi soir, c'est
moi qui cuisine », « Tous les premiers samedis du mois, on change les draps, à tour de rôle ».

## Ajouter un outil

1. L'écrire avec `tool({...})` dans `tools-calendar.ts` ou `tools-home.ts` (ou un nouveau fichier ajouté à `registry.ts`) :
   `name` (minuscules et `_`), `title`, `description` (ce qu'il fait et quand l'utiliser : c'est ce que Claude lit),
   `shape` (arguments, en zod, chacun décrit), `write`, `run(args, ctx)` qui rend du texte.
2. Lire avec `ctx.db.all(sql, params)`, écrire avec `ctx.db.exec(sql, params)` en posant `updated_by = actorId(ctx)` et
   `updated_via = ctx.via`. Une erreur à faire lire au modèle : `fail("…")`.
3. Ajouter son test dans `tests/tools.test.ts`, lancer `npm run test:tools`.
4. L'ajouter au tableau ci-dessus. Si les règles d'usage changent, compléter `instructions()` dans `registry.ts`.

## L'interphone

- Fonction `intercom` : reçoit `{ text, acting_member_id?, history? }` avec le jeton de l'utilisateur ; rend `{ reply, changed, tools }`.
- Modèle : `claude-opus-5-5` (secret `HESTIA_MODEL` pour en changer), effort `low` pour la vitesse, jusqu'à 8 tours
  d'outils, repli automatique si le modèle décline (`fallbacks: "default"`). Le prompt système et les outils sont mis en cache.
- La voix devient du texte sur l'appareil (API de reconnaissance vocale du navigateur, `fr-CA`) : Chrome sur Android et
  ordinateur, Safari sur iPhone. Là où elle n'existe pas, on écrit ou on dicte au clavier. Brancher une transcription côté
  serveur est prévu dans [ROADMAP.md](ROADMAP.md).
- Chaque échange est dans la table `intercom_log` (utile pour comprendre une réponse et suivre l'usage).
- Clé : secret `ANTHROPIC_API_KEY` de la fonction ([SETUP.md](SETUP.md), étape 5).
