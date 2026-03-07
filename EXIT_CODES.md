# 📄 Documentation des Codes de Retour EXE (NSIS)

Lors de l'installation ou de la désinstallation de **BloumeChat**, le moteur **NSIS** (Nullsoft Scriptable Install System) peut retourner différents codes de sortie (Exit Codes) pour indiquer le résultat de l'opération.

## 🏁 Codes de Sortie Standards

| Scénario | Valeur du code | Documentation Spécifique |
| :--- | :--- | :--- |
| Scénario | Valeur du code | Documentation Spécifique |
| :--- | :--- | :--- |
| **Installation réussie** | **0** | [NSIS Success](https://nsis.sourceforge.io/Docs/Chapter3.html#3.2.2) |
| **Installation annulée** | **1223** | [System Error Codes](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes) |
| **L'application existe déjà** | **1** | [NSIS Error](https://nsis.sourceforge.io/Docs/Chapter3.html#3.2.2) |
| **Installation en cours** | **1618** | [MSI Error Codes](https://learn.microsoft.com/fr-fr/windows/win32/msi/error-codes) |
| **L'espace disque est plein** | **112** | [System Error Codes](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes) |
| **Redémarrage requis** | **3010** | [MSI Error Codes](https://learn.microsoft.com/fr-fr/windows/win32/msi/error-codes) |
| **Panne de réseau** | **12002** | [WinInet Errors](https://learn.microsoft.com/en-us/windows/win32/wininet/wininet-errors) |
| **Colis rejeté (Policy)** | **1625** | [MSI Error Codes](https://learn.microsoft.com/en-us/windows/win32/msi/error-codes) |
| **Privilèges insuffisants** | **5** | [System Error Codes](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes) |

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

## 📋 Récapitulatif des Scénarios d'Échec

Voici les valeurs de code de retour et les documentations associées pour les scénarios courants :

- **Installation annulée par l'utilisateur** : Valeur `1223` | [Documentation](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes)
- **L'application existe déjà** : Valeur `1` | [Documentation](https://nsis.sourceforge.io/Docs/Chapter3.html#3.2.2)
- **Installation en cours** : Valeur `1618` | [Documentation](https://learn.microsoft.com/fr-fr/windows/win32/msi/error-codes)
- **L'espace disque est plein** : Valeur `112` | [Documentation](https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes)
- **Redémarrage requis** : Valeur `3010` | [Documentation](https://learn.microsoft.com/fr-fr/windows/win32/msi/error-codes)
- **Panne de réseau** : Valeur `12002` | [Documentation](https://learn.microsoft.com/en-us/windows/win32/wininet/wininet-errors)
- **Colis rejeté lors de l'installation** : Valeur `1625` | [Documentation](https://learn.microsoft.com/en-us/windows/win32/msi/error-codes)
- **Installation réussie** : Valeur `0` | [Documentation](https://nsis.sourceforge.io/Docs/Chapter3.html#3.2.2)

---
*Cette documentation est fournie à titre indicatif pour aider à la résolution des problèmes de déploiement de BloumeChat Desktop.*
