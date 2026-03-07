# Procédure de Mise à Jour Bloumechat 🚀

Pour que vos utilisateurs reçoivent une mise à jour instantanée, suivez ces étapes :

## 1. Augmenter la Version
Dans le fichier `windows/package.json`, modifiez la version (ex: `"version": "1.0.1"`).

## 2. Générer le Pack de Release
Exécutez la commande suivante dans le dossier `windows/` :
```powershell
npm run build
```
Cela va créer les fichiers nécessaires dans `windows/dist/`.

## 3. Publier sur GitHub
Le système de mise à jour est configuré pour GitHub (voir `electron-builder.yml`).
1. Allez sur votre dépôt GitHub.
2. Créez une nouvelle **Release**.
3. Le **Tag** doit correspondre exactement à la version du `package.json` (ex: `v1.0.1`).
4. Uploadez les fichiers suivants depuis `windows/dist/` :
   - `BloumeChat Setup 1.0.1.exe`
   - `latest.yml` (CRITIQUE : c'est ce fichier que l'app vérifie pour savoir s'il y a une update)
   - `BloumeChat Setup 1.0.1.exe.blockmap`

## 4. Diffusion
Dès que la Release est publiée sur GitHub, toutes les applications Bloumechat installées détecteront l'ajoute du fichier `latest.yml` et proposeront la mise à jour automatiquement.

> [!IMPORTANT]
> Ne jamais oublier d'uploader le fichier `latest.yml`, c'est le cerveau du système d'auto-update.
