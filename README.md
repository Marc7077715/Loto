# Loto & Bingo — tirage sur grand écran

Application web de tirage de **loto (90 numéros)** et de **bingo (75 numéros)**, pensée pour une TV,
un vidéoprojecteur ou un PC. Le numéro tiré s'affiche en grand à gauche, est annoncé par une voix
féminine, puis rejoint la grille à droite. Thème par défaut : **Loto de Noël**.

## Fonctions

- Tirage aléatoire sans remise (générateur cryptographique du navigateur), manuel ou automatique (3 à 30 s).
- Annonce vocale préenregistrée : « Quarante-sept… quatre, sept » ; au bingo : « N, quarante-sept ».
- Étapes de gain : quine → double quine → carton plein (loto) ; ligne → bingo (bingo), avec lot affiché.
- « Gagnant ? » : liste des numéros sortis pour vérifier le carton, puis validation ou fausse alerte.
- Annulation du dernier numéro, historique, 5 derniers numéros, compteur, reprise après fermeture.
- Cadeau surprise : tirage au sort d'un prénom ; un joueur déjà tiré est retiré de la liste.
- Thèmes : Noël, Nouvel An, Pâques, Halloween, neutre. Titre personnalisable.
- Utilisable à la télécommande (flèches + OK) et hors connexion une fois installée.

## Raccourcis clavier

`Entrée` / `Espace` tirer · `A` auto · `Z` annuler · `G` gagnant · `C` cadeau · `Échap` fermer / retour

## Utilisation

Aucune compilation : ce sont des fichiers statiques.

- **En local** : `python3 -m http.server` dans ce dossier, puis ouvrir `http://localhost:8000`.
- **En ligne** : activer GitHub Pages sur le dépôt (Settings → Pages → *Deploy from a branch*).
- **Android TV** : ouvrir l'adresse dans un navigateur de la TV (ou diffuser l'écran d'un PC / d'une tablette).

## Voix

Les fichiers de `audio/` ont été générés avec [Piper](https://github.com/rhasspy/piper) et la voix
française `fr_FR-siwis-medium` (jeu de données SIWIS, licence CC BY 4.0). Pour les régénérer ou changer
les phrases : `python3 tools/generer_voix.py audio` (après `pip install piper-tts` et téléchargement de
la voix dans `voice/`).
