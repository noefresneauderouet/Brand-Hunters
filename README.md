# Compteur de points

Site web pour compter les points pendant une partie de jeu de société, **sur téléphone comme sur ordinateur**.
HTML, CSS et JavaScript natifs : aucun framework, aucune bibliothèque, aucune étape de build.
Toutes les données restent dans le navigateur (`localStorage`).

| Fichier | Rôle |
| --- | --- |
| `index.html` | Structure des 4 écrans (configuration, partie, résultats, historique) et des fenêtres de dialogue |
| `style.css` | Mise en page téléphone, tablette et ordinateur, thème clair/sombre automatique |
| `script.js` | Logique : joueurs, scores, tours, chronomètre, minuteur, sauvegarde, historique |

## Fonctionnalités

- **Configuration** : 2 à 10 joueurs, prénoms obligatoires et uniques. L'ordre de passage est aléatoire (bouton « Mélanger ») ou manuel (glisser-déposer avec la poignée ⠿, ou flèches). Règle de victoire au choix : score le plus haut ou le plus bas. Minuteur par tour en option : 30, 45, 50, 60 ou 75 secondes, ou une durée personnalisée de 5 s à 60 min (saisie en secondes, ou au format `1:30`). La durée peut aussi être changée en cours de partie depuis le menu ⋯.
- **Partie** :
  - joueurs dans l'ordre de passage, avec le joueur actif mis en évidence ;
  - boutons « Joueur suivant » et « Joueur précédent » ;
  - boutons rapides verts (+) et rouges (−), saisie libre de n'importe quel nombre et bouton « Annuler » ;
  - onglets « Classement » (en direct) et « Tour par tour » (feuille de score) ;
  - touchez un autre joueur pour lui donner des points hors de son tour.
- **Boutons rapides personnalisables** (bouton « Boutons » ou menu ⋯) : modifier, ajouter (12 max) ou supprimer des boutons, et revenir aux valeurs par défaut. Les réglages sont gardés pour les parties suivantes.
- **Timer** :
  - chronomètre de partie avec pause et reprise (touchez le chrono) ;
  - minuteur par tour, relancé à chaque « Joueur suivant ». À la fin du temps : signal visuel, son et vibration si le téléphone le permet ;
  - l'écran reste allumé pendant la partie (Wake Lock API).
- **Sauvegarde** :
  - sauvegarde automatique à chaque action ;
  - « Terminer la partie » affiche le classement final et l'enregistre dans l'historique ;
  - l'historique permet de supprimer une partie ;
  - « Rejouer avec les mêmes joueurs » ouvre la configuration pré-remplie : il ne reste qu'à toucher « Commencer ». En ordre aléatoire, un nouveau tirage est fait.

## Sur ordinateur

L'interface s'adapte automatiquement à partir de 900 px de large (ordinateur, tablette à l'horizontale) :

- la configuration s'affiche sur deux colonnes ;
- pendant la partie, les joueurs apparaissent en grille à gauche. À droite, un panneau garde toujours visibles le **classement** et la **saisie des points** ;
- les fenêtres s'ouvrent au centre de l'écran, et les boutons réagissent au survol de la souris ;
- avec une souris et un clavier, chaque bouton indique son raccourci (ces indications sont masquées sur écran tactile).

### Raccourcis clavier (écran de partie)

| Touche | Action |
| --- | --- |
| `Espace` ou `→` | Joueur suivant |
| `←` | Joueur précédent |
| `1` à `9`, `0` | Boutons rapides, dans l'ordre |
| `S`, `+` ou `−` | Saisir une autre valeur |
| Pavé numérique | Taper directement un nombre, puis `Entrée` |
| `↑` `↓` | Choisir le joueur qui reçoit les points |
| `Ctrl+Z` (`⌘Z` sur Mac) ou `Retour arrière` | Annuler la dernière saisie |
| `P` | Pause / reprise du chronomètre |
| `?` | Afficher l'aide des raccourcis |
| `Échap` | Fermer une fenêtre |

Sur l'écran de configuration, `Ctrl+Entrée` lance la partie. Les chiffres fonctionnent aussi en AZERTY sans appuyer sur `Maj`.

## Organisation des données dans `localStorage`

Cinq clés, toutes préfixées par `compteurPoints.v1.` (le `v1` permettra de faire évoluer le format plus tard) :

| Clé | Contenu |
| --- | --- |
| `compteurPoints.v1.partieEnCours` | La partie en cours (absente s'il n'y en a pas) |
| `compteurPoints.v1.historique` | Les parties terminées, de la plus récente à la plus ancienne (200 max) |
| `compteurPoints.v1.boutonsRapides` | Les valeurs des boutons rapides, ex. `[100, 200, 300, 500, -50]` |
| `compteurPoints.v1.configuration` | Le dernier formulaire de configuration (prénoms, ordre, règle, minuteur) |
| `compteurPoints.v1.preferences` | Préférences, ex. `{ "sound": true }` |

### La partie en cours

```json
{
  "version": 1,
  "id": "mwumvyiep3r1gy",
  "startedAt": 1795521072758,
  "winRule": "high",
  "orderMode": "manual",
  "players": [
    { "id": "p1", "slot": 1, "name": "Marc", "color": "#3e63dd" },
    { "id": "p0", "slot": 0, "name": "Léa",  "color": "#e5484d" }
  ],
  "current": 0,
  "target": 0,
  "round": 2,
  "entries": [
    { "p": "p1", "v": 200, "r": 1, "t": 1795521080000 },
    { "p": "p0", "v": -50, "r": 1, "t": 1795521085000 }
  ],
  "clock":     { "accMs": 120000, "since": 1795521090000 },
  "turnTimer": { "enabled": true, "durationMs": 60000, "custom": false, "accMs": 0, "since": 1795521090000, "expired": false }
}
```

- `players` est rangé **dans l'ordre de passage**. `slot` est la place du joueur dans le formulaire (elle fixe sa couleur).
- `current` désigne le joueur dont c'est le tour. `target` désigne celui qui reçoit les points (en général le même). `round` est le numéro du tour.
- **Les scores ne sont pas stockés, ils sont recalculés** à partir de `entries`, le journal de toutes les saisies (`p` = joueur, `v` = points, `r` = tour, `t` = horodatage). Ce journal suffit à tout :
  - total d'un joueur = somme de ses saisies ;
  - « Annuler » = retirer la dernière saisie ;
  - feuille « Tour par tour » = saisies regroupées par tour.
- **Les temps sont des horodatages**, pas des compteurs : `accMs` est le temps déjà cumulé et `since` le début de la période en cours (`null` = en pause). Le chronomètre reste donc juste après un rechargement de la page ou une mise en veille du téléphone.

### Une partie de l'historique

Résumé compact, sans le détail des saisies :

```json
{
  "id": "mwumvyiep3r1gy",
  "startedAt": 1795521072758,
  "endedAt": 1795521093766,
  "durationMs": 17431,
  "rounds": 2,
  "winRule": "high",
  "orderMode": "manual",
  "turnTimer": { "enabled": true, "seconds": 90, "custom": true },
  "players": [
    { "name": "Marc", "slot": 1, "color": "#3e63dd", "score": 300,   "rank": 2 },
    { "name": "Léa",  "slot": 0, "color": "#e5484d", "score": 500,   "rank": 1 },
    { "name": "Zoé",  "slot": 2, "color": "#30a46c", "score": -85.5, "rank": 3 }
  ],
  "winners": ["Léa"]
}
```

En cas d'égalité, plusieurs joueurs ont le rang 1 et `winners` contient tous leurs prénoms.
À la lecture, les données sont vérifiées : des données abîmées sont ignorées au lieu de bloquer le site.

> Les données sont propres à **un navigateur, sur un appareil, pour une adresse de site**.
> La version locale et la version en ligne ont donc chacune leurs propres données.
> Vider les données du navigateur efface aussi l'historique.

## Tester le site

### Sur ordinateur

Double-cliquez sur `index.html` : le site s'ouvre et fonctionne directement, avec l'interface ordinateur.
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

- Le **son** du minuteur. Sur iPhone, il est coupé si le bouton latéral est en mode silencieux.
- La **vibration** : elle fonctionne sur Android, mais Safari sur iPhone ne la permet pas.
- L'**écran qui reste allumé** pendant la partie (iOS 16.4 ou plus récent, Chrome Android).
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
