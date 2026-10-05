# AegisVault — Cahier des Charges Technique

> Ce document décrit l'état **réel** du code. Toute affirmation ici doit être vérifiable dans
> `src/`. En cas de divergence, le code fait foi et ce document doit être corrigé.

## Stack Technique

| Couche               | Technologie                  | Note                                      |
| -------------------- | ---------------------------- | ----------------------------------------- |
| Framework UI         | React 18.3                   | 19 différé, aucun besoin fonctionnel      |
| Bundler              | Vite 7                       | cible `es2022`                            |
| Langage              | TypeScript `strict`          | `noUncheckedIndexedAccess` **non activé** |
| Styles               | Tailwind CSS **v4**          | configuré en CSS via `@theme`             |
| Polices              | `@fontsource-variable`       | Inter + JetBrains Mono, auto-hébergées    |
| Crypto (KDF)         | hash-wasm (Argon2id)         |                                           |
| Crypto (chiffrement) | Web Crypto API (AES-256-GCM) |                                           |
| Anti-fuite           | HIBP Pwned Passwords API     | opt-in, k-anonymat                        |
| PWA                  | `vite-plugin-pwa`            | shell seul, jamais le coffre              |
| Tests                | Vitest 5                     | 161 tests                                 |

Il n'y a **pas** de `tailwind.config.js` ni de `postcss.config.js` : Tailwind v4 passe par le
plugin `@tailwindcss/vite` et se configure dans `src/index.css`. `postcss` et `autoprefixer` ont
été retirés — le CSS produit est identique sans eux.

---

## Règles Cryptographiques Strictes

### Dérivation de clé — Argon2id

- Algorithme : **Argon2id**, 2e option recommandée de la RFC 9106 (environ contraints en mémoire)
- Paramètres (`DEFAULT_KDF` dans `src/services/cryptoService.ts`) :
  - `m = 65_536` (64 MiB de mémoire)
  - `t = 3` (3 itérations)
  - `p = 1` — le thread principal du navigateur est mono-thread
  - `dkLen = 32` (256 bits → clé AES-256)
- Salt : **16 octets aléatoires** via `crypto.getRandomValues`
- La clé est importée comme `CryptoKey` **non extractible** (`extractable: false`)

### Chiffrement — AES-256-GCM

- Clé 256 bits, **IV de 12 octets** régénéré à chaque chiffrement
- Tag d'authentification GCM (128 bits) inclus par Web Crypto
- Format : `{ iv: string (base64), ciphertext: string (base64) }`
- La clé n'est **jamais** sérialisée ni stockée — uniquement en mémoire de session

### Effacement mémoire

- `clearKey()` est documenté honnêtement comme **best-effort** : JavaScript ne permet pas de
  truly zero a `CryptoKey`. Ne pas le présenter comme une garantie.
- Aucun mot de passe ni clé maître en clair dans un état React global

---

## Modèle de données — format v2

`VaultStore { v: 2; kdf; salt; canary; entries }`

| Champ       | Traitement                                          |
| ----------- | --------------------------------------------------- |
| `id`        | clair — identification seulement                    |
| `favorite`  | clair — requis pour le filtre et le tri             |
| `updatedAt` | clair — requis pour l'ordre chronologique           |
| `entropy`   | clair — indice de robustesse grossier, rien de plus |
| `service`   | **chiffré** (AES-GCM, IV distinct)                  |
| `username`  | **chiffré**                                         |
| `url`       | **chiffré**                                         |
| `password`  | **chiffré**                                         |

- Le chiffrement est **par champ**, à la manière de Bitwarden, et non un blob JSON par entrée.
- `canary` se déchiffre en `CANARY_VALID` sous la bonne clé : distingue « mauvais mot de passe »
  de « coffre corrompu ».
- **Un coffre v1 (données en clair) est refusé.** Jamais de migration silencieuse.
- Au déverrouillage, seul `service` + `username` sont déchiffrés, dans un `searchIndex` en
  mémoire. Les mots de passe sont déchiffrés à la demande (panneau de détail) ou lors d'un audit
  explicitement déclenché.

---

## Fonctionnement HIBP — k-anonymat

**Opt-in explicite.** `settings.hibpEnabled` vaut `false` par défaut : tant qu'il reste désactivé,
l'application n'effectue aucune requête réseau.

1. Calcul du **SHA-1** du mot de passe (Web Crypto), en majuscules
2. Extraction des **5 premiers caractères** (préfixe) → seuls ceux-là sont envoyés
3. Requête : `GET https://api.pwnedpasswords.com/range/{prefix}` avec `Add-Padding: true`
4. Les lignes de padding sont des leurres de compteur `0` → **écartées** ; une vraie fuite compte
   au moins une occurrence
5. Comparaison **locale** du suffixe (35 caractères) sur la table reçue
6. Cache par préfixe, `AbortSignal`, retry sur 429 avec backoff

**Le mot de passe complet ne quitte jamais le navigateur.** La CSP le garantit :
`connect-src 'self' https://api.pwnedpasswords.com` — c'est la seule destination réseau autorisée.

---

## Design System

Tokens définis dans `src/index.css` via `@theme`. Le thème est **clair et chaud** (crème), pas
sombre.

### Couleurs

| Rôle                 | Classe                          | Valeur                |
| -------------------- | ------------------------------- | --------------------- |
| Fond principal       | `bg-cream`                      | `#faf8f5`             |
| Fond carte           | `bg-white`                      | `#ffffff`             |
| Fond enfoncé/état    | `bg-cream-deep`                 | `#f2efe9`             |
| Fond discret         | `bg-ink-light`                  | `rgb(0 0 0 / 0.06)`   |
| Bordure              | `border-border`                 | `#e8e4dc`             |
| Texte principal      | `text-inktext`                  | `#1a1814`             |
| Texte secondaire     | `text-inktext-muted`            | `#6b6660`             |
| Texte tertiaire      | `text-inktext-faint`            | `#9e9890`             |
| Encre (bouton plein) | `bg-ink`                        | `#111111`             |
| Accent chaud         | `text-peach` / `bg-peach-light` | `#e8927c` / `#fef0eb` |

Les couleurs de statut (emerald, amber, orange, red) viennent de la palette Tailwind par défaut,
utilisées en pastilles `bg-*-500/15` + texte `text-*-700`. L'accent peach est réservé aux
étoiles favorites.

### Formes & effets

`rounded-xl` est le rayon dominant. `rounded-3xl` n'est utilisé nulle part.

| Composant           | Classes                                                               |
| ------------------- | --------------------------------------------------------------------- |
| Carte / section     | `rounded-xl bg-white p-5 shadow-card`                                 |
| Section importante  | `rounded-2xl bg-white p-5 shadow-card`                                |
| Modale              | `rounded-2xl bg-white p-7 shadow-card`                                |
| Bouton primaire     | `rounded-xl bg-ink text-white hover:bg-ink-deep`                      |
| Bouton secondaire   | `rounded-xl bg-white text-ink shadow-card`                            |
| Ligne de liste      | `rounded-xl hover:bg-white/70`                                        |
| Champ de saisie     | `rounded-xl bg-cream focus-within:bg-white focus-within:shadow-panel` |
| Badge / pastille    | `rounded-full px-2.5 py-1 text-[11px] font-medium`                    |
| Jauge / progression | `rounded-full bg-cream` avec barre `transition-[width]`               |
| Avatar service      | `rounded-xl bg-ink-light`, glyphe à 50 % de la tuile                  |

Ombres disponibles : `shadow-card`, `shadow-panel`, `shadow-modal`.
Animations : `animate-rise`, `animate-fade`, `animate-loading-bar`.

Le focus visible est un contour global de 2 px sur `:focus-visible` — ne pas le supprimer.

### Icônes de service

Les logos viennent de **simple-icons** (CC0-1.0), dont les chemins SVG sont copiés dans un module
local par `npm run gen:brands` — le package n'est pas importable directement (voir
`scripts/generate-brand-icons.mjs`). `ServiceAvatar` affiche le glyphe à la couleur officielle sur
une tuile **neutre** ; le repli est un monogramme à tonalité stable (FNV-1a).

Aucun favicon n'est jamais récupéré : cela discloses chaque service stocké à un tiers et
contredirait la promesse zero-knowledge.

---

## Arborescence du Projet

```
AegisVault/
├── CONTEXT.md
├── README.md
├── index.html
├── package.json
├── tsconfig.json / tsconfig.node.json
├── vite.config.ts               # CSP injectée au build + PWA
├── vitest.config.ts
├── eslint.config.js
├── scripts/
│   ├── brand-manifest.mjs       # slugs + alias, curatés à la main
│   └── generate-brand-icons.mjs # npm run gen:brands
├── plans/
│   └── security-hardening-plan.md
└── src/
    ├── main.tsx
    ├── App.tsx                  # état du coffre, déverrouillage, ErrorBoundary
    ├── index.css                # @theme : tokens, base, utilitaires
    ├── components/
    │   ├── MainLayout.tsx       # dock latéral, header, liste, onglets
    │   ├── SearchField.tsx      # champ repliable (Ctrl/Cmd+K)
    │   ├── VaultDetailPanel.tsx # déchiffrement à la demande
    │   ├── AddEntryModal.tsx
    │   ├── GeneratorTab.tsx
    │   ├── HealthTab.tsx        # audit, score, jauge
    │   ├── SettingsTab.tsx
    │   ├── StorageCard.tsx      # quota + persistence
    │   ├── ServiceAvatar.tsx    # marque ou monogramme
    │   ├── EmptyState.tsx       # illustrations SVG
    │   └── ScoreGauge.tsx
    ├── data/
    │   ├── brandIcons.ts             # résolution label -> marque
    │   └── brandIcons.generated.ts   # généré, ne pas modifier
    ├── hooks/
    │   ├── useIdleLock.ts      # auto-lock inactivité + lockOnBlur
    │   └── useIsMobile.ts
    ├── services/
    │   ├── cryptoService.ts    # Argon2id + AES-256-GCM
    │   ├── vaultCrypto.ts      # chiffrement par champ, rotation du mdp
    │   ├── vaultSchema.ts      # validation stricte à l'import
    │   ├── storageService.ts   # IndexedDB, paramètres,defaults
    │   └── hibpService.ts      # HIBP k-anonymat SHA-1
    ├── utils/
    │   ├── password.ts         # entropy, grade, generate
    │   ├── url.ts              # safeExternalUrl (liste blanche http/https)
    │   └── clipboard.ts        # copySecret + écrasement après TTL
    ├── types/
    │   └── vault.ts
    └── test/
        └── setup.ts
```

---

## Workflow

```bash
npm run dev        # serveur de dev
npm run check      # format:check + typecheck + lint + test + build
npm run test:coverage
npm run gen:brands # après edit de scripts/brand-manifest.mjs
```

Avant de merger : branche dédiée → commit/push → **test navigateur utilisateur** → validation
« ok » → `git merge --no-ff` dans `main`. Les changements purement visuels ne sont pas validables
par la suite de tests.
