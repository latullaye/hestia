# Hestia

Le centre de la maison : calendrier de la famille, repas, courses, tâches ménagères, anniversaires. Une application web
installable (PWA) pour les téléphones et l'ordinateur, une vue **kiosque** pour la tablette de la cuisine, et un
**interphone** vocal qui agit à la demande (« il faut acheter des œufs »).

| | |
|---|---|
| **Calendrier** | Événements de la famille, reliés dans les deux sens à Google Agenda « Family ». Chaque événement dit qui est concerné ; un enfant est toujours accompagné d'un adulte. Une sortie d'un parent passe par une **demande d'approbation** (notification, approuver ou refuser, commentaires). |
| **Repas** | Lunchs et soupers de la semaine, à partir des plats de la famille (avec recettes), des restes des derniers jours, ou en texte libre (resto). Qui cuisine le soir. Les repas restent dans Hestia, jamais dans Google Agenda. |
| **Courses** | Listes par magasin (Épicerie, Costco…), articles classés par rayon dans l'ordre du magasin. Cocher en magasin note qui a acheté quoi et quand. |
| **Tâches** | Tâches régulières (tous les soirs, le mercredi soir, le samedi sinon le dimanche, en mai…), à tour de rôle ou non, et tâches ponctuelles données à quelqu'un. |
| **Anniversaires** | Tableau de l'année, prochains anniversaires, idées de cadeaux, dates « en mémoire » à part. |
| **Kiosque** | La semaine d'un coup d'œil, météo de Montréal (Open-Meteo), courses, tâches du jour, anniversaires à venir, décomptes. |
| **Interphone** | Un bouton, une phrase : Claude agit avec les mêmes outils que le connecteur MCP. |
| **Claude (MCP)** | Hestia est un connecteur pour Claude : lire et modifier la maison depuis une conversation. |
| **Journal** | Chaque action est notée (qui, quoi, quand, d'où), pour l'historique et les statistiques. |
| **Hors ligne** | L'app s'ouvre et fonctionne sans réseau ; les changements partent au retour du réseau. |

En ligne : `https://<utilisateur>.github.io/hestia/` (voir [docs/SETUP.md](docs/SETUP.md)). Pour l'essayer sans compte, avec une
famille fictive : ajouter `?demo` à l'adresse (`?demo=kiosk#/kiosk` pour le kiosque).

## Par où commencer

| Vous voulez… | Lisez |
|---|---|
| Mettre Hestia en service (Supabase, Google Agenda, téléphones, tablette) | [docs/SETUP.md](docs/SETUP.md) |
| Comprendre comment c'est construit | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Connaître les tables et leurs règles | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) |
| Savoir ce que fait chaque écran, et les règles métier | [docs/FEATURES.md](docs/FEATURES.md) |
| Brancher Claude, ou ajouter un outil à l'interphone | [docs/MCP.md](docs/MCP.md) |
| Installer la tablette de la cuisine | [docs/KIOSK.md](docs/KIOSK.md) |
| Voir ce qui est prévu, et les décisions prises | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Reprendre le développement (humain ou agent) | [CLAUDE.md](CLAUDE.md) |

## En deux minutes

```bash
npm install
```

```bash
npm run dev
```

Puis ouvrir `http://localhost:5173/?demo` : toute l'app tourne avec des données fictives, sans compte ni réseau.

Vérifier avant de pousser :

```bash
npm run check && npm test && npm run build && npm run test:tools
```

## Renseignements personnels

Ce dépôt est **public**. Rien de ce qui identifie la famille n'y est écrit : ni prénoms, ni courriels, ni anniversaires, ni
listes, ni identifiant de calendrier, ni clé. Ces données vivent dans la base (derrière la connexion) et dans les secrets
des fonctions. Les exemples et les tests utilisent une famille fictive. La règle complète est dans [CLAUDE.md](CLAUDE.md).
