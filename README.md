# Brand Hunters · Scorekeeper

Site web pour compter les points pendant une partie de **Brand Hunters**, **sur téléphone comme sur ordinateur**.
HTML, CSS et JavaScript natifs : aucun framework, aucune bibliothèque, aucune étape de build.
Toutes les données restent dans le navigateur (`localStorage`) : il n'y a aucun serveur.

L'interface est **en anglais**, comme le jeu et les maquettes. Cette documentation reste en français.

| Fichier | Rôle |
| --- | --- |
| `index.html` | Structure des 5 pages (New game, The hunt, résultats, History, Rules) et des fenêtres de dialogue |
| `style.css` | Mise en page téléphone, tablette et ordinateur, d'après les maquettes |
| `script.js` | Logique : chasseurs, primes, tours, chronomètre, sons, sauvegarde, historique |
| `logo-brand-hunters.svg` | Logo officiel |
| `fonts/` | Polices Bitter et Rye hébergées avec le site, avec leurs licences |

> Les fichiers `fonts/poppins-latin-*.woff2` et `fonts/LICENCE-Poppins.txt` viennent de la version précédente. Ils ne servent plus et peuvent être supprimés.

## Les pages

Chaque page a sa propre adresse, ce qui fait aussi fonctionner le bouton « retour » du navigateur. On peut donc partager un lien direct, par exemple vers les règles.

| Adresse | Page |
| --- | --- |
| `#/new` | **New game** : configuration de la partie |
| `#/hunt` | **The hunt** : la partie en cours (visible seulement s'il y en a une) |
| `#/results` | Affiche **WANTED** du gagnant et classement final |
| `#/history` | **History** : parties terminées |
| `#/rules` | **Rules** : vidéo des règles, puis les règles du jeu en version courte |

À l'ouverture du site, une partie en cours est reprise automatiquement. Sinon, la page New game s'affiche.

## Fonctionnalités

- **New game**
  - **Joueurs :** de 2 à 10 chasseurs, chacun avec une étoile de couleur. Les noms sont obligatoires et doivent être différents. Une icône corbeille retire un chasseur.
  - **Ordre de passage :** c'est l'ordre de la liste. « Shuffle » fait un tirage au sort, à refaire autant de fois qu'on veut. Pour un ordre manuel, on glisse les poignées ⠿ (ou flèches ↑ ↓ au clavier).
  - **Round timer :** les flèches proposent Off, 30, 45, 50, 60 ou 75 s. On peut aussi taper n'importe quelle durée de 5 s à 60 min (`90`, `1:30`…).
  - **Bounty :** les primes Pickpocket (★), Bandit (★★), Outlaw (★★★) et Most Wanted (★★★★★), comme dans le livret de règles (100, 200, 300 et 500), plus Bonus et Wrong answer. « Edit » permet de changer les valeurs ; elles sont gardées pour les parties suivantes, avec un bouton « Reset to defaults ».
  - **House rules :** règle de victoire (score le plus haut ou le plus bas) et règle des mauvaises réponses (voir plus bas).
- **The hunt**
  - **Current hunter :** le chasseur dont c'est le tour, avec ‹ › pour passer au précédent ou au suivant.
  - **Chronomètre circulaire :** il affiche le temps restant du tour. Sous le temps, on voit la durée totale de la partie (« Hunt 12:34 »). Si le minuteur est désactivé, le cercle affiche cette durée totale.
    - **Le minuteur attend qu'on appuie sur ▶.** Au début de la partie et à chaque changement de chasseur, il est remis à sa durée complète et reste arrêté (« Press start »), et le bouton ▶ pulse. Le chronomètre total de la partie, lui, continue.
    - ⏸ met en pause le minuteur et le chronomètre total ; ▶ reprend. ↺ remet le minuteur à sa durée complète, arrêté. Le dernier bouton coupe le son.
    - **Changer la durée sans passer par Settings :** on touche le temps affiché (un crayon l'indique quand le minuteur ne tourne pas). Une fenêtre propose 30, 45, 50, 60, 75 s ou Off, ou un autre temps à taper (`90`, `1:30`…). La nouvelle durée remet le minuteur à zéro, arrêté. Choisir la durée déjà en place ne change rien. La durée est gardée pour les parties suivantes.
  - **Add points :** les 4 tuiles de primes, ainsi que **Bonus**, **Wrong**, **Custom** (n'importe quel nombre, positif ou négatif) et **Undo**.
    - Au-dessus des tuiles, une rangée montre chaque joueur avec son rôle du tour : **Hunter** (celui qui joue), **Witness** (le joueur à sa gauche, c'est-à-dire le suivant dans l'ordre de passage) et **Vulture** (tous les autres). On y choisit qui reçoit les points.
    - **Ambush (Vulture) :** les tuiles passent à la moitié de la prime de la carte (Bandit +200 → +100, Most Wanted +500 → +250). Toucher la tuile du niveau donne ces points au Vulture. Si sa réponse est fausse, **Wrong** devient « No penalty » : rien n'est retiré. Dans les deux cas, l'appli revient ensuite sur le Hunter.
    - **Witness :** les tuiles affichent sa part, la moitié de la prime restante, c'est-à-dire la prime de la carte moins les missed shots du Hunter pendant ce tour. Par exemple, un Outlaw avec 2 missed shots donne (300 − 100) / 2 = 150. Wrong est désactivé : les missed shots sont ceux du Hunter. L'appli revient ensuite sur le Hunter.
  - **Hunters :** trois onglets, « Turn order » (scores dans l'ordre de passage), « Ranking » (classement en direct) et « Rounds » (points tour par tour). Toucher un chasseur le choisit pour recevoir les points, comme la rangée au-dessus des tuiles.
  - **Next hunter :** sur téléphone, ce bouton reste toujours accessible en bas de l'écran.
  - **Settings :** changer le minuteur, les règles, le son et les primes, ou abandonner la partie.
  - **End game :** affiche le classement final et enregistre la partie dans l'historique.
- **Sons du minuteur (style western) :** un « clic » de revolver qu'on arme à 3, 2 et 1 seconde de la fin (le dernier un peu plus aigu), puis, à 0, un coup de feu avec un ricochet et un écho de canyon. Les sons sont fabriqués par le navigateur (Web Audio API) : il n'y a aucun fichier audio. Le bouton haut-parleur sous le minuteur les coupe ; en le réactivant, on entend un clic de test.
- **Fin du minuteur :** en plus du son, l'écran clignote et le téléphone vibre (si possible). L'écran reste allumé pendant la partie (Wake Lock API).
- **Sauvegarde :** automatique à chaque action ; on retrouve la partie après une fermeture ou un rechargement.
- **History :** parties terminées. Chacune peut être supprimée ou rejouée (« Play again » pré-remplit New game avec les mêmes chasseurs et réglages).

### Mauvaises réponses : seulement si le chasseur trouve, et jamais plus que ce qu'il gagne

Dans Brand Hunters, chaque mauvaise réponse coûte −50, mais seulement si le chasseur finit par trouver la marque. Et il ne peut jamais perdre plus de points qu'il n'en gagne pendant ce tour. Cette règle est activée par défaut et peut être désactivée dans New game (House rules) ou dans Settings.

- **Pendant le tour :** les points négatifs restent **en attente** (« −100 pending »), sans toucher au total.
- **Il trouve :** dès qu'il marque des points positifs dans le même tour (une prime, le bonus ou des points Custom), les pénalités sont appliquées.
- **Plafond :** les pénalités d'un tour ne dépassent jamais les points gagnés pendant ce tour. Par exemple, +200 avec 8 mauvaises réponses (−400) donne −200 de pénalités : le tour vaut 0, jamais moins. Les pénalités en trop apparaissent barrées dans « Rounds ». Une pénalité comptée seulement en partie est soulignée en pointillés, avec le montant retenu. Un bonus gagné pendant le tour relève ce plafond.
- **Il ne trouve pas :** au « Next hunter », elles sont **annulées**. Un message le signale, et elles apparaissent barrées dans « Rounds ».
- **Points Custom négatifs :** ils comptent toujours tels quels. C'est l'outil de l'arbitre, par exemple pour une correction.
- **Retour en arrière :** ‹ (chasseur précédent) remet les pénalités en attente ; « Undo » fonctionne normalement.
- **Fin de partie :** « End game » annule les pénalités encore en attente, et la confirmation l'indique.

### Vidéos des règles

La page Rules affiche une vidéo différente selon l'écran. Les liens se trouvent en haut de `script.js` :

```js
const RULES_VIDEOS = Object.freeze({
  desktop: 'https://youtu.be/qfEYmCxW9WQ', // 16:9, pour ordinateur et tablette à l'horizontale
  mobile: '',                              // verticale (9:16), pour téléphone
});
```

- **Écrans de moins de 900 px de large** (téléphones, tablettes à la verticale) : ils reçoivent la vidéo `mobile`, dans un cadre vertical qui ne dépasse jamais la hauteur de l'écran. Tant que `mobile` est vide, ils reçoivent la vidéo `desktop`.
- **Écrans plus larges** : ils reçoivent la vidéo `desktop`, en 16:9.
- Si on redimensionne la fenêtre ou qu'on tourne une tablette, la page change de vidéo.
- On peut mettre un lien YouTube (`youtu.be/…`, `youtube.com/watch?v=…` ou `youtube.com/shorts/…`) ou le nom d'un fichier vidéo placé à côté d'`index.html` (par exemple `rules-mobile.mp4`).
- Si les deux sont vides, la page affiche « Rules video coming soon ».

Les vidéos YouTube sont intégrées en mode « confidentialité renforcée » (`youtube-nocookie.com`). Elles doivent être publiques ou non répertoriées (une vidéo privée ne s'affiche pas), avec l'intégration autorisée (réglage par défaut de YouTube).

### Règles du jeu

Sous la vidéo, la page Rules reprend toutes les règles du dépliant (*Brand Hunters Leaflet v8*), en plus court. On y trouve les 11 sections : Goal, Roles, Setup, Jokers, Card levels, Playing a turn, The Witness’s rules, Missed shots & Ambush!, Scoring (avec les six gangs), Final round et Winning. Les crédits du dépliant sont repris en bas de la page.
- Les niveaux de cartes sont présentés avec les mêmes tuiles colorées que les boutons de primes.
- Trois petites notes « In the app » expliquent comment faire avec l'appli : régler le temps, noter un Ambush (Vulture) et la part du Witness.

Le texte est écrit directement dans `index.html` (section `RULES`). Pour modifier une règle, il suffit de changer le texte à cet endroit.

## Direction artistique

L'interface suit les maquettes Brand Hunters :
- décor de coucher de soleil sur le désert (soleil, mesas, cactus) ;
- titres en italique très gras, soulignés d'une étoile de shérif ;
- cartes sombres à bord rose et tuiles de primes colorées ;
- grand bouton orangé pour l'action principale ;
- en fin de partie, le gagnant apparaît sur une **affiche WANTED**, avec son score comme « prime ».

**Couleurs.** Elles sont réunies dans des variables en haut de `style.css`. Le rouge (`#D14B35`), l'orange (`#F18930`) et le sable (`#F8C787`) sont les codes exacts du logo. Les autres couleurs ont été relevées sur les maquettes :

| Variable | Usage |
| --- | --- |
| `--plum` `#2B1528` | Fond, texte sur les boutons orange |
| `--easy-1` / `--easy-2` | Tuile Pickpocket (vert) |
| `--medium-1` / `--medium-2` | Tuile Bandit (orange) |
| `--difficult-1` / `--difficult-2` | Tuile Outlaw (rouge) |
| `--wanted-1` / `--wanted-2` | Tuile Most Wanted (violet) |

**Typographies.** Elles sont hébergées dans `fonts/` (licence SIL OFL, fichiers de licence inclus). Aucun appel n'est fait à Google Fonts : rien n'est transmis à un service tiers (RGPD), et les polices fonctionnent hors ligne.
- **Bitter** : toute l'interface, en italique très gras (900) pour les titres.
- **Rye** : l'affiche WANTED.

**Logo.** `logo-brand-hunters.svg` s'affiche en haut à gauche. Pour le changer, remplacez ce fichier en gardant le même nom.

## Sur ordinateur

À partir de 900 px de large, la navigation affiche ses libellés et New game passe sur deux colonnes. À partir de 1080 px, The hunt passe sur trois colonnes : chasseurs à gauche, chronomètre au centre, primes à droite.

Il n'y a pas de raccourcis clavier : tout se fait avec les boutons. Le clavier sert à saisir du texte et à naviguer comme sur n'importe quel site (Tab, Entrée, Échap pour fermer une fenêtre).

## Organisation des données dans `localStorage`

Les clés gardent les noms des versions précédentes : les parties en cours et l'historique déjà enregistrés sont repris tels quels.

| Clé | Contenu |
| --- | --- |
| `compteurPoints.v1.partieEnCours` | La partie en cours (absente s'il n'y en a pas) |
| `compteurPoints.v1.historique` | Les parties terminées, de la plus récente à la plus ancienne (200 max) |
| `compteurPoints.v1.configuration` | Le formulaire New game : chasseurs (nom et couleur, dans l'ordre de passage), règles, minuteur |
| `compteurPoints.v1.primes` | Les valeurs des primes, enregistrées seulement si on les modifie : `{ "easy": 100, "medium": 200, "difficult": 300, "wanted": 500, "bonus": 50, "penalty": 50, "version": 2 }`. Sans `version`, elles datent d'avant l'alignement sur le livret : un Most Wanted resté à 400 (l'ancienne valeur par défaut) passe alors à 500. |
| `compteurPoints.v1.preferences` | Préférences : `{ "sound": true }` |

`compteurPoints.v1.boutonsRapides`, la clé des anciens boutons rapides, n'est plus utilisée.

### La partie en cours

```json
{
  "version": 2,
  "id": "mwumvyiep3r1gy",
  "startedAt": 1795521072758,
  "winRule": "high",
  "conditionalPenalties": true,
  "players": [
    { "id": "p0", "name": "Ana", "color": "#78B13A" },
    { "id": "p1", "name": "Ben", "color": "#F18930" }
  ],
  "current": 0,
  "target": 0,
  "round": 2,
  "entries": [
    { "p": "p0", "v": 200, "r": 1, "k": 0, "c": "medium",  "t": 1795521080000 },
    { "p": "p1", "v": -50, "r": 1, "k": 1, "c": "penalty", "t": 1795521085000 }
  ],
  "clock":     { "accMs": 120000, "since": 1795521090000 },
  "turnTimer": { "enabled": true, "durationMs": 60000, "custom": false, "accMs": 0, "since": 1795521090000, "expired": false }
}
```

- **`players`** est rangé **dans l'ordre de passage**.
- **`current`, `target`, `round` :** `current` désigne le chasseur dont c'est le tour, `target` celui qui reçoit les points (en général le même), `round` le numéro du tour.
- **Les scores ne sont pas stockés, ils sont recalculés** à partir de `entries`, le journal de toutes les saisies :
  - `p` : le chasseur ;
  - `v` : les points ;
  - `r` : le tour (chaque chasseur a joué une fois) ;
  - `k` : le passage d'un chasseur, numéroté depuis le début de la partie ;
  - `c` : le type de saisie (`easy`, `medium`, `difficult`, `wanted`, `bonus`, `penalty` ou `custom`) ;
  - `t` : l'horodatage.
- **Ce journal suffit à tout :**
  - total = somme des saisies qui comptent. Avec `conditionalPenalties`, les mauvaises réponses (`c: "penalty"`) d'un chasseur ne comptent que s'il a aussi des points positifs avec le même `k`, et au plus à hauteur de ces points. Chaque mauvaise réponse est donc « comptée », « comptée en partie », « plafonnée » (au-delà des points gagnés), « en attente » (tour en cours) ou « annulée » (tour terminé sans trouver). Cet état est recalculé à chaque fois, rien n'est effacé ;
  - Undo = retirer la dernière saisie ;
  - onglet Rounds = saisies regroupées par tour.
- **Les temps sont des horodatages**, pas des compteurs : `accMs` est le temps déjà cumulé et `since` le début de la période en cours (`null` = arrêté). Le chronomètre reste donc juste après un rechargement ou une mise en veille du téléphone. Pour le minuteur de tour, `accMs: 0` avec `since: null` veut dire « prêt, en attente de Start ».

### Une partie de l'historique

C'est un résumé compact, sans le détail des saisies :

```json
{
  "id": "mwumvyiep3r1gy",
  "startedAt": 1795521072758,
  "endedAt": 1795521693766,
  "durationMs": 621008,
  "rounds": 5,
  "winRule": "high",
  "conditionalPenalties": true,
  "turnTimer": { "enabled": true, "seconds": 60 },
  "players": [
    { "name": "Ana", "color": "#78B13A", "score": 850, "rank": 1 },
    { "name": "Ben", "color": "#F18930", "score": 600, "rank": 2 }
  ],
  "winners": ["Ana"]
}
```

En cas d'égalité, plusieurs chasseurs ont le rang 1 et `winners` contient tous leurs noms. À la lecture, les données sont vérifiées : des données abîmées sont ignorées au lieu de bloquer le site.

> Les données sont propres à **un navigateur, sur un appareil, pour une adresse de site**.
> La version locale et la version en ligne ont donc chacune leurs propres données.
> Vider les données du navigateur efface aussi l'historique.

## Tester le site

### Sur ordinateur

Double-cliquez sur `index.html` : le site s'ouvre et fonctionne directement.
Pour voir la version téléphone dans Chrome ou Edge : touche F12, puis l'icône téléphone (ou Ctrl+Maj+M).

### Sur téléphone, en local (même réseau Wi-Fi)

1. Dans le dossier du projet, lancez un petit serveur :

   ```bash
   python3 -m http.server 8000
   ```

2. Trouvez l'adresse IP de l'ordinateur (`ipconfig` sous Windows, `ipconfig getifaddr en0` sur Mac, `hostname -I` sous Linux).
3. Sur le téléphone, ouvrez `http://ADRESSE-IP:8000` (par exemple `http://192.168.1.20:8000`).

Dans ce mode, tout fonctionne **sauf le maintien de l'écran allumé**, car le Wake Lock exige HTTPS. Pour un test complet, mettez le site en ligne (voir plus bas) : les trois hébergeurs servent le site en HTTPS.

### Points à vérifier sur téléphone

- **Le son** du minuteur : sur iPhone, il est coupé si le bouton latéral est en mode silencieux.
- **La vibration** : elle fonctionne sur Android, mais Safari sur iPhone ne la permet pas.
- **L'écran qui reste allumé** pendant la partie : iOS 16.4 ou plus récent, Chrome Android.
- **Fermer puis rouvrir** la page en pleine partie : vous la retrouvez telle quelle.
- **Ajouter à l'écran d'accueil**, pour l'ouvrir comme une application : menu Partager > « Sur l'écran d'accueil » sur iPhone, menu ⋮ > « Ajouter à l'écran d'accueil » sur Android.

## Mettre en ligne

Il n'y a rien à compiler : il suffit de publier les fichiers tels quels. Les chemins sont relatifs, donc le site marche aussi dans un sous-dossier.

### GitHub Pages

1. Poussez les fichiers sur un dépôt GitHub.
2. Allez dans **Settings → Pages**.
3. Dans « Build and deployment », choisissez **Source : Deploy from a branch**, sélectionnez la branche et le dossier `/ (root)`, puis enregistrez.
4. Le site sera disponible après une à deux minutes à l'adresse `https://VOTRE-NOM.github.io/NOM-DU-DEPOT/`.

### Netlify

- **Le plus simple** : ouvrez [app.netlify.com/drop](https://app.netlify.com/drop) et glissez-y le dossier du projet.
- **Avec le dépôt Git** : « Add new site → Import an existing project ». Laissez la commande de build **vide** et indiquez `.` comme dossier de publication.

### Vercel

- **Depuis le site** : [vercel.com/new](https://vercel.com/new), importez le dépôt. Choisissez le preset « Other », sans commande de build, avec `.` comme dossier de sortie.
- **En ligne de commande**, dans le dossier du projet :

  ```bash
  npx vercel
  ```
