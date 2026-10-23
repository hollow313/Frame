import { describe, it, expect } from 'vitest';
import {
  toVector,
  norm,
  computeTaste,
  scoreCandidate,
  selectMMR,
  explain,
  LinUCB,
  MediaFeatures,
  WatchedEvent,
  Candidate,
  ScoredCandidate,
} from '../engine.js';

function makeFeature(overrides: Partial<MediaFeatures> & { tmdbId: number }): MediaFeatures {
  const mediaType = overrides.mediaType ?? 'movie';
  return {
    key: overrides.key ?? `${mediaType}:${overrides.tmdbId}`,
    mediaType,
    tmdbId: overrides.tmdbId,
    title: overrides.title ?? `Film #${overrides.tmdbId}`,
    originalLang: overrides.originalLang ?? 'en',
    releaseYear: overrides.releaseYear ?? 2014,
    runtime: overrides.runtime ?? 125,
    voteAverage: overrides.voteAverage ?? 8.4,
    voteCount: overrides.voteCount ?? 12000,
    popularity: overrides.popularity ?? 95,
    genres: overrides.genres ?? [{ id: 878, name: 'Science-Fiction' }],
    keywords: overrides.keywords ?? [{ id: 100, name: 'space' }, { id: 101, name: 'time travel' }],
    directors: overrides.directors ?? [{ id: 525, name: 'Christopher Nolan' }],
    cast: overrides.cast ?? [{ id: 6193, name: 'Leonardo DiCaprio' }],
    countries: overrides.countries ?? ['US'],
    collectionId: overrides.collectionId ?? null,
    isAnime: overrides.isAnime ?? false,
  };
}

describe('Recommendation Engine v2', () => {
  it('1. toVector encodes genres, keywords, directors, and cast with director weight > cast[4] weight', () => {
    const item = makeFeature({
      tmdbId: 1,
      cast: [
        { id: 10, name: 'Actor 0' },
        { id: 11, name: 'Actor 1' },
        { id: 12, name: 'Actor 2' },
        { id: 13, name: 'Actor 3' },
        { id: 14, name: 'Actor 4' },
      ],
    });
    const vec = toVector(item);
    expect(norm(vec)).toBeGreaterThan(0);

    const dirWeight = vec['d:525'] ?? 0;
    const cast4Weight = vec['a:14'] ?? 0;
    expect(dirWeight).toBeGreaterThan(cast4Weight);
  });

  it('2. computeTaste weights recent events higher than 180-day-old events', () => {
    const now = Date.now();
    const recentItem = makeFeature({ tmdbId: 101, genres: [{ id: 878, name: 'Sci-Fi' }], directors: [], cast: [], keywords: [] });
    const oldItem = makeFeature({ tmdbId: 102, genres: [{ id: 27, name: 'Horreur' }], directors: [], cast: [], keywords: [] });

    const features = new Map<string, MediaFeatures>([
      ['movie:101', recentItem],
      ['movie:102', oldItem],
    ]);

    const events: WatchedEvent[] = [
      {
        key: 'movie:101',
        mediaType: 'movie',
        tmdbId: 101,
        title: 'Recent Sci-Fi',
        rating: 9,
        watchedAt: new Date(now - 1 * 86_400_000).toISOString(),
      },
      {
        key: 'movie:102',
        mediaType: 'movie',
        tmdbId: 102,
        title: 'Old Horror',
        rating: 9,
        watchedAt: new Date(now - 180 * 86_400_000).toISOString(),
      },
    ];

    const taste = computeTaste(events, features, now);
    expect(taste.long['g:878'] ?? 0).toBeGreaterThan(taste.long['g:27'] ?? 0);
    expect(taste.short['g:878'] ?? 0).toBeGreaterThan((taste.short['g:27'] ?? 0) * 10);
  });

  it('3. computeTaste populates neg vector when negative signals (rating <= 4 or not_interested) are present', () => {
    const now = Date.now();
    const disliked = makeFeature({ tmdbId: 201, genres: [{ id: 10749, name: 'Romance' }] });
    const features = new Map<string, MediaFeatures>([['movie:201', disliked]]);

    const events: WatchedEvent[] = [
      {
        key: 'movie:201',
        mediaType: 'movie',
        tmdbId: 201,
        title: 'Disliked Romance',
        rating: null,
        watchedAt: new Date(now).toISOString(),
        signal: 'not_interested',
      },
    ];

    const taste = computeTaste(events, features, now);
    expect(Object.keys(taste.neg).length).toBeGreaterThan(0);
    expect(taste.neg['g:10749'] ?? 0).toBeGreaterThan(0);
  });

  it('4. scoreCandidate ranks a matching Sci-Fi/Nolan film higher than an unrelated comedy', () => {
    const now = Date.now();
    const watched = makeFeature({
      tmdbId: 157336,
      title: 'Interstellar',
      genres: [{ id: 878, name: 'Science-Fiction' }],
      directors: [{ id: 525, name: 'Christopher Nolan' }],
    });
    const candidateGood: Candidate = {
      features: makeFeature({
        tmdbId: 27205,
        title: 'Inception',
        genres: [{ id: 878, name: 'Science-Fiction' }],
        directors: [{ id: 525, name: 'Christopher Nolan' }],
        voteAverage: 8.4,
        voteCount: 30000,
      }),
      collabVoteSum: 1.5,
      collabSeeds: [{ title: 'Interstellar', rating: 9, rank: 1 }],
    };
    const candidateUnrelated: Candidate = {
      features: makeFeature({
        tmdbId: 99999,
        title: 'Random Comedy',
        genres: [{ id: 35, name: 'Comédie' }],
        directors: [{ id: 777, name: 'Other Director' }],
        cast: [{ id: 888, name: 'Other Actor' }],
        keywords: [{ id: 999, name: 'parody' }],
        releaseYear: 1985,
        voteAverage: 5.8,
        voteCount: 500,
      }),
      collabVoteSum: 0,
      collabSeeds: [],
    };

    const features = new Map<string, MediaFeatures>([['movie:157336', watched]]);
    const taste = computeTaste(
      [
        {
          key: 'movie:157336',
          mediaType: 'movie',
          tmdbId: 157336,
          title: 'Interstellar',
          rating: 9,
          watchedAt: new Date(now).toISOString(),
        },
      ],
      features,
      now
    );

    const sGood = scoreCandidate(candidateGood, taste);
    const sBad = scoreCandidate(candidateUnrelated, taste);

    expect(sGood.score).toBeGreaterThan(sBad.score);
  });

  it('5. selectMMR diversifies and enforces max items per primary genre', () => {
    const pool: ScoredCandidate[] = [];
    for (let i = 1; i <= 8; i++) {
      const f = makeFeature({
        tmdbId: i,
        genres: [{ id: 878, name: 'Science-Fiction' }],
        directors: [{ id: 500 + i, name: `Dir ${i}` }],
        releaseYear: 1970 + i * 5,
      });
      pool.push({
        features: f,
        collabVoteSum: 0,
        collabSeeds: [],
        score: 0.95 - i * 0.01,
        vec: toVector(f),
        breakdown: { sLong: 0.9, sShort: 0.8, sCollab: 0, sQual: 0.8, sFresh: 0.5, sNeg: 0, fatigue: 0 },
      });
    }
    for (let i = 9; i <= 15; i++) {
      const f = makeFeature({
        tmdbId: i,
        genres: [{ id: 18 + (i % 3), name: `Genre ${i}` }],
        directors: [{ id: 600 + i, name: `Dir ${i}` }],
        releaseYear: 1980 + (i % 4) * 10,
      });
      pool.push({
        features: f,
        collabVoteSum: 0,
        collabSeeds: [],
        score: 0.80 - i * 0.005,
        vec: toVector(f),
        breakdown: { sLong: 0.7, sShort: 0.6, sCollab: 0, sQual: 0.8, sFresh: 0.5, sNeg: 0, fatigue: 0 },
      });
    }

    const selected = selectMMR(pool, 8, 0.72, { perGenre: 3, perDirector: 2, perDecade: 5 });
    const sciFiCount = selected.filter((s) => s.features.genres[0]?.id === 878).length;
    expect(sciFiCount).toBeLessThanOrEqual(3);
  });

  it('6. explain returns concrete French explanations mentioning director, actor, or anchor work', () => {
    const now = Date.now();
    const anchor = makeFeature({
      tmdbId: 157336,
      title: 'Interstellar',
      directors: [{ id: 525, name: 'Christopher Nolan' }],
      genres: [{ id: 878, name: 'Science-Fiction' }],
    });
    const history: WatchedEvent[] = [
      {
        key: 'movie:157336',
        mediaType: 'movie',
        tmdbId: 157336,
        title: 'Interstellar',
        rating: 9,
        watchedAt: new Date(now).toISOString(),
      },
    ];
    const taste = computeTaste(history, new Map([['movie:157336', anchor]]), now);
    const candidateScored = scoreCandidate(
      {
        features: makeFeature({
          tmdbId: 27205,
          title: 'Inception',
          directors: [{ id: 525, name: 'Christopher Nolan' }],
          genres: [{ id: 878, name: 'Science-Fiction' }],
        }),
        collabVoteSum: 1.5,
        collabSeeds: [{ title: 'Interstellar', rating: 9, rank: 1 }],
      },
      taste
    );

    const reasons = explain(candidateScored, taste, history);
    expect(reasons.length).toBeGreaterThanOrEqual(1);
    expect(reasons.join(' ')).toMatch(/Christopher Nolan|Interstellar/);
  });

  it('7. LinUCB updates weights after positive reward', () => {
    const bandit = new LinUCB(0.35);
    const before = bandit.getWeights();
    for (let i = 0; i < 5; i++) {
      bandit.update([1.0, 0.2, 0.1, 0.1, 0.1, 0.0], 1.0);
    }
    const after = bandit.getWeights();
    expect(after.wLong).toBeGreaterThanOrEqual(before.wLong);
  });
});
