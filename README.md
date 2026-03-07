# 🚀 BloumeChat Desktop (Windows)

Bienvenue dans le dépôt de l'application desktop officielle de **BloumeChat**. Cette application est propulsée par **Electron** et **Nextron** (Next.js + Electron), offrant une expérience fluide, rapide et sécurisée directement sur votre PC.

## ✨ Fonctionnalités Desktop
- **Performance Optimisée** : Chargement plus rapide et fluidité accrue par rapport au navigateur.
- **Système d'Auto-Update** : Recevez les dernières nouveautés instantanément sans retélécharger manuellement l'application.
- **Intégration Système** : Icône dans la barre des tâches (Tray), notifications natives et contrôle de fenêtre personnalisé.
- **Sécurité Renforcée** : Bypass intelligent pour les cookies cross-origin et gestion sécurisée des sessions.

---

## 🛠️ Développement

### Installation des dépendances
```bash
npm install
```

### Lancer en mode développement
```bash
npm run dev
```

### Construire l'installateur (Production)
```bash
npm run build
```
Le fichier exécutable sera généré dans le dossier `dist/` sous le nom `BloumeChat-Setup-X.X.X.exe`.

---

## 📦 Release & Mise à Jour
Pour publier une nouvelle version :
1. Incrémentez la version dans `package.json`.
2. Lancez `npm run build`.
3. Créez une nouvelle release sur **GitHub** avec les fichiers générés : `.exe`, `.blockmap` et `latest.yml`.
4. L'application des utilisateurs détectera automatiquement la mise à jour et proposera l'installation.

---

## 📖 Documentation Additionnelle
- [Guide des Codes de Retour EXE](./EXIT_CODES.md) : Comprendre les codes de sortie lors de l'installation ou de l'exécution.
- [Guide de Release](./RELEASE_GUIDE.md) : Procédure détaillée pour les mises à jour.

---

## 🛡️ Sécurité & Confidentialité
L'application utilise un système de vérification par challenge pour garantir que seuls les utilisateurs légitimes accèdent au service. Les cookies de session sont gérés en `SameSite=None` pour une compatibilité parfaite avec l'iframe embarquée.

---
© 2026 Bloume SAS. Tous droits réservés.
