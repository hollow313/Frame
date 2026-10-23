// ============================================================================
// src/server/services/reco/engine.ts
// Moteur de recommandation hybride Frame v2 — TF-IDF, profils long/court terme,
// décroissance exponentielle, pénalité négative, MMR, explications & LinUCB.
// ============================================================================

export type SparseVec = Record<string, number>;

export interface MediaFeatures {
  key: string; // `${media_type}:${tmdb_id}`
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  originalLang?: string;
  releaseYear?: number;
  runtime?: number;
  voteAverage: number;
  voteCount: number;
  popularity: number;
  genres: { id: number; name: string }[];
  keywords: { id: number; name: string }[];
  directors: { id: number; name: string }[]; // ou showrunners pour TV
  cast: { id: number; name: string }[]; // top 5
  countries: string[];
  collectionId?: number | null;
  isAnime: boolean;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string;
}

export interface WatchedEvent {
  key: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  rating: number | null; // 1..10 ou null
  watchedAt: string; // ISO
  episodesWatched?: number;
  totalEpisodes?: number;
  signal?: 'watched' | 'watchlist' | 'not_interested' | 'click' | 'dismiss';
}

export interface TasteProfile {
  long: SparseVec;
  short: SparseVec;
  neg: SparseVec;
  meanRating: number;
  recentGenres: Map<number, number>;
}

export interface RecoWeights {
  wLong: number;
  wShort: number;
  wCollab: number;
  wQual: number;
  wFresh: number;
  wNeg: number;
}

export const DEFAULT_RECO_WEIGHTS: RecoWeights = {
  wLong: 0.38,
  wShort: 0.22,
  wCollab: 0.20,
  wQual: 0.12,
  wFresh: 0.08,
  wNeg: 0.45,
};

// ---------------- Outils vectoriels creux ----------------

export function dot(a: SparseVec, b: SparseVec): number {
  let s = 0;
  const [small, big] = Object.keys(a).length < Object.keys(b).length ? [a, b] : [b, a];
  for (const k in small) {
    if (big[k] !== undefined) s += small[k] * big[k];
  }
  return s;
}

export function norm(a: SparseVec): number {
  let s = 0;
  for (const k in a) s += a[k] * a[k];
  return Math.sqrt(s);
}

export function cosine(a: SparseVec, b: SparseVec): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

export function addScaled(target: SparseVec, src: SparseVec, scale: number): void {
  for (const k in src) {
    target[k] = (target[k] || 0) + src[k] * scale;
  }
}

export function mergeVec(a: SparseVec, wa: number, b: SparseVec, wb: number): SparseVec {
  const out: SparseVec = {};
  addScaled(out, a, wa);
  addScaled(out, b, wb);
  return out;
}

// ---------------- Encodage d'un média en vecteur ----------------

export function decadeBucket(year?: number): string | null {
  if (!year || year < 1920) return null;
  if (year >= 2020) return '2020s';
  return `${Math.floor(year / 10) * 10}s`;
}

export function runtimeBucket(min?: number, type?: 'movie' | 'tv'): string | null {
  if (!min || min <= 0) return null;
  if (type === 'tv') return min <= 30 ? 'ep_short' : 'ep_long';
  if (min < 95) return 'short';
  if (min <= 135) return 'std';
  return 'long';
}

export function toVector(m: MediaFeatures, idf?: Map<string, number>): SparseVec {
  const v: SparseVec = {};
  const gNorm = 1 / Math.sqrt(Math.max(1, m.genres.length));
  for (const g of m.genres) {
    const dim = `g:${g.id}`;
    const idfWeight = idf?.get(dim) ?? 1.0;
    v[dim] = 1.0 * gNorm * idfWeight;
  }

  const kwSlice = m.keywords.slice(0, 15);
  const kNorm = 1 / Math.sqrt(Math.max(1, kwSlice.length));
  for (const kw of kwSlice) {
    const dim = `k:${kw.id}`;
    const idfWeight = idf?.get(dim) ?? 1.0;
    v[dim] = 1.3 * kNorm * idfWeight;
  }

  for (const d of m.directors.slice(0, 2)) {
    const dim = `d:${d.id}`;
    const idfWeight = idf?.get(dim) ?? 1.0;
    v[dim] = 1.6 * idfWeight;
  }
  const castSlice = m.cast.slice(0, 5);
  castSlice.forEach((c, idx) => {
    const dim = `a:${c.id}`;
    const idfWeight = idf?.get(dim) ?? 1.0;
    v[dim] = (0.9 - idx * 0.12) * idfWeight;
  });

  if (m.originalLang) v[`l:${m.originalLang}`] = 0.5;
  for (const country of m.countries.slice(0, 2)) {
    v[`c:${country}`] = 0.4;
  }
  const dec = decadeBucket(m.releaseYear);
  if (dec) v[`dec:${dec}`] = 0.35;
  const rt = runtimeBucket(m.runtime, m.mediaType);
  if (rt) v[`rt:${rt}`] = 0.25;
  if (m.collectionId) v[`col:${m.collectionId}`] = 2.0;

  return v;
}

// ---------------- Poids d'événement & décroissance temporelle ----------------

export function eventWeight(e: WatchedEvent): number {
  if (e.signal === 'not_interested') return -2.0;
  if (e.signal === 'dismiss') return -0.35;
  if (e.signal === 'watchlist') return +0.9;
  if (e.signal === 'click') return +0.25;

  let rWeight: number;
  if (e.rating == null) {
    rWeight = 0.55; // vu sans note = signal positif modéré
  } else {
    const x = (e.rating - 5.5) / 4.5; // [-1, +1]
    rWeight = Math.sign(x) * Math.pow(Math.abs(x), 1.35) * 1.5;
  }

  let completionMul = 1.0;
  if (e.mediaType === 'tv' && e.totalEpisodes && e.totalEpisodes > 0 && e.episodesWatched != null) {
    const ratio = Math.min(1, e.episodesWatched / e.totalEpisodes);
    if (ratio < 0.2 && (e.rating == null || e.rating <= 5)) {
      return -0.6; // série abandonnée tôt
    }
    completionMul = 0.5 + 0.5 * ratio;
  }
  return rWeight * completionMul;
}

export function decay(watchedAtIso: string, halfLifeDays: number, nowMs = Date.now()): number {
  const t = new Date(watchedAtIso).getTime();
  if (isNaN(t)) return 0.5;
  const days = Math.max(0, (nowMs - t) / 86_400_000);
  return Math.exp((-Math.LN2 * days) / halfLifeDays);
}

// ---------------- Construction du profil utilisateur ----------------

export function computeTaste(
  events: WatchedEvent[],
  featuresById: Map<string, MediaFeatures>,
  nowMs = Date.now(),
  idf?: Map<string, number>
): TasteProfile {
  const long: SparseVec = {};
  const short: SparseVec = {};
  const neg: SparseVec = {};
  const recentGenres = new Map<number, number>();

  let rSum = 0;
  let rCnt = 0;

  // Trier du plus récent au plus ancien pour identifier les 10 derniers visionnages
  const sorted = [...events].sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || ''));

  sorted.forEach((ev, idx) => {
    const feat = featuresById.get(ev.key);
    if (!feat) return;
    const fv = toVector(feat, idf);
    const w = eventWeight(ev);

    if (ev.rating != null) {
      rSum += ev.rating;
      rCnt++;
    }

    if (w < 0) {
      addScaled(neg, fv, Math.abs(w) * decay(ev.watchedAt, 180, nowMs));
    } else {
      addScaled(long, fv, w * decay(ev.watchedAt, 180, nowMs));
      addScaled(short, fv, w * decay(ev.watchedAt, 14, nowMs));
    }

    if (idx < 10 && w >= 0) {
      for (const g of feat.genres) {
        recentGenres.set(g.id, (recentGenres.get(g.id) || 0) + 1);
      }
    }
  });

  return {
    long,
    short,
    neg,
    meanRating: rCnt > 0 ? rSum / rCnt : 7.0,
    recentGenres,
  };
}

// ---------------- Note bayésienne & fraîcheur ----------------

export function bayesRating(R: number, v: number, C = 6.8, m = 250): number {
  return (v / (v + m)) * R + (m / (v + m)) * C;
}

export function freshnessScore(releaseYear?: number, currentYear = new Date().getFullYear()): number {
  if (!releaseYear) return 0.3;
  const age = Math.max(0, currentYear - releaseYear);
  return Math.exp(-age / 6); // demi-vie ~4 ans
}

// ---------------- Scoring hybride d'un candidat ----------------

export interface Candidate {
  features: MediaFeatures;
  collabVoteSum: number; // somme des poids des seeds ayant proposé ce candidat
  collabSeeds: { title: string; rating: number | null; rank: number }[];
}

export interface ScoredCandidate extends Candidate {
  score: number;
  vec: SparseVec;
  breakdown: {
    sLong: number;
    sShort: number;
    sCollab: number;
    sQual: number;
    sFresh: number;
    sNeg: number;
    fatigue: number;
  };
}

export function scoreCandidate(
  c: Candidate,
  taste: TasteProfile,
  weights: RecoWeights = DEFAULT_RECO_WEIGHTS,
  idf?: Map<string, number>
): ScoredCandidate {
  const vec = toVector(c.features, idf);
  const sLong = Math.max(0, cosine(taste.long, vec));
  const sShort = Math.max(0, cosine(taste.short, vec));
  const sNeg = Math.max(0, cosine(taste.neg, vec));
  const sCollab = Math.min(1, c.collabVoteSum / 2.2);
  const sQual = bayesRating(c.features.voteAverage, c.features.voteCount) / 10;
  const sFresh = freshnessScore(c.features.releaseYear);

  // Pénalité de saturation si un genre domine les 10 derniers visionnages
  let fatigue = 0;
  for (const g of c.features.genres) {
    const cnt = taste.recentGenres.get(g.id) || 0;
    if (cnt > 5) fatigue += 0.03 * (cnt - 5);
  }

  const score =
    weights.wLong * sLong +
    weights.wShort * sShort +
    weights.wCollab * sCollab +
    weights.wQual * sQual +
    weights.wFresh * sFresh -
    weights.wNeg * sNeg -
    fatigue;

  return {
    ...c,
    score,
    vec,
    breakdown: { sLong, sShort, sCollab, sQual, sFresh, sNeg, fatigue },
  };
}

// ---------------- Diversification MMR + plafonds ----------------

export function selectMMR(
  pool: ScoredCandidate[],
  k: number,
  lambda = 0.72,
  caps = { perGenre: 4, perDirector: 2, perDecade: 5 },
  globalSeen = new Set<string>()
): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const genreCnt = new Map<number, number>();
  const dirCnt = new Map<number, number>();
  const decCnt = new Map<string, number>();

  const remaining = pool.filter((c) => !globalSeen.has(c.features.key));

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = -1;
    let bestVal = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const f = cand.features;

      // Vérifier les plafonds durs (uniquement si on a assez de candidats alternatifs)
      const primaryGenre = f.genres[0]?.id;
      if (primaryGenre !== undefined && (genreCnt.get(primaryGenre) || 0) >= caps.perGenre) continue;
      const primaryDir = f.directors[0]?.id;
      if (primaryDir !== undefined && (dirCnt.get(primaryDir) || 0) >= caps.perDirector) continue;
      const dec = decadeBucket(f.releaseYear);
      if (dec && (decCnt.get(dec) || 0) >= caps.perDecade) continue;

      let maxSim = 0;
      for (const s of selected) {
        const sim = cosine(cand.vec, s.vec);
        if (sim > maxSim) maxSim = sim;
      }

      const mmr = lambda * cand.score - (1 - lambda) * maxSim;
      if (mmr > bestVal) {
        bestVal = mmr;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    const [picked] = remaining.splice(bestIdx, 1);
    selected.push(picked);
    globalSeen.add(picked.features.key);

    const g0 = picked.features.genres[0]?.id;
    if (g0 !== undefined) genreCnt.set(g0, (genreCnt.get(g0) || 0) + 1);
    const d0 = picked.features.directors[0]?.id;
    if (d0 !== undefined) dirCnt.set(d0, (dirCnt.get(d0) || 0) + 1);
    const dec = decadeBucket(picked.features.releaseYear);
    if (dec) decCnt.set(dec, (decCnt.get(dec) || 0) + 1);
  }

  return selected;
}

// ---------------- Générateur d'explications en français ----------------

export function explain(
  c: ScoredCandidate,
  taste: TasteProfile,
  userHistory: WatchedEvent[]
): string[] {
  const reasons: { text: string; weight: number }[] = [];

  // 1. Seed collaboratif direct
  if (c.collabSeeds.length > 0) {
    const best = [...c.collabSeeds].sort((a, b) => (b.rating || 7) - (a.rating || 7))[0];
    const rTxt = best.rating ? ` (noté ${best.rating}/10)` : '';
    reasons.push({
      text: `Parce que vous avez aimé « ${best.title} »${rTxt}`,
      weight: 1.0,
    });
  }

  // 2. Réalisateur / créateur déjà apprécié
  for (const d of c.features.directors) {
    const dim = `d:${d.id}`;
    if ((taste.long[dim] || 0) > 0.8) {
      reasons.push({ text: `Réalisé par ${d.name}`, weight: 0.9 });
      break;
    }
  }

  // 3. Acteur récurrent dans les coups de cœur
  const matchedActors: string[] = [];
  for (const a of c.features.cast.slice(0, 4)) {
    if ((taste.long[`a:${a.id}`] || 0) > 0.7) matchedActors.push(a.name);
  }
  if (matchedActors.length > 0) {
    reasons.push({
      text: `Avec ${matchedActors.slice(0, 2).join(' & ')}`,
      weight: 0.75,
    });
  }

  // 4. Mots-clés thématiques partagés
  const matchedKw = c.features.keywords
    .filter((k) => (taste.long[`k:${k.id}`] || 0) > 0.6)
    .map((k) => k.name);
  if (matchedKw.length >= 2) {
    reasons.push({
      text: `Thèmes proches : ${matchedKw.slice(0, 2).join(', ')}`,
      weight: 0.7,
    });
  }

  // 5. Genre dominant
  const bestGenre = c.features.genres
    .map((g) => ({ name: g.name, w: taste.long[`g:${g.id}`] || 0 }))
    .sort((a, b) => b.w - a.w)[0];
  if (bestGenre && bestGenre.w > 0.5) {
    reasons.push({ text: `Genre favori : ${bestGenre.name}`, weight: 0.55 });
  }

  // 6. Pépite critique
  if (c.features.voteAverage >= 7.8 && c.features.popularity < 35) {
    reasons.push({
      text: `Pépite méconnue (${c.features.voteAverage.toFixed(1)}/10)`,
      weight: 0.5,
    });
  }

  const out = reasons
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((r) => r.text);

  if (out.length === 0) {
    const gName = c.features.genres[0]?.name;
    out.push(
      gName
        ? `Sélection ${gName} adaptée à votre profil`
        : 'Sélectionné pour votre profil'
    );
  }

  return out;
}

// ---------------- Bandit contextuel LinUCB léger (d = 6) ----------------

export class LinUCB {
  private d = 6;
  private A: number[][];
  private b: number[];
  private alpha: number;

  constructor(alpha = 0.35, state?: { A: number[][]; b: number[] }) {
    this.alpha = alpha;
    if (state && Array.isArray(state.A) && Array.isArray(state.b)) {
      this.A = state.A;
      this.b = state.b;
    } else {
      this.A = Array.from({ length: this.d }, (_, i) =>
        Array.from({ length: this.d }, (__, j) => (i === j ? 1 : 0))
      );
      // Initialisation alignée sur les poids par défaut [wLong, wShort, wCollab, wQual, wFresh, -wNeg]
      this.b = [0.38, 0.22, 0.20, 0.12, 0.08, -0.45];
    }
  }

  /** Résolution par élimination de Gauss (d=6) */
  private solve(M: number[][], y: number[]): number[] {
    const n = this.d;
    const aug = M.map((row, i) => [...row, y[i]]);
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
      }
      [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
      const pivot = aug[i][i] || 1e-9;
      for (let j = i; j <= n; j++) aug[i][j] /= pivot;
      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const factor = aug[k][i];
        for (let j = i; j <= n; j++) aug[k][j] -= factor * aug[i][j];
      }
    }
    return aug.map((row) => row[n]);
  }

  public theta(): number[] {
    return this.solve(this.A, this.b);
  }

  public getWeights(): RecoWeights {
    const t = this.theta();
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
    return {
      wLong: clamp(t[0], 0.15, 0.65),
      wShort: clamp(t[1], 0.05, 0.50),
      wCollab: clamp(t[2], 0.05, 0.45),
      wQual: clamp(t[3], 0.05, 0.35),
      wFresh: clamp(t[4], 0.02, 0.25),
      wNeg: clamp(Math.abs(t[5]), 0.20, 0.80),
    };
  }

  public update(x: number[], reward: number): void {
    for (let i = 0; i < this.d; i++) {
      this.b[i] += reward * x[i];
      for (let j = 0; j < this.d; j++) {
        this.A[i][j] += x[i] * x[j];
      }
    }
  }

  public toJSON() {
    return { A: this.A, b: this.b };
  }
}
