# 📄 Documentation des Codes de Retour EXE (NSIS)

Lors de l'installation ou de la désinstallation de **BloumeChat**, le moteur **NSIS** (Nullsoft Scriptable Install System) peut retourner différents codes de sortie (Exit Codes) pour indiquer le résultat de l'opération.

## 🏁 Codes de Sortie Standards

| Code | Signification | Description |
| :--- | :--- | :--- |
| **0** | **Succès** | L'opération (installation, désinstallation ou exécution) s'est terminée avec succès. |
| **1** | **Erreur Générique** | Une erreur inconnue est survenue durant le processus. |
| **2** | **Annulé par l'utilisateur** | L'utilisateur a cliqué sur le bouton "Annuler" ou a fermé la fenêtre avant la fin. |
| **1223** | **Action Annulée par l'utilisateur** | Code spécifique à Windows indiquant qu'une action a été annulée (souvent lié à l'UAC). |

## 🛠️ Codes Spécifiques à electron-builder / NSIS

| Code | Signification | Description |
| :--- | :--- | :--- |
| **3** | **Privilèges Insuffisants** | L'installateur nécessite des droits administrateur pour écrire dans `Program Files`. |
| **4** | **Fichier en utilisation** | Un fichier requis par l'installateur est actuellement ouvert par une autre application (souvent BloumeChat déjà lancé). |
| **5** | **Accès Refusé** | L'installateur n'a pas pu accéder à un répertoire ou à une clé de registre spécifique. |

---

## 🔍 Dépannage des Erreurs Courantes

### L'installation échoue avec le code 4
**Cause** : L'application BloumeChat est probablement en train de tourner en arrière-plan.
**Solution** : Fermez complètement l'application (vérifiez la barre des tâches / System Tray) et relancez l'installateur.

### L'installation échoue avec le code 3 ou 5
**Cause** : Manque de permissions pour écrire sur le disque.
**Solution** : Faites un clic droit sur `BloumeChat-Setup.exe` et choisissez **"Exécuter en tant qu'administrateur"**.

---

## 🌐 Liens Utiles
- [Documentation Officielle NSIS](https://nsis.sourceforge.io/Docs/Chapter3.html#3.2.2)
- [Troubleshoot electron-updater](https://www.electron.build/auto-update)

---
*Cette documentation est fournie à titre indicatif pour aider à la résolution des problèmes de déploiement de BloumeChat Desktop.*
