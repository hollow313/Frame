<div align="center">

# 🎬 FRAME

### Plateforme moderne de suivi de médias, recommandations intelligentes & intégrations serveur

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-hollow313%2Fframe-0db7ed?logo=docker&logoColor=white)](https://hub.docker.com/r/hollow313/frame)
[![Docker Alpine](https://img.shields.io/badge/Container-Alpine%20Linux-2496ED?logo=docker&logoColor=white)](#déploiement-docker)
[![Node.js 22](https://img.shields.io/badge/Node.js-22%20LTS-339933?logo=node.js&logoColor=white)](#architecture)
[![SQLite WAL](https://img.shields.io/badge/Database-SQLite%20WAL-003B57?logo=sqlite&logoColor=white)](#architecture)
[![Tailwind Dark](https://img.shields.io/badge/Design-Mode%20Nuit%20Cinéma-06B6D4?logo=tailwindcss&logoColor=white)](#interface--fonctionnalités)
[![Language](https://img.shields.io/badge/Langue-Français%20(fr--FR)-blue)](#fonctionnalités-clés)
[![License](https://img.shields.io/badge/License-Propriétaire%20Non--Commercial-red.svg)](#licence)

<br/>

**Frame** est une plateforme auto-hébergée légère, moderne et centrée sur l'expérience utilisateur, pensée pour suivre vos films et séries, centraliser vos demandes multimédias et découvrir de nouvelles pépites grâce à un véritable moteur de recommandations personnalisé.

</div>

---

## ✨ Fonctionnalités clés

- 🌙 **Interface moderne avec priorité au Mode Nuit** : Design cinématique sombre (Dark Mode) immersif, réactif et fluide, pensé pour le visionnage sur écran.
- 🇫🇷 **Métadonnées & Synopsis 100% en Français** : Titres, affiches, résumés et bandes-annonces en français par défaut (`fr-FR`), avec repli intelligent.
- 🎯 **Moteur de Recommandations Personnalisé** : Analyse vos œuvres visionnées et vos notes (sur 10) pour en déduire votre profil de goût (genres favoris, acteurs, réalisateurs) et proposer de véritables recommandations thématiques (*« Parce que vous avez aimé... »*, *« Pépites acclamées »*, *« Top par genre »*).
- 👁️ **Suivi des Déjà Vus & Liste à Voir** : Notez vos films sur 10 étoiles, ajoutez une critique personnelle, tenez un journal de vos visionnages et gérez votre watchlist d'un clic.
- 🔄 **Synchronisation Simkl** : Importez et synchronisez automatiquement votre historique de visionnage et vos listes de films/séries Simkl vers Frame.
- ☁️ **Intégration Overseerr / Jellyseerr ("Seer")** :
  - **Suivi visuel complet** : Liste des demandes enrichie avec affiches, vrais titres, date et demandeur.
  - **Demande directe 1-clic & Annulation** : Demandez de nouveaux médias directement, ou annulez vos demandes en cours. Le bouton de demande disparaît automatiquement si le média est déjà disponible sur le serveur ou déjà demandé.
- 📅 **Calendrier des Sorties (Style Sonarr / Radarr)** : Calendrier chronologique des prochaines sorties films et épisodes de séries à venir (cette semaine, semaine prochaine, ce mois-ci, watchlist), avec compte à rebours précis.
- 📡 **Intégration Sonarr & Radarr** : Détection automatique des fichiers déjà présents sur les disques de votre serveur, état de téléchargement et taille des médias.
- 👥 **Gestion Multi-utilisateurs** : Système d'authentification complet (JWT, hashage sécurisé bcrypt) avec rôles Administrateur et Membres. Chaque utilisateur dispose de son propre historique, de ses notes et de ses recommandations.
- ⚡ **Ultra-léger & performant** : Conteneur Linux basé sur **Alpine**, consommant moins de 100 Mo de RAM, propulsé par Node.js 22 et SQLite intégré en mode WAL haute concurrence.

---

## 🚀 Déploiement Docker

Frame est spécialement conçu pour tourner dans un conteneur Linux allégé Alpine sur votre serveur, avec prise en charge native du montage de dossiers (bind mounts) et exécution sous l'utilisateur **UID 568** / **GID 568**.

### Port par défaut
Le service écoute sur le port **`30018`**.

### 1. Avec Docker Compose (Recommandé)

Créez un dossier pour Frame sur votre serveur et placez-y le fichier `docker-compose.yml` suivant :

```yaml
services:
  frame:
    image: hollow313/frame:latest
    container_name: frame
    restart: unless-stopped
    ports:
      - "30018:30018"
    environment:
      - PUID=568
      - PGID=568
      - TZ=Europe/Paris
      - PORT=30018
      - NODE_ENV=production
      # Les variables suivantes sont optionnelles ici car configurables via l'interface web :
      # - TMDB_API_KEY=votre_cle_tmdb
      # - SEER_URL=http://serveur:5055
      # - SEER_API_KEY=votre_cle_seer
      # - SONARR_URL=http://serveur:8989
      # - SONARR_API_KEY=votre_cle_sonarr
      # - RADARR_URL=http://serveur:7878
      # - RADARR_API_KEY=votre_cle_radarr
      # - SIMKL_CLIENT_ID=votre_client_id_simkl
      # - JWT_SECRET=chaine_secrete_aleatoire
    volumes:
      - ./data:/app/data
      - ./config:/app/config
```

Lancez ensuite le conteneur :
```bash
docker compose up -d
```

### 2. Avec la commande `docker run`

```bash
docker run -d \
  --name frame \
  --restart unless-stopped \
  -p 30018:30018 \
  -e PUID=568 \
  -e PGID=568 \
  -e TZ=Europe/Paris \
  -v ./data:/app/data \
  -v ./config:/app/config \
  frame:latest
```

Accédez ensuite à l'application depuis votre navigateur :
`http://<IP_DU_SERVEUR>:30018`

---

## 🛠️ Premier Démarrage & Configuration

1. **Création du premier compte** :
   À la première ouverture, rendez-vous sur la page de connexion. Le premier compte enregistré recevra automatiquement le rôle **Administrateur**.
2. **Configuration des clés d'API (Aucune clé requise en dur)** :
   Depuis l'onglet **Paramètres** (icône ⚙️ accessible aux administrateurs) :
   - **TMDB** : Indiquez votre clé d'API TheMovieDatabase (v3) pour charger les métadonnées, synopsis et affiches en français.
   - **Overseerr / Jellyseerr** : Renseignez l'URL locale de votre serveur Seer (ex: `http://serveur:5055`) et la clé d'API.
   - **Sonarr & Radarr** : Renseignez les URLs et clés d'API respectives.
   - Cliquez sur **« Tester »** pour valider chaque connexion en direct sans redémarrer le conteneur.
3. **Synchronisation Simkl** :
   Dans l'onglet **Profil & Simkl**, chaque utilisateur peut coller son *Access Token* Simkl et cliquer sur **« Synchroniser mes vues maintenant »** pour importer l'intégralité de ses films et séries déjà visionnés.

---

## 🛠️ Configuration & Intégrations

### 1. Synchronisation Simkl (Tutoriel Complet OAuth 2.0 Auth V2 & PIN)

Pour connecter votre compte Simkl sans tracas et importer vos listes :

#### Étape 1 : Créer votre application Simkl (en 1 minute chrono)
1. Rendez-vous sur la page développeur Simkl : [https://simkl.com/settings/developer/new](https://simkl.com/settings/developer/new)
2. Remplissez le formulaire :
   - **App Name** : `Frame`
   - **Type d'application** : Choisissez **`Browser sign-in + server callback`** (Auth V2)
   - **Redirect URLs** : Renseignez l'adresse de votre serveur Frame suivie de `/settings` (ex: `http://<IP_DU_SERVEUR>:30018/settings`). Vous pouvez cliquer sur le bouton **« Copier l'URL »** directement dans Frame pour obtenir l'adresse exacte.
3. Cliquez sur le bouton **« Save App »**.
4. Simkl affiche votre **Client ID** et votre **Client Secret**. Conservez-les précieusement.

#### Étape 2 : Lier votre compte dans Frame

Deux méthodes simples sont disponibles selon votre réseau :

- **Méthode A (Redirection automatique vers votre serveur)** :
  1. Si vous avez renseigné l'URL de votre serveur (ex: `http://<IP_DU_SERVEUR>:30018/settings`) dans Simkl.
  2. Dans Frame, collez votre **Client ID** et votre **Client Secret**.
  3. Cliquez sur **« Se connecter automatiquement (Redirection) »**.
  4. Autorisez Frame sur Simkl : vous êtes redirigé et connecté instantanément !

- **Méthode B (Si votre serveur utilise une IP locale privée ou si vous avez mis https://simkl.com)** :
  1. Dans Simkl Developer, définissez le **Redirect URI** sur `https://simkl.com`.
  2. Dans Frame, sélectionnez le raccourci `https://simkl.com` dans l'URL de redirection.
  3. Cliquez sur **« 1. Ouvrir l'autorisation (Nouvel onglet) »**.
  4. Acceptez sur Simkl : votre navigateur affiche alors `https://simkl.com/?code=...`.
  5. Copiez simplement cette URL ou le code affiché dans votre barre d'adresse, collez-la dans Frame dans le champ prévu et cliquez sur **« Valider le code Simkl »** !
  6. Votre compte est instantanément connecté !

Une fois connecté, cliquez sur **« Synchroniser mes vues maintenant »** : tous vos films et séries visionnés sont automatiquement importés dans Frame.

> 💡 **Important** : Le Client Secret (qui commence par `simkl_cs_`) n'est pas un jeton d'accès utilisateur. Ne le collez pas dans le champ Jeton d'accès direct, mais bien dans le champ Client Secret du formulaire de connexion OAuth.
> 📺 **Mode PIN alternatif** : Pour les appareils sans navigateur ou Smart TV, vous pouvez également utiliser l'option *« Connexion par code PIN »* pour valider un code court à 8 caractères sur `simkl.com/pin`.

---

### 2. Gestion des Comptes & Inscription Restreinte

Par défaut, l'auto-inscription publique est **désactivée** pour préserver la sécurité de votre serveur :
- L'administrateur peut créer des comptes pour les membres depuis l'onglet **Gestion Utilisateurs** via le bouton **« Créer un utilisateur »**.
- Si vous préférez autoriser les utilisateurs à s'inscrire eux-mêmes, activez simplement la case à cocher correspondante dans **Paramètres** > **Sécurité & Authentification**.

---

### 3. Authentification Centralisée LDAP / LLDAP

Frame intègre un client natif LDAP idéal pour se brancher sur votre conteneur **LLDAP** ou OpenLDAP :
1. Dans **Paramètres** > **Sécurité & Authentification**, cochez **« Activer la connexion des utilisateurs via LDAP »**.
2. Renseignez les paramètres de votre annuaire :
   - **URL LDAP** : `ldap://<IP_DU_SERVEUR>:3890` (ou le nom de conteneur Docker `ldap://lldap:3890`)
   - **Base DN** : `dc=example,dc=com`
   - **Bind DN** : `uid=admin,ou=people,dc=example,dc=com`
   - **Filtre utilisateur** : `(&(objectClass=person)(|(uid={{username}})(mail={{username}})))`
3. Cliquez sur **« Tester LDAP »** pour valider la connexion. Les utilisateurs de votre annuaire pourront directement se connecter avec leurs identifiants !

---

### 4. Authentification SSO / Reverse Proxy (Authelia, Authentik, Traefik, Caddy)

Frame fonctionne parfaitement derrière un reverse proxy gérant le SSO :
1. Activez **« Activer l'authentification automatique par en-tête Reverse Proxy »**.
2. L'en-tête par défaut est **`Remote-User`** (format standard Authelia).
3. Lorsqu'un utilisateur authentifié par Authelia arrive sur Frame, il est automatiquement reconnu et connecté sans mot de passe additionnel.

---

### 5. Connexion Jellyfin & Statut de Lecture Réel Multi-utilisateurs

Pour suivre exactement ce que chaque utilisateur regarde en temps réel :
1. **Adresse du serveur Jellyfin** :
   - Renseignez l'URL locale de votre serveur Jellyfin (ex: `http://192.168.x.x:8096`).
   - ⚠️ **Important pour Docker** : n'utilisez pas `localhost` dans l'URL si Frame tourne dans un conteneur Docker, car `localhost` pointerait vers le conteneur lui-même. Utilisez l'adresse IP locale de votre serveur ou le nom de votre conteneur Jellyfin.
   - Vous pouvez cliquer sur **« Tester la connexion au serveur »** directement dans vos paramètres pour valider que le serveur est bien joignable.
2. **Méthodes d'authentification disponibles pour chaque utilisateur** :
   - **Par Identifiant & Mot de passe** : entrez simplement vos identifiants Jellyfin.
   - **Par Clé d'API Jellyfin (Recommandé si vous utilisez LDAP ou SSO)** :
     1. Dans Jellyfin, rendez-vous dans **Tableau de bord** > **Avancé** > **Clés d'API**.
     2. Cliquez sur le bouton **+**, nommez la clé `Frame`, et copiez la clé générée.
     3. Dans Frame, choisissez l'onglet **Clé API** et collez votre clé. Cette méthode est infaillible et ne dépend pas des restrictions de mot de passe.
3. Le bandeau d'accueil affiche automatiquement la lecture en direct avec pourcentage de progression, et le bouton **« Synchroniser mes vues Jellyfin »** importe votre historique exact.
4. **Accès direct Jellyfin** : Lorsqu'une œuvre est détectée sur votre serveur, le bouton **« Voir sur Jellyfin »** ouvre directement la fiche du média sur votre Jellyfin pour lancer la lecture en un clic.
5. **Blocage automatique des demandes Seer inutiles** : Dès qu'un film ou une série est déjà présent sur votre serveur (disponible dans Jellyfin, téléchargé dans Sonarr/Radarr ou validé dans Seer), le bouton « Demander sur Seer » est automatiquement masqué et remplacé par le badge vert *« Présent sur le serveur »*. Les options superflues (comme la case 4K) ont été retirées pour une interface épurée.

---

### 6. Fiches Médias Enrichies & Guide des Épisodes

Chaque fiche de film ou série propose désormais des informations complètes :
- **Pour les séries TV** : Sélecteur de saisons avec la liste détaillée des épisodes, numéros, titres en français, synopsis de chaque épisode, dates de diffusion et durées.
- **Date de sortie complète** et compte à rebours précis.
- **Suivi des visionnages** : Si l'œuvre a déjà été vue, la date exacte du visionnage (*« Vu le JJ/MM/AAAA »*) et votre note personnelle s'affichent instantanément.

---

### 7. Calendrier des Prochaines Sorties (Films, Séries & Mangas)

Le calendrier répertorie toutes les sorties à venir dans une vue chronologique (cette semaine, semaine prochaine, ce mois-ci, watchlist) :
- **Films** : Sorties en salle et nouveautés cinéma.
- **Séries TV** : Épisodes de séries actuellement en cours de diffusion (*on the air*) et nouvelles séries à venir.
- **Mangas & Animés** : Nouveaux épisodes et films d'animation japonaise à venir (avec exclusion des dessins animés pour enfants).
- **Ma Watchlist** : Vos propres œuvres enregistrées ayant une date de diffusion future.

---

### 6. Préférences de Contenu & Exclusion des Mangas / Séries / Films

Chaque utilisateur peut personnaliser les types d'œuvres qu'il souhaite voir apparaître sur son interface :
- Dans **Paramètres** > **Mon Profil, Simkl & Jellyfin** > **« Mes Préférences de Contenu »** :
  - **Films** : Cochez/décochez pour inclure ou masquer les films.
  - **Séries TV** : Cochez/décochez pour inclure ou masquer les séries.
  - **Animés / Mangas** : Si vous ne regardez jamais de manga, décochez simplement cette case : les mangas et animés seront **totalement exclus** du carrousel d'accueil et des recommandations personnalisées.

---

### 7. Explorer, Plateformes & Mangas

Tout est centralisé dans l'onglet **Découvrir** :
- **Sorties récentes par Plateforme (SVOD)** : Filtrez par service de streaming disponible en France (**Netflix, Prime Video, Disney+, Crunchyroll, Apple TV+, Canal+**). L'option *« Sorties récentes du moment »* est activée par défaut pour afficher les vraies nouveautés et sorties récentes (2025-2026) au lieu de vieux titres.
- **Mangas & Animés** : Sélection d'animation japonaise pour ados et adultes (les dessins animés pour jeunes enfants sont strictement exclus grâce au filtrage de genres).
- **Par Genre** : Parcourez les films et séries par genre (Action, Science-Fiction, Drame, Horreur, etc.).
- Chaque fiche détaillée affiche également les logos des plateformes sur lesquelles l'œuvre est disponible en visionnage en France.

---

## 🧠 Moteur de Recommandations & Carrousel Dédié

Contrairement aux listes statiques génériques, Frame intègre un algorithme d'affinité cinéphile :
1. **Pondération par note & récurrence** : Les films notés 8, 9 ou 10/10 apportent un score d'affinité supérieur aux genres, réalisateurs et acteurs associés.
2. **Exploration TMDB & Filtrage strict** : Le moteur interroge les similarités et recommandations profondes de vos coups de cœur, en éliminant systématiquement les titres que vous avez déjà marqués comme vus.
3. **Présentation par thèmes** : Les suggestions sont organisées par sections lisibles (*« Parce que vous avez aimé Inception »*, *« Top Thriller »*, *« Pépites méconnues »*).

---

## 💻 Développement Local

### Prérequis
- Node.js 22 LTS
- Git

### Installation & Lancement

```bash
# Cloner le dépôt
git clone https://github.com/hollow313/Frame.git
cd Frame

# Copier le fichier d'environnement modèle
cp .env.example .env

# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev

# Compiler pour la production
npm run build

# Démarrer le serveur de production (port 30018)
npm start
```

---

## 🔒 Sécurité & Bonnes Pratiques

- **Aucune clé API ou mot de passe en dur** : Tout est paramétrable par fichier d'environnement `.env`, fichier `config/config.json` ou directement via l'interface d'administration protégée.
- **Mots de passe hachés** : Utilisant `bcrypt` avec salage à 10 tours.
- **Sessions chiffrées** : Jetons JWT sécurisés transmis via en-têtes d'autorisation et cookies HTTP-only.
- **Isolation utilisateur** : UID `568` / GID `568` pour correspondre aux permissions de stockage sécurisées sur votre serveur.

---

## 📄 Licence

Ce projet est distribué sous **Licence Propriétaire Non-Commerciale**.
- **Usage strictement personnel & privé** : Vous êtes libre d'héberger et d'utiliser Frame pour votre propre usage privé.
- **Interdiction commerciale** : Toute revente, monétisation ou exploitation commerciale est strictement interdite.
- **Interdiction de modification & redistribution** : La modification du code et la distribution de versions dérivées sont formellement interdites sans l'accord écrit de l'auteur.

Consultez le fichier [LICENSE](LICENSE) pour l'intégralité des termes et conditions.
