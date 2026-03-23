import type { NeighborhoodProfile } from '../types';

/** Default transit data used when transit score is not available */
export const DEFAULT_TRANSIT: NeighborhoodProfile['transit'] = {
  nearbyStopCount: 0,
  nearestStopDistance: 0,
  stopCount: 0,
  agencyCount: 0,
  agencies: [],
  transitScore: 0,
  cityAverage: 0,
  travelTimeToCityHall: null,
};
