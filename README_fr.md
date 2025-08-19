# **Le Meneur de Nuit (Night Dealer)**

*Duel d’arcanes 3×3 — ATK · HEX · WARD
Micro–jeu de plateau (JS), inspiré par l’imaginaire du chat noir et des rituels nocturnes. Léger, mobile-friendly.*

## Synopsis

Les soirs de pleine lune, à minuit, un cartomancien à la fourrure noire — le Meneur de Nuit — pèse le destin des chats. Sur un damier 3×3, pose tes arcanes pour retourner les cases adjacentes et reprendre du temps. Gagne des manches, cumule des points-vies jusqu’à 9.

## Règles (V1.1)

### But du jeu
À la fin d’une manche, tu marques autant de points que de cases contrôlées (0–9). La partie se joue jusqu’à 3 manches : premier à 9 points gagne (égalité possible). A l'issue des 3 manches le joueur avec le plus de points est déclaré vainqueur.

### Plateau
Grille 3×3. Adjacences orthogonales uniquement (N/E/S/O).

### Roues
Chaque joueur a 5 roues dont les faces sont ATK / HEX / WARD.
ÉCLIPSE : 1 fois par joueur et par manche. Une roue peut comporter une face ECLIPSE, une fois qu'elle a été utilisée, les futurs tirages exclueront cette face. Une seule tuile ECLIPSE peut être tirée par manche.

### Tours (par manche : 3 tours/joueur)

*Tour 1* : lancer initial obligatoire (consomme 1/3 relances, dit "reroll"), puis poser 1 tuile ou 2 tuiles adjacentes.

*Tour 2* : 0–1 reroll facultatif, puis poser 1 ou 2 adjacentes.

*Tour 3* : 0–1 reroll facultatif, cap à 1 tuile posée (anti “dump”).
Poser une tuile consomme la roue correspondante (non relançable ensuite).

Triangle RPS. ATK > HEX > WARD > ATK (égalité = rien).

### Tuiles

ATK (Griffe). Bat HEX, perd vs WARD.

HEX (Maléfice/Piège, au choix à la pose).
Malédiction : s’il y a un WARD ennemi adjacent, flip immédiat via RPS ; sinon, marquer 1 tuile ennemie adjacente → à la fin du prochain tour adverse, tentative de flip (bloquée par bouclier).
Piège : placer 1 jeton visible sur 1 case adjacente vide. Si l’ennemi pose dessus : annule l’effet à la pose, puis flip immédiat tenté (bloqué par bouclier). Cap : 1 piège actif / joueur (le nouveau remplace l’ancien).

WARD (Talisman). À la pose : +1 bouclier sur soi et +1 bouclier à 1 allié adjacent (cap par tuile = 1). Bat ATK, perd vs HEX.

ÉCLIPSE (Joker). À la pose, choisir une affinité (ATK/HEX/WARD) → c’est un attribut (un piège n’annule pas ce choix). 1×/manche par joueur.

Omen (équilibrage du second joueur). P2 peut annuler 1 tentative de flip par manche (à n’importe quelle étape).

### Révélation & résolution (à la “validation” du tour).

Tag piège : toute tuile posée sur un piège voit son effet à la pose annulé (les attributs demeurent).

Effets à la pose des autres tuiles (ex. boucliers de WARD).

Déclenchement des pièges (flip immédiat ; bouclier possible) → pièges consommés.

Conversions RPS simultanées (orthogonales).

Effets retardés (malédictions).

Omen (s’il est déclenché).

### Style & accessibilité (provisoire)

Visuel 1-bit (noir/blanc), teintes CSS pour : Nuit #0B0E12, Ombre #2A2F36, Lune #E2C044, Arcane #6F5AFF, Maléfice #D14D4D, Talisman #3BA7A9.

Icônes : ATK (griffe), HEX (rune/œil), WARD (sceau), ÉCLIPSE (croissant), bouclier, piège (token).

Mobile-friendly : zones cliquables ≥ 64 px ; feedback visuel des flips potentiels (option “Apprenti”).

Sons : 3 bips WebAudio (pose / bouclier / flip), sans fichiers audio.

### Commandes

Souris / tactile : sélectionner les roues à relancer (max 1 reroll au T2/T3), choisir les tuiles, cliquer les cases valides (1 ou 2 adjacentes aux T1–T2, 1 au T3), Valider.

### License
MIT (À déterminer)