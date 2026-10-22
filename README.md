<div align="center">

# 🎬 FRAME

### Plateforme moderne de suivi de médias, recommandations intelligentes & intégrations serveur

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-hollow313%2Fframe-0db7ed?logo=docker&logoColor=white)](https://hub.docker.com/r/hollow313/frame)
[![Docker Alpine](https://img.shields.io/badge/Container-Alpine%20Linux-2496ED?logo=docker&logoColor=white)](#déploiement-docker)
[![Node.js 22](https://img.shields.io/badge/Node.js-22%20LTS-339933?logo=node.js&logoColor=white)](#architecture)
[![SQLite WAL](https://img.shields.io/badge/Database-SQLite%20WAL-003B57?logo=sqlite&logoColor=white)](#architecture)
[![Tailwind Dark](https://img.shields.io/badge/Design-Mode%20Nuit%20Cinéma-06B6D4?logo=tailwindcss&logoColor=white)](#interface--fonctionnalités)
[![Language](https://img.shields.io/badge/Langue-Français%20(fr--FR)-blue)](#fonctionnalités-clés)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](#license)

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
  - **Bidirectionnel** : Visualisez l'état des téléchargements et des disponibilités sur votre serveur.
  - **Demande directe 1-clic** : Demandez de nouveaux films ou séries (saisons complètes, option 4K) directement depuis Frame vers Seer.
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

### 1. Synchronisation Simkl (Connexion Simplifiée en 1 Clic)

Pour connecter votre compte Simkl sans vous soucier des URLs de redirection ou de configuration d'application :
1. Dans Frame, ouvrez **Paramètres** > onglet **Mon Profil, Simkl & Jellyfin**.
2. Cliquez sur **« Obtenir un code PIN Simkl »**.
3. Cliquez sur **« Valider sur Simkl »** (le lien `simkl.com/pin?XXXX` s'ouvre avec votre code pré-rempli).
4. Cliquez sur **Approve** sur Simkl, puis revenez sur Frame et cliquez sur **« J'ai validé le code sur Simkl ! »**.
5. Cliquez sur **« Synchroniser mes vues maintenant »** pour importer tous vos films et séries !

*(Si vous souhaitez utiliser votre propre application développeur Simkl, indiquez dans les **Redirect URLs** de Simkl : `http://<IP_DU_SERVEUR>:30018/api/simkl/callback`).*

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
1. **Au niveau Administrateur** : Renseignez l'URL globale de votre serveur Jellyfin dans **Paramètres** > **Intégrations Serveur** (ex: `http://serveur:8096`).
2. **Au niveau de chaque Utilisateur** : Chaque membre peut lier son propre compte Jellyfin personnel dans **Paramètres** > **Mon Profil, Simkl & Jellyfin** avec ses identifiants.
3. Le bandeau d'accueil affiche automatiquement la lecture en direct avec pourcentage de progression, et le bouton **« Synchroniser mes vues Jellyfin »** importe votre historique exact.

---

### 6. Sorties du moment par Plateforme de Streaming

Grâce à l'intégration JustWatch / TMDB :
- L'onglet **Plateformes** permet de filtrer l'ensemble des films et séries du moment par service de streaming disponible en France (**Netflix, Prime Video, Disney+, Crunchyroll, Apple TV+, Canal+**), cumulable avec les filtres par genre.
- Chaque fiche détaillée affiche les logos des plateformes sur lesquelles l'œuvre est disponible en visionnage.

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

Ce projet est distribué sous licence [MIT](LICENSE).
