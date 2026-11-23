# Fonctionnalités et règles

Ce que fait chaque partie, et les règles qui ne se voient pas à l'écran. À tenir à jour avec le code.

## Personnes

- **Adultes** : un compte chacun. Tout ce qu'ils font porte leur nom.
- **Enfants** : pas de compte. Un enfant marqué « toujours accompagné » (`needs_caregiver`) ne peut être concerné par un
  événement sans qu'un adulte l'accompagne. Le jour où il grandit, on décoche (Réglages › La famille).
- **Kiosque** : un compte « appareil ». En haut de l'écran, on touche son avatar pour dire « c'est moi » (oublié après
  2 minutes) ; sinon l'action est notée au nom du kiosque.

## Calendrier

- La bande de semaine en haut de l'agenda se **balaie** : vers la gauche, la semaine suivante ; vers la droite, la
  précédente. Elle suit le doigt et se pose toujours sur une semaine entière (les flèches font le même mouvement).

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
  page ; sur le kiosque, le plat part dès qu'on bouge). Le code est dans `src/lib/mealDrag.tsx`.
- **Nos plats** : nom, ingrédients, recette, tags, favori, **service** (entrée, plat principal, accompagnement, dessert,
  déjeuner, boisson ; plusieurs possibles), **source** (une personne, un livre) et lien. La liste se filtre par service
  et se cherche par nom, tag, source ou ingrédient.
- Type, avec son icône devant le plat : maison (une casserole qui fume), restes (une boîte à lunch), resto, à emporter. **Qui cuisine** : un adulte ou les deux ; on peut le décider avant de choisir le plat.
- Les repas ne vont jamais dans Google Agenda.
- Les enfants qui ne mangent pas encore à table n'apparaissent pas (seuls les adultes sont proposés dans « Pour qui »).

## Courses

- Une liste par magasin ; chaque liste a ses **rayons**, ordonnés comme on parcourt le magasin (Organiser la liste).
- Icône de la liste au choix, dont trois marques de magasin au trait, de la couleur de l'app : l'étincelle (Walmart),
  le C (Costco), le « a » sur sa flèche-sourire (Amazon). Dessins : `src/components/icons.tsx`.
- Un article reste dans sa liste pour toujours : il est « à acheter » ou non. Ajouter un article connu le remet à acheter,
  dans son rayon ; un nouvel article va dans « Autre » (à ranger d'un toucher sur `…`).
- En magasin : la liste montre ce qui est à acheter, par rayon ; cocher = acheté (journal : qui, quand). Ce qui vient
  d'être coché reste visible, barré, pour se corriger.
- « Pas besoin » retire de la liste sans noter d'achat.
- **Lien** (facultatif, Organiser la liste) : l'adresse de la liste chez le magasin (une liste Amazon…). Un bouton en
  haut de la liste l'ouvre. Claude peut le poser aussi (`courses_liste_enregistrer`, « lien »).
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

## Je rentre

Plus › **Je rentre**, ou un appui long sur l'icône de Hestia sur Android (raccourci du manifeste, `vite.config.ts`).
Écrans : `src/pages/Leaving.tsx` (celui qui rentre), `src/pages/Trip.tsx` (les autres).

- **Une heure ronde** : l'heure d'arrivée est toujours sur 5 minutes (17 h 30, jamais 17 h 33). Proposée à partir du
  *trajet habituel* (25 min par défaut, réglable sur l'écran et retenu sur l'appareil), arrondie aux 5 minutes du dessus,
  avec « dans 29 min » à côté ; `−5`, `+5`, `+15` la déplacent de 5 en 5. « Je pars » (du bureau…), les personnes à
  prévenir et le choix de partager sa position sont retenus sur l'appareil.
- **Un mot** pour les autres, au départ ou en route (« Je passe chercher les pizzas ») : il part avec la nouvelle.
- **Une seule notification par série d'ajustements** : la nouvelle part 45 secondes après le dernier changement, et
  compare avec ce que les autres savaient déjà : « Arthur rentre · arrivée vers 17 h 30 », « Arthur arrivera un peu plus
  tard · Nouvelle heure : 17 h 45 (au lieu de 17 h 30) », « Arthur a laissé un mot ». Revenir à l'heure déjà annoncée
  n'envoie rien. Toucher la notification ouvre le trajet.
- **Où il est, en direct** : pendant le trajet, ceux qu'on prévient (et le kiosque, en touchant la pastille du haut)
  voient une carte : sa position, le chemin à vélo jusqu'à la maison, la distance qui reste et le temps à vélo, depuis
  quand la position date (grisée au-delà de 3 minutes). Le chemin vient du serveur d'itinéraires OpenStreetMap (FOSSGIS,
  profil vélo) ; les fonds de carte de CARTO (OpenStreetMap). Sans réseau vers eux : une ligne droite en pointillés.
- **D'où vient la position** :
  - de Hestia, tant qu'elle est ouverte (n'importe quel écran ; l'écran reste allumé) : un point toutes les 20 secondes
    au plus, ou après 60 m (`src/components/TripSharer.tsx`) ;
  - d'**OwnTracks**, une app gratuite qui envoie la position même téléphone verrouillé : chacun crée son adresse secrète
    dans **Réglages › Position en arrière-plan** et la colle une fois dans OwnTracks ([SETUP.md](SETUP.md)). Hors d'un
    trajet, ce qu'envoie OwnTracks est ignoré.
- **Vie privée** : seul le dernier point est gardé, et seulement pendant le trajet. Il est effacé à l'arrivée, à
  l'annulation, et une heure après l'heure annoncée.
- **La maison sur la carte** : **Réglages › La maison › Je suis à la maison : la placer ici** (une fois). Elle sert au
  chemin et à l'arrivée : à moins de 150 m de la maison (passé les 2 premières minutes), le trajet se termine tout seul.
- En route : changer l'heure, ajouter un mot, couper le partage, « Je suis à la maison », ou annuler.
- Chez les autres, l'écran d'accueil montre « Arthur arrive vers 17 h 30 », les minutes qui restent et le mot ; le
  kiosque aussi, en haut. Un compte à rebours dans la notification elle-même n'est pas possible pour une app web.

## Absences : séjours et vacances

Agenda › bouton valise. Fiche : `StaySheet` (`src/components/Away.tsx`).

- **À confirmer** : une absence peut être seulement envisagée ; elle s'affiche en pointillés, « À confirmer », et se
  confirme d'un bouton dans sa fiche. Tant qu'elle n'est pas confirmée, elle ne change ni les tâches ni les repas.
- **Pour quoi** : une note libre (un anniversaire, une fête) qui s'affiche dans l'agenda à côté du lieu.
- Les autres adultes reçoivent une **notification** quand on propose ou ajoute une absence, la confirme, change ses dates
  ou l'annule (`private.stay_notify`).
- **Séjour** (dans la famille, chez des amis ; les lieux déjà utilisés se choisissent d'un toucher) ou **Vacances**
  (destination libre), du… au…, qui part (toute la famille par défaut), comment (voiture, bus, train, avion) et, en
  voiture, s'il faut réserver une **Communauto** et si c'est fait.
- Mis en évidence : une ligne en tête de chaque jour de l'agenda, un trait sous les jours de la bande de semaine, un
  bandeau sur l'écran d'accueil à partir de 7 jours avant (en ambre si la Communauto reste à réserver), les colonnes
  teintées sur le kiosque.
- **Google Agenda** : chaque absence y apparaît aussi, en journée entière dans « Family » (« À Chelsea · la note », avec
  « (à confirmer) » tant qu'elle ne l'est pas, et le moyen de transport en description). La déplacer dans Google déplace
  l'absence ; la supprimer dans Google l'annule. Le titre, lui, vient toujours de Hestia. Dans Hestia, seule l'absence
  s'affiche (l'événement qui la porte, `events.stay_id`, est caché).
- Une fois confirmée, les **tâches** de ceux qui partent sont passées pendant ces jours (par le serveur : `private.chore_away`), et
  reviennent si le séjour change ou est annulé.
- Quand toute la famille part, il n'y a **pas de repas à prévoir** : la semaine des repas et le kiosque l'indiquent à la
  place du dîner et du souper.

## Cadeaux

Plus › **Cadeaux** (adultes seulement ; le kiosque ne les voit pas). Écran : `src/pages/Gifts.tsx`, règles : `src/lib/gifts.ts`.

- **Mes envies**, en tête de l'écran : ce qui me ferait plaisir (Noël, anniversaire ou n'importe quand), avec précision et
  lien. Les autres les voient ; ce qu'ils en font me reste caché.
- **Personnes** : celles à qui la famille offre des cadeaux, avec, pour chacune, *son anniversaire*, *Noël* ou les deux.
  La date d'anniversaire vient de la liste des anniversaires ; « Utilise Hestia » relie la personne à un membre.
- **Dans les 2 prochains mois** : chaque anniversaire et Noël qui approchent, avec, par personne, les cadeaux prévus (à
  cocher une fois achetés), ses idées en attente (un toucher les prévoit pour l'occasion) et une ligne pour en ajouter.
  « Rien de prévu » en ambre quand il reste à trouver. À Noël, deux groupes par personne : le **gros cadeau** (sous le
  sapin) et le **bas de Noël** (petites attentions).
- Une fiche par personne : ses idées, ce qui a été prévu et offert les années passées ; une fiche par cadeau : précision,
  lien, occasion.
- **Confidentialité** : ce qu'on prévoit pour une personne qui utilise Hestia lui est **caché** (le serveur le filtre :
  `private.gift_visible`). Ce qu'elle écrit pour elle-même est une **envie**, que les autres voient ; quand l'un d'eux la
  prévoit ou l'achète, Hestia en fait une copie cachée, et l'envie reste intacte chez elle. Les cadeaux ne passent pas
  par le journal, que toute la famille lit.

## Kiosque

- En haut : l'heure, la date, la météo du moment, « Qui est là ? », la semaine (flèches).
- La semaine à venir en 7 colonnes sur toute la largeur, à partir d'aujourd'hui (retour à aujourd'hui après 3 minutes).
  Par jour : météo, anniversaires, événements, tâches particulières du jour (chacune avec son icône : la poubelle, le
  compost…), puis **dîner** et **souper** en deux grandes
  cases. Les événements sont placés **selon l'heure** : le matin en haut, le soir en bas (l'espace libre est partagé en
  proportion des heures qui les séparent, de 7 h à 22 h ; ils ne se chevauchent jamais).
- **Balayer** la semaine vers la gauche ou la droite fait défiler les jours : elle suit le doigt et se pose toujours sur
  un jour entier ; un geste vif va plus loin (une semaine au plus). Les flèches avancent ou reculent d'une semaine.
  Après 3 minutes sans toucher, elle revient d'elle-même, en glissant, jusqu'à aujourd'hui. Les gestes s'enchaînent
  sans attendre : un doigt posé pendant que la semaine glisse la reprend là où elle est (et un simple toucher l'arrête
  sur le jour le plus proche). Mécanisme commun à l'agenda : `src/lib/swipe.ts`.
- Glisser un plat d'une case repas à une autre le déplace : il suit le doigt dès qu'on bouge (un simple toucher ouvre le
  repas).
- Les repas forment une bande continue en bas de chaque colonne, d'une autre teinte que l'agenda.
- Plein écran automatique à l'ouverture (ou au premier toucher) : voir [KIOSK.md](KIOSK.md).
- En bas : tâches du jour à cocher, à acheter (toucher : acheté ou pas besoin), anniversaires à venir et décomptes, puis
  quatre accès (Agenda, Repas, Courses, Tâches) et le bouton **Interphone**. Hors de la tablette, « Quitter » est en haut.
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
| Quelqu'un rentre, une absence proposée ou changée | Les autres adultes |

### Boutons des notifications

Sur Android et ordinateur, certaines notifications ont des boutons qui agissent sans ouvrir l'app (l'iPhone n'affiche pas
de boutons pour une app web : la notification ouvre l'écran concerné). Deux au plus : c'est ce qu'Android affiche.

| Notification | Boutons |
|---|---|
| Demande d'approbation | *Approuver*, *Refuser* |
| Tâches du soir | *Tout est fait* (coche les tâches nommées), *Demain* (encore à faire demain) |
| Nouvelle tâche | *Fait*, *Demain* |
| Quelqu'un rentre | *Voir le trajet* (ouvre la carte), *OK, vu* |
| Rappel d'événement | *Itinéraire* (Google Maps vers le lieu, s'il y en a un), *Dans 10 min* (la même notification revient) |

*Demain* : une tâche ponctuelle passe au lendemain ; une tâche récurrente reste à faire un jour de plus. Une réponse
courte confirme (« Fait : Vaisselle, Litière »). Code : `supabase/functions/_shared/notify-actions.ts`, `src/sw.ts`.

### Ce que chacun reçoit

**Réglages › Mes notifications**, pour chaque adulte et pour tous ses appareils (`src/components/NotifyPrefs.tsx`) :

- un interrupteur par sujet : demandes d'approbation, réponses à mes demandes, rappel avant un événement, commentaires,
  résumé du matin, nouvelle tâche pour moi, tâches du soir, quelqu'un rentre, séjours et vacances ;
- le délai du rappel avant un événement (15 min, 30 min, 1 h, 2 h ; par défaut celui de la maison, *La maison*) ;
- des **heures calmes** (ex. 22 h à 7 h, même à cheval sur minuit) : ce qui arrive pendant ces heures est envoyé à la
  fin (au plus 15 minutes après), sauf si on l'a déjà lu dans l'app entre-temps.

Un sujet coupé n'empêche que l'envoi au téléphone : tout reste dans la boîte de réception. La notification de test
(Réglages) passe toujours. Choix rangés dans `members.notify_prefs` et appliqués par la fonction `notify` juste avant
l'envoi (`supabase/functions/_shared/notify-prefs.ts`).

Chaque notification a son image, qui dit de quoi il s'agit avant de la lire : sablier (accord demandé), coche ou croix
(accordé, refusé), agenda (événement qui approche), liste (tâches), soleil (résumé du matin), bulle (commentaire), maison
(quelqu'un rentre), valise (absence). Sur Android, l'image est à droite et sa silhouette dans la barre d'état ; l'iPhone
montre toujours l'icône de l'app. Les dates s'écrivent « ven. 20 nov. à 19 h ». Images : `public/icons/notify/`, faites
par `npm run icons` ; choix selon le type : `src/sw.ts`.

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

## Affiche pour la télé (écran de veille de la Chromecast)

Les jours qui viennent en une image 4K (3840 × 2160), dans l'album Google Photos que l'écran de veille de la Chromecast
projette. Écran : `src/pages/Poster.tsx` (`#/poster`) ; réglages : **Réglages › Télé**.

- **Ce qu'elle montre** (variante « Aujourd'hui en grand », thème sombre, choisie par la famille) : la carte du jour ne
  porte que l'essentiel, les rendez-vous **encore à venir** (ceux qui sont passés s'en vont) et le menu (dîner et souper,
  seulement le souper à partir de 16 h). Quand il ne reste plus rien à venir aujourd'hui, la carte du jour se réduit à
  une ligne (« Ce soir · Souper ») et une seconde carte montre **demain** (rendez-vous et menu) ; la colonne de droite
  commence alors au surlendemain. Dessous, deux lignes discrètes, sans étiquettes : les tâches du jour à ne pas oublier
  (pas celles de tous les jours, comme la vaisselle), puis les anniversaires des trois semaines à venir (prénom et initiale). À droite, les trois jours suivants (deux événements au
  plus, puis dîner et souper).
- **Quelqu'un rentre** (« Je rentre ») : une carte en verre plus claire, tout en haut, « Arthur arrive vers 17 h 30 »,
  avec le départ et son mot. L'image est refaite dès que la nouvelle part (45 s après le dernier ajustement), sans
  attendre la demi-heure ; la carte s'en va une demi-heure après l'heure annoncée (au passage suivant). Le logo en haut à gauche ; en haut à droite la date et les décomptes affichés sur le kiosque (« Noël dans
  33 jours »). Le bas de l'image reste vide : la télé l'assombrit (un dégradé) et y affiche son heure et sa météo. Les
  noms longs passent à la ligne ou sont coupés, jamais la mise en page. Chaque rendez-vous porte les pastilles des
  personnes concernées, et « avec » celle de l'adulte qui accompagne (« Pédiatre · L avec S »).
- **Effet verre** (demandé pour la télé seulement) : la carte du jour est une plaque de verre dépoli sur un fond sombre
  où passent de grandes taches douces de bleu-vert et de braise ; reflet sur l'arête du haut, étiquettes en verre aussi.
  Ailleurs, l'app garde ses cartes unies. Les autres variantes restent pour essayer : `?v=semaine`, `?v=epure`, `&theme=light`.
- **Quand elle change** : à la nouvelle d'un trajet (voir ci-dessus), et toutes les 30 minutes : une tâche GitHub (`.github/workflows/poster.yml`, `scripts/poster.mjs`)
  dessine l'affiche avec les données du moment (une image PNG, sans perte : pas de halo autour des lettres) et ne
  l'envoie que si son texte a changé (et donc au moins chaque matin,
  avec la date). Les journaux de cette tâche ne montrent jamais les données de la famille.
- **Les albums** : une app ne peut remplir qu'un album qu'elle a créé, et ne peut supprimer aucune photo. Hestia crée
  donc deux albums dans le compte relié : « Hestia · Télé » (l'image du moment, deux fois) et « Hestia · À supprimer »
  (les anciennes, à vider à la main de temps en temps : ouvrir l'album, tout sélectionner, supprimer).
- Fonction : `supabase/functions/poster` (`_shared/photos.ts` pour Google Photos). Mise en place : [SETUP.md](SETUP.md).

## Comme une app

Sur téléphone et tablette, Hestia se comporte comme une app et non comme une page web : un doigt ne sélectionne pas le
texte, un appui long n'ouvre pas le menu du navigateur, ni un double toucher ni un pincement ne zooment, les images ne se
détachent pas. Le texte reste sélectionnable dans les champs, et là où on peut vouloir le copier (lieu et description d'un événement :
classe `selectable`). Réglage : `index.html` (viewport), `src/styles.css` (début) et `src/main.tsx`.

## Hors ligne

Tout se lit et se modifie hors ligne, sauf : l'interphone, le journal, la synchro Google, la création d'une adresse de
connecteur. La pastille en haut dit « À jour », « Hors ligne » ou « N en attente ».
