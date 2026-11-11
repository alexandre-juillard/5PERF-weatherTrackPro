
### Jeu de données S (≈1,1 M lignes, 100 villes)

#### Moyenne, historique complet (30 ans) (`avg-full`)

| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v0 original | 17,3 | — | 2 682 ms | 5 151 ms | 64 ms | 0 | 2 827 ms | 134 % | 408 Mo |
| v1 SQL | 174,2 | ×10 | 290 ms | 385 ms | 19 ms | 0 | 23,7 ms | 44 % | 242 Mo |
| v2 schéma | 522,2 | ×30 | 95 ms | 152 ms | 9 ms | 0 | 24,4 ms | 72 % | 278 Mo |
| v3 cache | 1 762,7 | ×102 | 27 ms | 52 ms | 2 ms | 0 | 35,7 ms | 105 % | 289 Mo |
| v4 runtime (1 proc.) | 1 679,2 | ×97 | 28 ms | 54 ms | 2 ms | 0 | 36,3 ms | 103 % | 166 Mo |
| v4 cluster (4 proc.) | 5 505,6 | ×318 | 8 ms | 16 ms | 2 ms | 0 | 17,8 ms | 424 % | 602 Mo |

#### Moyenne, 1 an (`avg-1y`)

| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v0 original | 6 | — | 5 208 ms | 8 414 ms | 163 ms | 0 | 8 376 ms | 112 % | 416 Mo |
| v1 SQL | 866,3 | ×144 | 56 ms | 80 ms | 4 ms | 0 | 22,7 ms | 107 % | 212 Mo |
| v2 schéma | 968,7 | ×161 | 50 ms | 76 ms | 3 ms | 0 | 21,3 ms | 103 % | 248 Mo |
| v3 cache | 1 569,5 | ×262 | 30 ms | 54 ms | 3 ms | 0 | 35,6 ms | 102 % | 292 Mo |
| v4 runtime (1 proc.) | 1 624,8 | ×271 | 30 ms | 52 ms | 3 ms | 0 | 37,4 ms | 101 % | 169 Mo |
| v4 cluster (4 proc.) | 5 155,6 | ×859 | 9 ms | 17 ms | 2 ms | 0 | 18,9 ms | 420 % | 609 Mo |

#### Données brutes, 1 an (`data-1y`)

| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v0 original | 5,9 | — | 5 084 ms | 8 468 ms | 178 ms | 0 | 8 808 ms | 107 % | 417 Mo |
| v1 SQL | 474,8 | ×80 | 104 ms | 146 ms | 5 ms | 0 | 30,2 ms | 108 % | 217 Mo |
| v2 schéma | 512 | ×87 | 95 ms | 136 ms | 4 ms | 0 | 29,6 ms | 102 % | 253 Mo |
| v3 cache | 1 207,1 | ×205 | 40 ms | 67 ms | 6 ms | 0 | 38,1 ms | 103 % | 309 Mo |
| v4 runtime (1 proc.) | 1 316,6 | ×223 | 36 ms | 62 ms | 6 ms | 0 | 34,7 ms | 104 % | 188 Mo |
| v4 cluster (4 proc.) | 3 414,8 | ×579 | 14 ms | 25 ms | 3 ms | 0 | 20,9 ms | 404 % | 674 Mo |

#### Export historique complet (`data-full`)

| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v0 original | 9,2 | — | 4 443 ms | 6 035 ms | 104 ms | 0 | 4 450,2 ms | 118 % | 419 Mo |
| v1 SQL | 31,9 | ×3,5 | 1 501 ms | 1 791 ms | 62 ms | 0 | 57,7 ms | 119 % | 312 Mo |
| v2 schéma | 33 | ×3,6 | 1 459 ms | 1 593 ms | 46 ms | 0 | 61,8 ms | 113 % | 304 Mo |
| v3 cache | 33,9 | ×3,7 | 1 436 ms | 1 535 ms | 45 ms | 0 | 59,4 ms | 121 % | 354 Mo |
| v4 runtime (1 proc.) | 32,9 | ×3,6 | 1 459 ms | 1 646 ms | 46 ms | 0 | 56,3 ms | 121 % | 224 Mo |
| v4 cluster (4 proc.) | 108 | ×12 | 380 ms | 744 ms | 45 ms | 0 | 67,7 ms | 456 % | 866 Mo |

#### Requêtes populaires (mix) (`hot`)

| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v0 original | 7,6 | — | 4 945 ms | 7 096 ms | 115 ms | 0 | 5 360,3 ms | 114 % | 417 Mo |
| v1 SQL | 897 | ×118 | 54 ms | 80 ms | 4 ms | 0 | 20,9 ms | 101 % | 286 Mo |
| v2 schéma | 897,3 | ×118 | 54 ms | 86 ms | 3 ms | 0 | 22,2 ms | 99 % | 283 Mo |
| v3 cache | 1 611,6 | ×212 | 30 ms | 51 ms | 2 ms | 0 | 38,9 ms | 103 % | 331 Mo |
| v4 runtime (1 proc.) | 1 577,4 | ×208 | 30 ms | 53 ms | 2 ms | 0 | 37,6 ms | 99 % | 206 Mo |
| v4 cluster (4 proc.) | 4 991,2 | ×657 | 9 ms | 17 ms | 2 ms | 0 | 18,2 ms | 418 % | 678 Mo |

### Jeu de données L (≈11 M lignes, 1 000 villes)

#### Moyenne, historique complet (30 ans) (`avg-full`)

| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v0 original | 16,8 | — | 2 724 ms | 5 605 ms | 107 ms | 0 | 2 696,9 ms | 131 % | 429 Mo |
| v1 SQL | 43,1 | ×2,6 | 1 071 ms | 1 967 ms | 55 ms | 0 | 22,5 ms | 14 % | 205 Mo |
| v2 schéma | 492,2 | ×29 | 99 ms | 160 ms | 15 ms | 0 | 24,6 ms | 64 % | 250 Mo |
| v3 cache | 1 826,9 | ×109 | 26 ms | 48 ms | 3 ms | 0 | 34,4 ms | 115 % | 326 Mo |
| v4 runtime (1 proc.) | 1 744 | ×104 | 27 ms | 51 ms | 3 ms | 0 | 36,8 ms | 104 % | 165 Mo |
| v4 cluster (4 proc.) | 5 076,3 | ×302 | 9 ms | 19 ms | 2 ms | 0 | 19,8 ms | 463 % | 609 Mo |

#### Moyenne, 1 an (`avg-1y`)

| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v0 original | 5,9 | — | 5 346 ms | 8 301 ms | 210 ms | 9 | 7 998,5 ms | 110 % | 427 Mo |
| v1 SQL | 872,8 | ×148 | 56 ms | 77 ms | 5 ms | 0 | 21,2 ms | 101 % | 246 Mo |
| v2 schéma | 936,6 | ×159 | 51 ms | 83 ms | 3 ms | 0 | 23,7 ms | 99 % | 248 Mo |
| v3 cache | 860,1 | ×146 | 66 ms | 102 ms | 5 ms | 0 | 30,3 ms | 102 % | 295 Mo |
| v4 runtime (1 proc.) | 827,9 | ×140 | 67 ms | 115 ms | 5 ms | 0 | 37,6 ms | 104 % | 166 Mo |
| v4 cluster (4 proc.) | 3 390,2 | ×575 | 13 ms | 29 ms | 6 ms | 0 | 19,3 ms | 423 % | 620 Mo |

#### Données brutes, 1 an (`data-1y`)

| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v0 original | 5,8 | — | 5 155 ms | 8 541 ms | 212 ms | 7 | 8 933,9 ms | 106 % | 427 Mo |
| v1 SQL | 487,1 | ×84 | 101 ms | 130 ms | 6 ms | 0 | 27 ms | 100 % | 254 Mo |
| v2 schéma | 492,8 | ×85 | 99 ms | 132 ms | 4 ms | 0 | 29,7 ms | 99 % | 256 Mo |
| v3 cache | 482,9 | ×83 | 117 ms | 159 ms | 6 ms | 0 | 43,4 ms | 104 % | 302 Mo |
| v4 runtime (1 proc.) | 497,2 | ×86 | 112 ms | 162 ms | 6 ms | 0 | 45,4 ms | 105 % | 178 Mo |
| v4 cluster (4 proc.) | 1 375,3 | ×237 | 37 ms | 56 ms | 7 ms | 0 | 27,8 ms | 398 % | 674 Mo |

#### Export historique complet (`data-full`)

| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v0 original | 10 | — | 4 616 ms | 8 813 ms | 136 ms | 0 | 4 563,4 ms | 122 % | 441 Mo |
| v1 SQL | 22,1 | ×2,2 | 2 033 ms | 2 897 ms | 91 ms | 0 | 50,4 ms | 84 % | 303 Mo |
| v2 schéma | 32,9 | ×3,3 | 1 431 ms | 1 665 ms | 46 ms | 0 | 57,4 ms | 122 % | 304 Mo |
| v3 cache | 33 | ×3,3 | 1 439 ms | 1 695 ms | 48 ms | 0 | 56,8 ms | 115 % | 349 Mo |
| v4 runtime (1 proc.) | 33,9 | ×3,4 | 1 411 ms | 1 545 ms | 44 ms | 0 | 70,4 ms | 120 % | 231 Mo |
| v4 cluster (4 proc.) | 107,7 | ×11 | 387 ms | 752 ms | 46 ms | 0 | 76,2 ms | 460 % | 904 Mo |

#### Requêtes populaires (mix) (`hot`)

| Version | Débit (req/s) | Gain vs v0 | Latence p50 sous charge | p99 sous charge | Latence unitaire p50 | Erreurs | Event loop p99 | CPU | RSS max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v0 original | 9,1 | — | 5 177 ms | 6 059 ms | 114 ms | 0 | 5 653,9 ms | 115 % | 439 Mo |
| v1 SQL | 899,9 | ×99 | 53 ms | 86 ms | 4 ms | 0 | 19,3 ms | 102 % | 274 Mo |
| v2 schéma | 944,1 | ×104 | 51 ms | 84 ms | 3 ms | 0 | 22,2 ms | 103 % | 283 Mo |
| v3 cache | 1 418,3 | ×156 | 34 ms | 72 ms | 2 ms | 0 | 41,3 ms | 104 % | 333 Mo |
| v4 runtime (1 proc.) | 1 568,3 | ×172 | 30 ms | 56 ms | 2 ms | 0 | 40,7 ms | 100 % | 207 Mo |
| v4 cluster (4 proc.) | 5 084 | ×559 | 9 ms | 17 ms | 2 ms | 0 | 18,2 ms | 426 % | 703 Mo |
