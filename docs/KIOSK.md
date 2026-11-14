# La tablette de la cuisine

Le kiosque est la même application, connectée avec le compte « appareil » de la famille : elle ouvre directement la vue
kiosque, en paysage, et y revient toute seule.

## Quelle tablette

Ce qui compte, par ordre d'importance :

1. **Chrome** (ou un navigateur basé sur Chromium avec les services Google). C'est lui qui fournit la reconnaissance
   vocale de l'interphone et l'installation en plein écran.
2. Un écran de 10 pouces ou plus, lisible de loin, en paysage.
3. Pouvoir rester branchée et allumée.

| Appareil | Verdict |
|---|---|
| Tablette **Android** d'occasion (Samsung Galaxy Tab A, Lenovo Tab…) avec Chrome | Recommandé. Tout fonctionne, y compris l'interphone vocal. |
| **iPad** | Fonctionne (Safari, « Sur l'écran d'accueil »). Reconnaissance vocale moins fiable dans une app installée : l'interphone retombe alors sur le clavier et sa dictée. |
| **Amazon Fire** | À éviter : le navigateur Silk n'a ni la reconnaissance vocale de Google ni les notifications push. L'affichage marche, l'interphone vocal non (clavier seulement), sauf à y installer Chrome par des moyens détournés. |

## Installation

1. Dans Supabase, le compte de la tablette existe et est relié au membre de rôle `device` ([SETUP.md](SETUP.md), étapes 3 et 4).
2. Sur la tablette, ouvrir l'adresse de l'app dans Chrome › menu `⋮` › **Installer l'application**.
3. Ouvrir Hestia depuis son icône, se connecter avec le compte de la tablette. La vue kiosque s'affiche.
4. Au premier appui sur **Interphone**, autoriser le micro.

Le kiosque se met **en plein écran** tout seul : tout de suite quand on l'ouvre par un lien (*Plus › Vue kiosque*), ou au
premier toucher quand la page est chargée directement (les navigateurs n'autorisent le plein écran qu'après un geste).
Si on en sort (touche Échap, balayage), le toucher suivant y revient. Sur la tablette de la cuisine, le plein écran reste
quand on passe aux autres écrans ; sur un téléphone ou un ordinateur, quitter le kiosque rend les barres. Sur iPhone, le
plein écran n'existe pas dans le navigateur : installer l'app. Le code est `fullScreen` dans `src/lib/device.ts`.

## Qu'elle reste allumée, et sur Hestia

- Hestia demande à l'écran de rester allumé tant qu'elle est affichée. Régler aussi, dans Android : *Affichage › Mise en
  veille* au maximum, et dans les *Options pour les développeurs* : **Rester activé** (l'écran ne s'éteint pas en charge).
- **Épinglage d'écran** (Android › Sécurité › Épinglage d'application) : la tablette reste sur Hestia.
- Luminosité automatique, ou un mode nuit programmé, pour ne pas éclairer la cuisine la nuit.
- Laisser le Wi-Fi actif en veille. Sans réseau, l'écran montre la dernière copie et la pastille dit « Hors ligne ».

## Utilisation

- **Qui est là ?** : toucher son avatar, en haut, avant d'agir (cocher une tâche, approuver, parler à l'interphone) :
  l'action est notée à son nom. Sans cela, elle est notée au nom du kiosque.
- Toucher un événement : détail, qui accompagne, approbation, commentaires. Toucher les repas d'un jour : les choisir.
- Les quatre boutons en bas à droite ouvrent l'agenda, les repas, les courses et les tâches en plein écran ; l'écran
  revient au kiosque après 3 minutes sans toucher.
- Les mises à jour de l'app sont prises toutes seules (vérification chaque heure).

## Voir le kiosque sans tablette

Sur n'importe quel écran : **Plus › Vue kiosque**, ou l'adresse de l'app suivie de `#/kiosk`. Avec la famille fictive :
`?demo=kiosk#/kiosk`.
