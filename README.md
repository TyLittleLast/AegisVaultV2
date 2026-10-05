# AegisVault

Coffre-fort de mots de passe **100 % local**. Aucun serveur, aucun compte, aucune télémétrie.
Le coffre vit dans votre navigateur, le chiffrement s'exécute dans votre navigateur, et la seule
requête réseau que l'application est autorisée à effectuer est un appel anonymisé à l'API
_Have I Been Pwned_ — que vous pouvez désactiver.

[![CI](https://github.com/TyLittleLast/AegisVaultV2/actions/workflows/ci.yml/badge.svg)](https://github.com/TyLittleLast/AegisVaultV2/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-MIT-emerald.svg)](./LICENSE)

---

## Le modèle de menace

AegisVault protège contre :

- la fuite du **support de stockage** — une copie d'IndexedDB volée ne contient que du chiffré ;
- la fuite du **cache réseau / navigateur** — la CSP réduit les sorties réseau à un seul hôte ;
- l'**observation passive du réseau** — seule une empreinte SHA-1 tronquée à 5 caractères quitte la machine ;
- l'**utilisation négligente d'un poste laissé ouvert** — verrouillage automatique et progressif après échecs.

AegisVault **ne protège pas** contre :

- un attaquant ayant le contrôle de la machine **pendant que le coffre est déverrouillé** ;
- un **keylogger** ou une extension malveillante exécutée dans le même profil ;
- la **force brute hors ligne** : Argon2id rend chaque essai coûteux, mais rien dans un navigateur
  ne peut empêcher qu'un attaquant possessing le fichier teste des millions de mots de passe sur son
  propre matériel. Une protection contre ce scénario exige un durcisseur de mémoire, pas du JavaScript ;
- l'**effacement mémoire réel** : voir la note honnête ci-dessous.

Si votre menace principale est un agent distant qui copie le fichier de coffre, d'autres outils
sont plus adaptés. AegisVault vise l'utilisateur qui veut que ses identifiants ne quittent jamais sa
machine, et qui veut pouvoir le vérifier.

---

## Cryptographie

| Paramètre       | Valeur                                      | Pourquoi                                                           |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Dérivation      | **Argon2id** (`hash-wasm`)                  | Résistant aux attaques GPU et side-channel, contrairement à PBKDF2 |
| Mémoire         | `m = 65 536` KiB (64 MiB)                   | Cible le budget mémoire des GPU plutôt que leur débit              |
| Itérations      | `t = 3`                                     |                                                                    |
| Parallélisme    | `p = 1`                                     | Évite que le coût soit absorbé par des cœurs supplémentaires       |
| Longueur de clé | `dkLen = 32`                                | 256 bits, pour AES-256                                             |
| Sel             | 16 octets aléatoires                        | `crypto.getRandomValues`, jamais dérivé                            |
| Chiffrement     | **AES-256-GCM** via Web Crypto              | AEAD : l'authentification est incluse, pas ajoutée                 |
| IV              | 12 octets, **nouveau à chaque chiffrement** | Un IV réutilisé avec une même clé est catastrophique en GCM        |

La clé est importée avec `extractable: false`. Elle n'est **jamais** sérialisée, jamais stockée, et
n'existe que dans une `CryptoKey` en mémoire, tenue par un `useRef` de `src/App.tsx` — un `ref`, pas
un état React, donc jamais copiée dans un arbre sérialisable ni déclenchant de rendu.

### Une note honnête sur l'effacement mémoire

JavaScript ne permet ni de mettre à zéro une `CryptoKey`, ni de garantir qu'une chaîne est effacée
avant le ramasse-miettes. `clearKey()` se contente de **détacher la référence**, ce qui est la seule
garantie disponible dans ce runtime. Le projet ne prétend pas faire mieux.

---

## Chiffrement par champ (format v2)

Chaque champ sensible est sa propre charge `EncryptedPayload` (`{ iv, ciphertext }` en base64), et non
un blob sérialisé. Le modèle ressemble à celui de Bitwarden, où chaque champ est son propre AEAD.

```
VaultStore
├── v: 2
├── kdf: { algo: "argon2id", m, t, p, dkLen }
├── salt
├── canary              ← permet de distinguer « mauvais mot de passe » de « coffre corrompu »
└── entries[]
    ├── id              (en clair)
    ├── favorite        (en clair)
    ├── updatedAt       (en clair)
    ├── entropy         (en clair)
    ├── service         🔒 chiffré
    ├── username        🔒 chiffré
    ├── url             🔒 chiffré
    └── password        🔒 chiffré
```

Ce choix a une conséquence directe sur l'interface : la **liste** des entrées n'a besoin que de
`service` + `username`, un `searchIndex` reconstruit au déverrouillage. Un mot de passe n'est
déchiffré que lorsqu'on ouvre explicitement une entrée.

**Aucun mot de passe ne vit dans un état React global.**

### Coffres v1 refusés

La v1 ne chiffrait que le mot de passe ; `service`, `username` et `url` étaient en clair. Ces champs
ne peuvent pas être re-chiffrés sans le texte en clair, donc un coffre v1 est **refusé** avec un
message explicite plutôt que silencieusement accepté ou converti de façon approximative. La v1 n'a
jamais été publiée ; ce cas est traité par précaution.

---

## Have I Been Pwned : k-anonymat

Désactivé par défaut (`settings.hibpEnabled = false`). Quand vous l'activez, et uniquement quand vous
révélez un mot de passe :

1. SHA-1 du mot de passe, calculé localement via Web Crypto ;
2. les **5 premiers caractères** (préfixe) partent sur le réseau ;
3. `GET https://api.pwnedpasswords.com/range/{prefix}` renvoie plusieurs centaines de suffixes ;
4. la comparaison du suffixe restant se fait **localement**.

**Le mot de passe ne quitte jamais le navigateur**, pas même son empreinte complète. L'API reçoit la
même requête pour deux mots de passe partageant un préfixe. L'en-tête `Add-Padding: true` est envoyé
pour que la taille de la réponse ne révèle rien sur le nombre de correspondances.

Le test `src/services/hibpService.test.ts` vérifie cette propriété directement : il capture l'URL
effectivement demandée et échoue si elle contient ne serait-ce que 40 caractères du hash.

---

## Vie privée

- **Aucune police distante.** Inter et JetBrains Mono sont installés via npm et compilés dans le
  bundle. Aucune requête vers `fonts.googleapis.com`.
- **Aucune télémétrie, aucun analytics, aucun pixel.**
- **CSP de production** injectée au build (`src/vite.config.ts`). La directive qui porte le projet est
  `connect-src 'self' https://api.pwnedpasswords.com` : elle transforme « aucun serveur » de promesse
  README en contrainte appliquée par le navigateur.
- `referrer: no-referrer`, `<noscript>` explicatif, focus visible, `lang="fr"`.
- Icônes de service générées **localement** : 76 logos du jeu _simple-icons_ (CC0-1.0) extraits
  dans le bundle par `npm run gen:brands`, résolus hors-ligne à partir du nom saisi, avec repli sur
  un monogramme. **Aucun favicon n'est jamais récupéré** : demander le favicon d'un service revient à
  divulguer chaque entrée stockée à un tiers, et contredirait la promesse zero-knowledge.

## Verrouillage de session

| Mécanisme                | Comportement                                                                 |
| ------------------------ | ---------------------------------------------------------------------------- |
| Inactivité               | Verrouillage après 5 min par défaut, réarmé à chaque interaction             |
| Perte de focus           | Verrouillage au `blur` de la fenêtre                                         |
| Onglet caché             | Verrouillage au `visibilitychange`                                           |
| Échecs de déverrouillage | Verrouillage progressif : 60 s, ×2 par échec au-delà de 5, plafonné à 15 min |

Le compteur d'échecs est **persiste** dans IndexedDB, pour survivre à un rechargement de page.

Le presse-papiers est écrasé d'un espace 30 s après toute copie d'un secret, ce qui réduit la fenêtre
d'exposition sur un poste partagé.

---

## Durabilité du stockage local

Le coffre vit dans IndexedDB, sur votre machine, et **n'existe nulle part ailleurs**. C'est la
conséquence directe de l'absence de serveur — et le seul vrai risque de cette architecture : il n'y a
qu'une seule copie.

Trois mesures, dont la première est une demande et non une garantie :

1. **`navigator.storage.persist()`** est demandé au déverrouillage, quand le navigateur est le plus
   favorable, et l'onglet **Santé** affiche l'état réel. Un refus est montré franchement, jamais
   silencieusement avalé : un refus ignoré devient, plus tard, indiscernable d'une perte de données.
2. **L'onglet Santé affiche l'espace utilisé** via `navigator.storage.estimate()`, pour voir la
   marge avant qu'elle ne devienne un problème.
3. **La date du dernier export est mémorisée** et affichée dans les réglages. L'export chiffre déjà
   tout le coffre ; c'est la seule sauvegarde hors machine, donc sa fraîcheur doit être visible.

Installer l'application comme PWA complète la histoire : sur mobile, un onglet non installé peut être
purgé après quelques jours d'inactivité, alors que les données d'une PWA installée sont liées à son
conteneur applicatif.

> `persist()` traite l'éviction **accidentielle**. Il ne protège pas de la perte de machine. Pour un
> coffre sans serveur, l'export reste la seule vraie assurance — d'où son affichage.

---

## Installation

Prérequis : **Node.js ≥ 20**.

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # tsc --noEmit && vite build  →  dist/
npm run preview  # sert dist/ localement
```

### Scripts

| Script                                      | Rôle                                                        |
| ------------------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                               | Serveur de développement Vite                               |
| `npm run build`                             | Typecheck puis build de production                          |
| `npm run preview`                           | Sert le build de production                                 |
| `npm run typecheck`                         | `tsc --noEmit`                                              |
| `npm run lint`                              | ESLint (config plate, règles React Hooks activées)          |
| `npm run format` / `format:check`           | Prettier                                                    |
| `npm test` / `test:watch` / `test:coverage` | Vitest                                                      |
| `npm run gen:brands`                        | Régénère les icônes de marque depuis `scripts/`             |
| `npm run check`                             | format, types, lint, tests, build — la base locale de la CI |

`npm run check` est le même enchaînement que la CI, à deux exceptions près : la CI lance
`test:coverage` (donc avec les seuils) et ajoute un job d'audit du bundle.

---

## Tests

205 tests sur 16 fichiers, exécutés par la CI sur Node 20, 22 et 24.

La couverture n'est pas uniforme, et il vaut mieux le dire que l'arrondir vers le haut :

| Zone                                          | Lignes   |
| --------------------------------------------- | -------- |
| `cryptoService`, `vaultSchema`, `hibpService` | 100 %    |
| `url`, `password`, `brandIcons`               | 93–100 % |
| `SearchField`                                 | 100 %    |
| `HealthTab`                                   | 95 %     |
| `MainLayout`                                  | 57 %     |
| `GeneratorTab`, `SettingsTab`                 | ~2 %     |

Globalement, **63,8 % des instructions et 65,2 % des lignes**, toutes couches confondues. C'est ce
chiffre-là qui est bloqué par un plancher dans `vitest.config.ts` : le faire baisser fait échouer la
CI. La couche qui porte le risque est à 100 % ; l'interface est en retard, et le tableau le dit.

Les seuils par glob de Vitest sont **silencieusement ignorés en 5.0.3** — vérifié en les plaçant à
99 %, ils ne déclenchaient rien. Seul un objet global unique fonctionne.

Les tests ciblent prioritairement les régressions silencieuses, celles qui ne cassent pas l'interface :

- **crypto** — clé non extractible, IV distincts, GCM qui rejette un bit inversé, un IV inversé, une
  charge tronquée, une mauvaise clé ;
- **k-anonymat** — l'URL ne contient que 5 caractères, ni le mot de passe ni son hash complet ;
- **coffre** — aucun texte en clair dans une entrée sérialisée, l'index de recherche sans mot de
  passe, rotation ré-écrivant tous les champs ;
- **stockage** — relecture brute d'IndexedDB prouvant que seul du chiffré est persisté ;
- **URL** — `javascript:`, `data:`, `file:` et la variante `javascript://` qui passe un
  `includes('://')` ;
- **interface** — repli monogramme/marque, géométrie de la jauge hors bornes, `Escape` qui replie
  sans vider la requête, ordre de tabulation d'un champ replié, filtrage et recherche de la liste.

Seul IndexedDB est simulé (`fake-indexeddb`). La suite tourne sous **jsdom** pour les tests de
composants, qui rendent React pour de vrai ; `crypto.subtle` et `fetch` restent ceux de Node. Les
paramètres Argon2 de production sont assertés par valeur ; les tests dérivent avec le coût minimal
accepté par Argon2 pour rester sous deux secondes.

> Un bug réel a été trouvé par cette suite : la condition d'échantillonnage par rejet de
> `randomIntBelow` était inversée, ce qui gelait le générateur de mots de passe au lieu de produire un
> mot de passe. Voir `fix(password): correct the inverted rejection-sampling condition`.

---

## Structure

```
src/
├── App.tsx                    orchestration, session, déverrouillage
├── components/
│   ├── MainLayout.tsx         dock, en-tête, liste, filtres, états vides
│   ├── SearchField.tsx        recherche repliable (Ctrl/Cmd+K)
│   ├── VaultDetailPanel.tsx   révélation, analyse, HIBP
│   ├── GeneratorTab.tsx       générateur local
│   ├── AddEntryModal.tsx
│   ├── HealthTab.tsx          diagnostic du coffre, score, jauge
│   ├── SettingsTab.tsx
│   ├── StorageCard.tsx        quota IndexedDB et persistence
│   ├── ServiceAvatar.tsx      marque locale ou monogramme
│   ├── EmptyState.tsx         illustrations d'état vide
│   └── ScoreGauge.tsx         jauge semicirculaire
├── data/
│   ├── brandIcons.ts          résolution nom -> marque
│   └── brandIcons.generated.ts  généré par npm run gen:brands
├── hooks/
│   ├── useIdleLock.ts
│   └── useIsMobile.ts
├── services/
│   ├── cryptoService.ts       Argon2id + AES-256-GCM + canary
│   ├── vaultCrypto.ts         chiffrement par champ, index, rotation
│   ├── vaultSchema.ts         validation de schéma, diagnostic
│   ├── storageService.ts      IndexedDB, réglages, compteur d'échecs
│   └── hibpService.ts         k-anonymat
├── utils/
│   ├── password.ts            entropie, classes, générateur
│   ├── url.ts                 allowlist de protocoles
│   └── clipboard.ts           copie + effacement programmé
└── types/vault.ts             types partagés

scripts/
├── brand-manifest.mjs         slugs et alias, curatés à la main
└── generate-brand-icons.mjs   npm run gen:brands
```

Le contexte technique et les décisions de conception sont dans [`CONTEXT.md`](./CONTEXT.md).
Le plan de durcissement et son historique sont dans [`plans/security-hardening-plan.md`](./plans/security-hardening-plan.md).

---

## PWA

L'application est installable et fonctionne hors ligne après une première visite. Le service worker
ne précharge que le build : **aucune règle de cache à l'exécution n'est enregistrée**, afin qu'il ne
puisse jamais répondre à la place de l'API HIBP. Les données du coffre vivent dans IndexedDB et ne
sont jamais touchées par le cache.

## CI

`.github/workflows/ci.yml` exécute formatage, typecheck, lint, tests avec couverture et build sur
Node 20, 22 et 24 — toutes les versions déclarées dans `engines`. Un second job audite le bundle de
production à la recherche de chaînes ressemblant à des identifiants avant de le publier en artefact.

Les seuils de couverture de `vitest.config.ts` sont **appliqués par la CI**, pas seulement en local :
c'est ce qui leur donne un sens de plancher.

Dependabot regroupe uniquement les **patchs**. Les majors restent une PR par dépendance, pour deux
raisons : une PR qui casse n'identifie pas sa cause, et un reviewer qui apprend à ignorer des PR
rouges cesse d'en lire.

## Licence

MIT — voir [`LICENSE`](./LICENSE).
