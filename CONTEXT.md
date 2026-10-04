# AegisVault — Cahier des Charges Technique

## Stack Technique

| Couche               | Technologie                           |
| -------------------- | ------------------------------------- |
| Framework UI         | React 18 + TypeScript                 |
| Bundler              | Vite                                  |
| Styles               | Tailwind CSS v3                       |
| Crypto (KDF)         | hash-wasm (Argon2id)                  |
| Crypto (chiffrement) | Web Crypto API (AES-256-GCM)          |
| Anti-fuite           | HIBP Pwned Passwords API (k-anonymat) |

---

## Règles Cryptographiques Strictes

### Dérivation de clé — Argon2id

- Algorithme : **Argon2id** (résistant aux attaques GPU et side-channel)
- Paramètres obligatoires :
  - `m = 65536` (64 MiB de mémoire)
  - `t = 3` (3 itérations)
  - `p = 1` (1 thread)
  - `hashLength = 32` (256 bits → clé AES-256)
- Salt : **16 octets aléatoires** générés via `crypto.getRandomValues`
- La clé dérivée est importée comme `CryptoKey` non-extractable via `crypto.subtle.importKey`

### Chiffrement — AES-256-GCM

- Algorithme : **AES-GCM** avec clé 256 bits
- IV : **12 octets (96 bits)** aléatoires générés à chaque chiffrement
- Le tag d'authentification GCM (128 bits) est inclus automatiquement par Web Crypto
- Format de stockage : `{ iv: string (base64), ciphertext: string (base64) }`
- La clé n'est **jamais** sérialisée ni stockée — uniquement en mémoire session

### Effacement mémoire

- La référence à la `CryptoKey` est mise à `null` après usage de session
- Aucune clé ou mot de passe maître en clair dans le state React

---

## Fonctionnement HIBP — k-Anonymat

1. Calcul du hash **SHA-1** du mot de passe (via Web Crypto)
2. Extraction des **5 premiers caractères** (préfixe) → envoyés à l'API
3. Requête : `GET https://api.pwnedpasswords.com/range/{prefix}`
4. L'API retourne ~500 suffixes (35 chars) + compteurs
5. Comparaison **locale** du suffixe restant (35 chars) avec la liste
6. **Le mot de passe complet ne quitte jamais le navigateur**

---

## Design System — Classes Tailwind CSS

### Couleurs

| Rôle                  | Classe Tailwind                          | Valeur            |
| --------------------- | ---------------------------------------- | ----------------- |
| Fond principal        | `bg-[#13151A]`                           | #13151A           |
| Fond carte            | `bg-[#1F222A]`                           | #1F222A           |
| Fond dock             | `bg-[#1A1D24]/80`                        | #1A1D24 + opacité |
| Bordure subtile       | `border-white/10`                        | blanc 10%         |
| Texte principal       | `text-white`                             | —                 |
| Texte secondaire      | `text-white/50`                          | blanc 50%         |
| Accent sûr (vert)     | `text-emerald-400` / `bg-emerald-500/20` | —                 |
| Accent danger (rouge) | `text-red-400` / `bg-red-500/20`         | —                 |
| Accent neutre         | `text-blue-400`                          | —                 |

### Formes & Effets

| Composant         | Classes                                               |
| ----------------- | ----------------------------------------------------- |
| Carte coffre      | `rounded-2xl border border-white/10 backdrop-blur-md` |
| Dock latéral      | `rounded-3xl`                                         |
| Icônes nav        | `rounded-full`                                        |
| Boutons action    | `rounded-full` (gélule)                               |
| Badge statut HIBP | `rounded-full px-3 py-1 text-xs font-medium`          |

---

## Arborescence du Projet

```
AegisVault/
├── CONTEXT.md
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── services/
    │   ├── cryptoService.ts       # Argon2id + AES-256-GCM
    │   └── hibpService.ts         # HIBP k-anonymat SHA-1
    ├── components/
    │   ├── VaultCard.tsx          # Carte mot de passe
    │   └── MainLayout.tsx         # Layout dock + header + grille
    └── types/
        └── vault.ts               # Types TypeScript partagés
```
