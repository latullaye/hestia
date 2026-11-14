# Fonctionnalités et règles

Ce que fait chaque partie, et les règles qui ne se voient pas à l'écran. À tenir à jour avec le code.

## Personnes

- **Adultes** : un compte chacun. Tout ce qu'ils font porte leur nom.
- **Enfants** : pas de compte. Un enfant marqué « toujours accompagné » (`needs_caregiver`) ne peut être concerné par un
  événement sans qu'un adulte l'accompagne. Le jour où il grandit, on décoche (Réglages › La famille).
- **Kiosque** : un compte « appareil ». En haut de l'écran, on touche son avatar pour dire « c'est moi » (oublié après
  2 minutes) ; sinon l'action est notée au nom du kiosque.

## Calendrier

- Agenda de la famille, miroir de Google Agenda « Family » dans les deux sens ([ARCHITECTURE.md](ARCHITECTURE.md)).
- **Pour qui** : personne de sélectionné = toute la famille. Dans Google, le titre devient `Prénom : titre` (adultes) ou
  `titre (Prénom)` (enfant) ; à la lecture, ces formes sont reconnues, de même qu'un prénom ou un surnom dans le titre.
- **Accompagné par** : obligatoire à la création dans Hestia si un enfant « toujours accompagné » est concerné. Un
  événement venu de Google sans accompagnateur est signalé (« avec qui ? ») sur le kiosque et dans l'agenda.
- **Approbation** : à la création, si un adulte est seul concerné et qu'il y a un enfant à garder, l'accord de l'autre
  adulte est proposé (décochable). L'événement est « en attente » : `⏳` dans Hestia et dans le titre Google. L'autre reçoit
  une notification avec *Approuver* / *Refuser* (boutons sur Android et ordinateur ; sur iPhone, la notification ouvre
  l'événement) et peut commenter. La réponse revient en notification. Refusé : l'événement sort de Google et reste barré
  dans Hestia.
- **Santé** : un titre ou un lieu qui parle de soins (clinique, vaccin, Dr…) marque l'événement « Santé » (trait rouge).
- **Événements récurrents** créés dans Google : chaque occurrence est visible ; on peut y régler qui et l'accompagnateur
  (gardés dans Hestia), le titre et l'horaire se changent dans Google.
- Rappels : résumé du matin, et une notification avant chaque événement (60 minutes par défaut ; Réglages).

## Repas

- Deux repas par jour : **dîner** (le midi) et **souper** (le soir). Le souper est en général commun ; le dîner peut
  être par personne (« Pour qui »). Dans la base, ce sont les créneaux `lunch` et `dinner`.
- **Plusieurs plats par repas** : une entrée, un plat principal, un dessert, ou un plat par personne. La feuille du repas
  liste ce qui est prévu ; *Ajouter un plat* ou *Autre plat* en ajoute un.
- **Chercher en écrivant** : dès la première lettre, les plats de **Nos plats** qui correspondent s'affichent ; un toucher
  choisit le plat. On peut aussi continuer d'écrire et garder le texte tel quel (plat du jour, nom du resto), et cocher
  *L'ajouter à nos plats* pour le retrouver ensuite.
- **Restes** : ce type propose ce qui a été cuisiné à la maison dans les 7 jours avant le repas, ou une saisie libre.
- **Déplacer un plat** : on le glisse vers un autre repas, dans l'écran *Repas* comme sur le kiosque. À la souris, le
  glissement part tout de suite ; au doigt, il faut garder le plat appuyé un instant (un simple balayage fait défiler la
  page). Le code est dans `src/lib/mealDrag.tsx`.
- **Nos plats** : nom, ingrédients, recette, tags, favori, **service** (entrée, plat principal, accompagnement, dessert,
  déjeuner, boisson ; plusieurs possibles), **source** (une personne, un livre) et lien. La liste se filtre par service
  et se cherche par nom, tag, source ou ingrédient.
- Type : maison, restes, resto, à emporter. **Qui cuisine** : un adulte ou les deux ; on peut le décider avant de choisir le plat.
- Les repas ne vont jamais dans Google Agenda.
- Les enfants qui ne mangent pas encore à table n'apparaissent pas (seuls les adultes sont proposés dans « Pour qui »).

## Courses

- Une liste par magasin ; chaque liste a ses **rayons**, ordonnés comme on parcourt le magasin (Organiser la liste).
- Un article reste dans sa liste pour toujours : il est « à acheter » ou non. Ajouter un article connu le remet à acheter,
  dans son rayon ; un nouvel article va dans « Autre » (à ranger d'un toucher sur `…`).
- En magasin : la liste montre ce qui est à acheter, par rayon ; cocher = acheté (journal : qui, quand). Ce qui vient
  d'être coché reste visible, barré, pour se corriger.
- « Pas besoin » retire de la liste sans noter d'achat.
- Journal › Courses : les articles les plus achetés ; par Claude : la fréquence d'achat d'un article.

## Tâches ménagères

- **Tâches régulières** : titre, icône (à choisir parmi des pictogrammes au trait, jamais d'emoji), qui (une personne, plusieurs, « qui veut »), à tour de rôle ou non, rythme,
  moment de la journée, active ou en pause. L'éditeur montre la phrase (« le samedi (sinon le lendemain) ») et les
  prochaines dates. Rythmes : tous les (N) jours ; jours de la semaine (toutes les N semaines) ; jours du mois ; nième
  jour de semaine du mois ; dans le courant d'un mois de l'année ; une date par an. « Reporter de N jours » garde la
  tâche ouverte si elle n'est pas faite.
- **À faire** : aujourd'hui (ce qui est dû, ce qui est encore ouvert des jours d'avant, ce qui a été fait aujourd'hui),
  puis les 7 jours suivants. Une tâche non faite après son dernier jour disparaît (elle n'est pas marquée faite).
- **Tâches ponctuelles** : pour soi ou données à quelqu'un (notification) ; elles restent jusqu'à ce qu'elles soient faites.
- Cocher note qui l'a fait. Rappel du soir (20 h par défaut) à qui il reste des tâches.

## Anniversaires

- Tableau de l'année, mois par mois ; les 30 prochains jours en tête, avec l'âge quand l'année est connue et les idées de
  cadeaux. Les dates « en mémoire » sont à part et ne sont pas annoncées comme des fêtes.
- Sur le kiosque : le jour même en haut de la colonne ; « Bientôt » pour les 3 semaines à venir.

## Kiosque

- La semaine à venir en 7 colonnes à partir d'aujourd'hui (flèches pour avancer ou reculer ; retour à aujourd'hui après
  3 minutes). Par jour : météo, anniversaires, événements (avatars des personnes, « avec » l'accompagnateur, `⏳`), tâches
  particulières du jour, dîner et souper (avec qui cuisine).
- À droite : météo du moment, tâches du jour à cocher, à acheter (toucher : acheté ou pas besoin), anniversaires à venir,
  décomptes, accès aux autres écrans, **Interphone**.
- L'écran reste allumé ; l'app se met à jour toute seule ; hors ligne, elle montre la dernière copie.

## Interphone

- Bouton micro (flottant dans l'app, grand sur le kiosque). On parle, le texte s'affiche, Claude agit et répond en une
  ou deux phrases, lues à voix haute. On peut enchaîner (« et aussi du lait »).
- Sans reconnaissance vocale sur l'appareil : on écrit, ou on dicte avec le micro du clavier.
- Il peut tout ce que peuvent les outils ([MCP.md](MCP.md)) : courses, repas, tâches, événements, anniversaires, questions.
- Il faut du réseau.

## Notifications

| Quand | Qui la reçoit |
|---|---|
| Demande d'approbation | Les adultes dont l'accord est demandé |
| Réponse à une demande | La personne qui a demandé |
| Commentaire sur un événement | Les autres adultes concernés |
| Tâche ponctuelle donnée | La personne à qui elle est donnée |
| Résumé du matin (événements, tâches, anniversaires, accords en attente) | Chaque adulte, s'il y a quelque chose |
| Rappel du soir | Qui a encore des tâches |
| Avant un événement | Les adultes concernés ou accompagnateurs |

### Boîte de réception

La cloche de l'écran d'accueil et **Plus › Boîte de réception** ouvrent le même écran (`src/pages/Inbox.tsx`) :

- **À toi de répondre** : les demandes d'approbation qui attendent ta réponse ;
- **Tes demandes en attente** : celles que tu as faites et qui n'ont pas encore de réponse ;
- **Décisions** : les 30 dernières demandes approuvées ou refusées qui te concernent, avec qui a décidé, quand, et son mot ;
- **Notifications** : les 60 dernières reçues ; un point marque les nouvelles, un toucher ou *Tout marquer lu* les marque lues.

Les demandes et les décisions sont lues dans les événements eux-mêmes : elles restent visibles même quand la notification
a disparu (les notifications sont effacées après 90 jours). La pastille de l'onglet *Aujourd'hui* compte les demandes à
décider et les notifications non lues.

## Journal

Plus › Journal : qui a fait quoi, quand, et d'où (app, kiosque, interphone, Claude, Google Agenda), filtrable par domaine.

## Hors ligne

Tout se lit et se modifie hors ligne, sauf : l'interphone, le journal, la synchro Google, la création d'une adresse de
connecteur. La pastille en haut dit « À jour », « Hors ligne » ou « N en attente ».
