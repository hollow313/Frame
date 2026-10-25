<div align="center">

# 🎬 FRAME

### Plateforme moderne de suivi de médias, recommandations intelligentes & intégrations serveur

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-hollow313%2Fframe-0db7ed?logo=docker&logoColor=white)](https://hub.docker.com/r/hollow313/frame)
[![Docker Alpine](https://img.shields.io/badge/Container-Alpine%20Linux-2496ED?logo=docker&logoColor=white)](#-déploiement-docker)
[![Node.js 22](https://img.shields.io/badge/Node.js-22%20LTS-339933?logo=node.js&logoColor=white)](#-architecture--développement)
[![SQLite WAL](https://img.shields.io/badge/Database-SQLite%20WAL-003B57?logo=sqlite&logoColor=white)](#-sécurité--bonnes-pratiques)
[![Tailwind Dark](https://img.shields.io/badge/Design-Mode%20Nuit%20Cinéma-06B6D4?logo=tailwindcss&logoColor=white)](#-fonctionnalités-clés)
[![Language](https://img.shields.io/badge/Langue-Français%20(fr--FR)-blue)](#-fonctionnalités-clés)
[![License](https://img.shields.io/badge/License-Propriétaire%20Non--Commercial-red.svg)](#-licence)

<br/>

**Frame** est une plateforme auto-hébergée moderne, fluide et centrée sur l'expérience cinéphile. Elle centralise vos films, séries TV, animés et mangas, automatise le suivi de vos visionnages (Jellyfin & Simkl), gère vos demandes multimédias (Seerr / Overseerr) et vous aide à découvrir de nouvelles œuvres grâce à un moteur de recommandations sur mesure.

</div>

---

## ✨ Fonctionnalités clés

- 🌙 **Interface cinématique Mode Nuit** : Design sombre immersif, soigné et réactif, pensé pour le grand écran comme pour le mobile.
- 🇫🇷 **Métadonnées 100% en Français** : Titres, résumés, affiches et bandes-annonces en français par défaut (`fr-FR`) avec gestion automatique des replis.
- 📺 **Suivi épisode par épisode & progression** : Suivez précisément votre avancée dans chaque saison (barres de progression, statut unitaire par épisode, validation rapide de saison entière).
- 🔄 **Double Synchronisation automatique (Simkl & Jellyfin)** : Planificateur d'arrière-plan synchronisant automatiquement vos films, séries et épisodes vus toutes les 6 heures (ainsi qu'à la demande).
- 📊 **Statistiques de visionnage complètes & Partage** : Heures cumulées par an/mois/jour, genres favoris, records d'activité, séries terminées, et générateur d'image récapitulative partageable téléchargeable en un clic.
- 🎯 **Moteur de Recommandations Hybride** : Analyse vos notes, genres et réalisateurs préférés pour proposer de véritables suggestions pertinentes (*« Parce que vous avez aimé... »*, *« Pépites acclamées »*, *« Par genre »*).
- ☁️ **Intégration Overseerr / Jellyseerr ("Seer")** :
  - **Suivi des demandes** enrichi avec affiches, statut réel et demandeur.
  - **Demande directe 1-clic & Annulation** : Le bouton s'adapte automatiquement et se transforme en badge vert *« Présent sur le serveur »* dès que le média est disponible sur Jellyfin/Sonarr/Radarr.
  - **Gestion fine des approbations** : Possibilité de router les demandes via un compte dédié (ex: `TV`) avec en-tête `X-Api-User` pour contourner le bug d'auto-approbation d'Overseerr et conserver la mise en attente manuelle.
- 🧭 **Onglet Découvrir unifié** : Films, séries, animés et mangas regroupés sur une seule page avec filtres par plateforme SVOD (Netflix, Disney+, Prime Video, Crunchyroll, Canal+), filtres par genre et tri par nouveautés ou prochaines sorties à venir.
- 📅 **Calendrier des Sorties** : Vue chronologique des sorties cinéma et des épisodes à venir (cette semaine, semaine prochaine, ce mois-ci, watchlist), avec vérification des dates réelles de diffusion.
- 📡 **Intégration Sonarr & Radarr** : Détection des fichiers présents sur vos disques, import des séries/animés non monitorés vers l'historique Déjà Vu.
- 🛡️ **Authentification Triple Voie** :
  - Comptes locaux sécurisés (hashage bcrypt).
  - Annuaire centralisé **LDAP / LLDAP** (compatible avec filtres personnalisés par groupes).
  - **SSO Reverse Proxy transparent** (Authelia, Authentik, Traefik, Caddy, Nginx Proxy Manager) avec détection multi-en-têtes et support automatique des sous-réseaux bridge Docker.
- ⚡ **Léger & Performant** : Conteneur Linux basé sur **Alpine**, consommant moins de 100 Mo de RAM, propulsé par Node.js 22 et SQLite intégré en mode WAL haute concurrence.

---

## 🚀 Déploiement Docker

Frame est prêt à l'emploi sur tout serveur Linux, NAS TrueNAS / Synology / Unraid, exécuté sous l'utilisateur standard **UID 568** / **GID 568**.

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
      # Optionnel : toutes les clés et paramètres peuvent être saisis directement dans l'interface web
      # - FRAME_ENCRYPTION_KEY=cle_secrete_optionnelle_pour_chiffrement_secrets
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
  hollow313/frame:latest
```

Accédez ensuite à l'application depuis votre navigateur :
`http://<IP_DU_SERVEUR>:30018`

---

## 🛠️ Configuration & Intégrations

### 1. Premier Démarrage & Paramètres Serveur
1. **Création du premier compte** :
   À la première ouverture, vous êtes invité à créer le compte principal qui recevra automatiquement les droits **Administrateur**.
2. **Configuration des intégrations (Sans redémarrage)** :
   Depuis l'onglet **Paramètres** (icône ⚙️ accessible aux administrateurs) :
   - **TMDB** : Indiquez votre clé d'API TheMovieDatabase (v3) pour récupérer métadonnées et affiches en français.
   - **Overseerr / Jellyseerr ("Seer")** : Renseignez l'URL et votre clé d'API Seer principale. Cliquez sur **« Tester »** pour valider la connectivité et la clé en temps réel.
   - **Sonarr & Radarr** : Indiquez les URLs et clés d'API respectives.
   - Les clés secrètes sont automatiquement masquées et sécurisées sans risque d'écrasement intempestif.

---

### 2. Synchronisation Simkl (OAuth 2.0 & PIN)

Frame supporte le protocole officiel OAuth 2.0 de Simkl :
1. Créez une application sur [https://simkl.com/settings/developer/new](https://simkl.com/settings/developer/new) :
   - **Type d'application** : `Browser sign-in + server callback` (Auth V2)
   - **Redirect URLs** : L'adresse de votre Frame suivie de `/settings` (ex: `http://<IP>:30018/settings`) ou `https://simkl.com`.
2. Dans Frame (**Paramètres** > **Mon Profil, Simkl & Jellyfin**) :
   - Renseignez votre **Client ID** (et Client Secret si nécessaire).
   - Connectez-vous soit par redirection directe, soit via le mode manuel avec code collé, soit via le mode PIN court (`simkl.com/pin`).
3. Cochez **« Synchronisation automatique toutes les 6h »** pour que vos ajouts sur Simkl soient importés automatiquement en continu.

---

### 3. Connexion Jellyfin & Suivi en Direct

1. **Serveur Jellyfin** :
   - Renseignez l'URL locale de votre serveur Jellyfin (ex: `http://192.168.x.x:8096` ou `http://serveur:8096`).
   - ⚠️ *Important* : N'utilisez pas `localhost` si Frame tourne dans un conteneur Docker, privilégiez l'IP LAN du serveur ou le nom du conteneur.
2. **Liaison du compte utilisateur** :
   - Vous pouvez vous connecter soit avec vos identifiants Jellyfin habituels, soit avec une **Clé d'API Jellyfin** (Dashboard > Clés d'API > `+` Frame).
3. **Automatisations incluses** :
   - Synchronisation automatique en arrière-plan **toutes les 6 heures** de vos films, séries et épisodes vus.
   - Affichage en direct sur la page d'accueil de la lecture en cours avec progression en temps réel.
   - Bouton direct **« Voir sur Jellyfin »** sur la fiche de chaque œuvre pour lancer la lecture dans l'application Jellyfin.

---

### 4. Overseerr / Jellyseerr ("Seer") & Gestion des Approbations

Frame s'interface avec votre instance Overseerr ou Jellyseerr :
- **Détection de disponibilité** : Si un film ou une série est déjà disponible ou téléchargé, le bouton de demande se transforme automatiquement en badge vert *« Présent sur le serveur »*.
- **Gestion des demandes manuelles (Contournement de l'auto-approbation)** :
  - Par défaut, l'utilisation de la clé API administrateur d'Overseerr auto-approuve immédiatement toute demande.
  - Dans Frame (**Paramètres** > **Intégrations Serveur** > **Seer**), vous pouvez sélectionner un compte demandeur spécifique dans le menu déroulant **« Utilisateur Seer pour les demandes (gestion des approbations) »** (par exemple un compte `TV`).
  - Frame envoie automatiquement l'en-tête `X-Api-User` correspondant et calibre les permissions requises pour que la demande soit créée sous ce compte et reste sagement **en attente d'approbation manuelle** (*Pending Approval*) dans votre Seer.

---

### 5. Authentification SSO / Reverse Proxy (Authelia, Authentik, Traefik, Caddy)

Frame s'intègre de manière transparente derrière tout reverse proxy gérant le SSO :
1. Dans **Paramètres** > **Sécurité & Authentification**, cochez **« Activer l'authentification automatique par en-tête Reverse Proxy »**.
2. **Proxies de confiance autorisés** : Indiquez l'IP LAN de votre serveur (ex: `192.168.1.50` ou `192.168.0.0/16`) ou le sous-réseau de votre reverse proxy.
   > 💡 **Prise en charge Docker** : Dès qu'une IP de confiance est renseignée, Frame accepte automatiquement les passerelles de sous-réseaux internes Docker (`172.16.0.0/12`, `192.168.0.0/16`, `10.0.0.0/8`, `127.0.0.0/8`) utilisées par les reverse proxies tournant en conteneur.
3. **Bypass automatique de la 2e connexion** :
   - Frame recherche automatiquement les en-têtes SSO standards (`Remote-User`, `X-Forwarded-User`, `X-authentik-username`, `X-Auth-Request-User`, `Remote-Email`).
   - Même si votre reverse proxy valide l'accès sans injecter d'en-tête utilisateur dans la requête, Frame connecte automatiquement l'utilisateur à son compte principal, évitant toute invite de connexion redondante.

---

### 6. Authentification Centralisée LDAP / LLDAP

1. Activez **« Activer la connexion des utilisateurs via LDAP / LLDAP »**.
2. Renseignez :
   - **URL LDAP** : `ldap://192.168.x.x:3890` (ou port de votre LLDAP / OpenLDAP).
   - **Base DN** : `dc=example,dc=com`
   - **Bind DN** : `uid=admin,ou=people,dc=example,dc=com`
   - **Filtre de recherche** : supporte la syntaxe classique avec `{{username}}` ou les filtres de restriction de groupe (ex: `(&(objectClass=person)(memberOf=cn=Frame,ou=groups,dc=example,dc=com))`).
3. Cliquez sur **« Tester LDAP »** pour valider la configuration.

---

### 7. Statistiques de Visionnage & Partage

L'onglet **Statistiques** propose une vue analytique détaillée de vos habitudes de consommation multimédia :
- **Temps total passé** : Heures cumulées sur l'année en cours et sur l'ensemble de votre historique.
- **Répartition par type & genre** : Séparation stricte Films, Séries TV, Mangas & Animés, avec graphiques en barres et pourcentages.
- **Habitudes & Records** : Jour de la semaine le plus actif, année record, série de jours consécutifs (*streak*), et récapitulatifs hebdomadaires et mensuels.
- **Bouton de Partage** : Génère en un clic une carte visuelle élégante récapitulant vos statistiques de l'année, prête à être téléchargée en image PNG haute définition.

---

### 8. Fiches Médias Enrichies & Suivi Épisode par Épisode

Chaque fiche propose une vue complète :
- **Séries & Animés** : Sélecteur de saisons avec liste exhaustive de tous les épisodes, titres traduits en français, durées, dates de diffusion et résumés.
- **Progression visuelle** : Barre de progression par saison (ex: `Saison 1 : 12 / 12 épisodes vus (100%)`).
- **Cochage rapide** : Marquez individuellement un épisode comme vu ou cochez une saison entière en un clic.
- **Rétro-remplissage intelligent** : Si une série a été marquée comme vue globalement depuis Simkl ou Jellyfin, l'ouverture de sa fiche complète automatiquement tous les épisodes déjà diffusés en base.

---

### 9. Découvrir, Plateformes & Calendrier

- **Filtrage SVOD France** : Nouveautés disponibles sur Netflix, Prime Video, Disney+, Crunchyroll, Apple TV+, Canal+.
- **Filtre Prochaines Sorties vs Déjà sorties** : Basculez entre les œuvres déjà parues et les sorties à venir (*upcoming*).
- **Calendrier chronologique** : Suivi des dates réelles de diffusion des épisodes de séries et des sorties cinéma.
- **Préférences de profil** : Possibilité pour chaque utilisateur de masquer totalement les mangas, séries ou films de ses recommandations et de son flux d'accueil.

---

## 💻 Architecture & Développement

### Stack Technique
- **Serveur** : Node.js 22 LTS, Express, SQLite natif (`node:sqlite`) en mode WAL, JWT, bcryptjs, ldapts.
- **Client** : React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, html-to-image.
- **Tests** : Vitest (18 tests unitaires automatisés couvrant la sécurité, le chiffrement, les filtres LDAP et le suivi d'épisodes).

### Lancement en local

```bash
# Cloner le projet
git clone https://github.com/hollow313/Frame.git
cd Frame

# Installer les dépendances
npm install

# Lancer la suite de tests
npm test

# Lancer le serveur de développement (client Vite + backend Express)
npm run dev

# Compiler pour la production
npm run build

# Démarrer le serveur de production (port 30018)
npm start
```

---

## 🔒 Sécurité & Bonnes Pratiques

- **Chiffrement des clés d'API (F-10)** : Prise en charge du chiffrement transparent AES-256-GCM via la variable optionnelle `FRAME_ENCRYPTION_KEY`.
- **Masquage étanche des secrets (F-09)** : Aucune clé sensible (TMDB, Seer, Sonarr, Radarr, LDAP) n'est renvoyée au navigateur.
- **Double persistance** : Sauvegarde synchrone dans la base SQLite (`server_settings`) avec réplication de sécurité dans `/app/data/settings.json` et `/app/config/settings.json`.
- **Protection SSRF (F-02)** : Blocage préventif des cibles locales non autorisées et des métadonnées cloud via `urlGuard`.
- **Protection Brute-Force (F-04)** : Rate limiting actif sur les endpoints de connexion et d'inscription.
- **Isolation utilisateur** : UID `568` / GID `568` pour correspondre aux permissions de stockage sécurisées des NAS TrueNAS / Synology / Unraid.

---

## 📄 Licence

Ce projet est distribué sous **Licence Propriétaire Non-Commerciale**.
- **Usage strictement personnel & privé** : Vous êtes libre d'héberger et d'utiliser Frame pour votre propre usage privé et familial.
- **Interdiction commerciale stricte** : Toute revente, monétisation ou intégration dans une offre commerciale est formellement interdite.
- **Interdiction de modification & redistribution** : La modification du code et la distribution de versions dérivées sont formellement interdites sans l'accord écrit préalable de l'auteur ([Hollow313](https://github.com/hollow313)).

Consultez le fichier [LICENSE](LICENSE) pour l'intégralité des termes et conditions.
