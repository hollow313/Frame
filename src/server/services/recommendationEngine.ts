import {
  RecoFeedService,
  RecommendationResponse,
  RecommendationSection,
  EnrichedRecoMediaItem,
} from './reco/feedService.js';

export type { RecommendationResponse, RecommendationSection };
export type HeroProposalItem = EnrichedRecoMediaItem;

export class RecommendationEngine {
  /**
   * Générer des recommandations personnalisées et intelligentes via le moteur hybride v2
   */
  public static async getPersonalizedRecommendations(userId: number): Promise<RecommendationResponse> {
    return RecoFeedService.getPersonalizedFeed(userId);
  }
}
