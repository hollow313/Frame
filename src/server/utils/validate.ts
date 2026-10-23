export const VALID_MEDIA_TYPES = new Set(['movie', 'tv', 'manga']);

export function validateMediaType(type: unknown): type is 'movie' | 'tv' | 'manga' {
  return typeof type === 'string' && VALID_MEDIA_TYPES.has(type);
}

export function validateTmdbId(id: unknown): number | null {
  const num = typeof id === 'number' ? id : parseInt(String(id), 10);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

export function validateRating(rating: unknown): { valid: boolean; value: number | null; error?: string } {
  if (rating === undefined || rating === null || rating === '') {
    return { valid: true, value: null };
  }
  const num = typeof rating === 'number' ? rating : Number(rating);
  if (!Number.isFinite(num) || num < 1 || num > 10) {
    return { valid: false, value: null, error: 'La note doit être comprise entre 1 et 10.' };
  }
  return { valid: true, value: Math.round(num * 10) / 10 };
}

export function validateTitle(title: unknown): { valid: boolean; value: string; error?: string } {
  if (typeof title !== 'string' || !title.trim()) {
    return { valid: false, value: '', error: 'Le titre est requis.' };
  }
  const trimmed = title.trim();
  if (trimmed.length > 300) {
    return { valid: false, value: trimmed.slice(0, 300), error: 'Le titre ne peut pas dépasser 300 caractères.' };
  }
  return { valid: true, value: trimmed };
}

export function validateReview(review: unknown): { valid: boolean; value: string | null; error?: string } {
  if (review === undefined || review === null || review === '') {
    return { valid: true, value: null };
  }
  if (typeof review !== 'string') {
    return { valid: false, value: null, error: 'Avis invalide.' };
  }
  if (review.length > 5000) {
    return { valid: false, value: null, error: "L'avis ne peut pas dépasser 5000 caractères." };
  }
  return { valid: true, value: review.trim() || null };
}

export function normalizeIsoDate(input?: string | null): string {
  if (!input || typeof input !== 'string' || !input.trim()) {
    return new Date().toISOString();
  }
  const raw = input.trim();
  // Format SQLite historique 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DDTHH:MM:SSZ'
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw.replace(' ', 'T') + 'Z');
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  // Format date simple 'YYYY-MM-DD'
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T12:00:00.000Z`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    return new Date().toISOString();
  }
  return d.toISOString();
}

const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

export function containsCjk(text?: string | null): boolean {
  if (!text) return false;
  return CJK_REGEX.test(text);
}
