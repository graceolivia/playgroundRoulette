// Database abstraction layer using Dexie.js
import Dexie from './node_modules/dexie/dist/dexie.mjs';

class PlaygroundDB extends Dexie {
  constructor() {
    super('PlaygroundDatabase');
    
    // Define schema - Version 1 (original)
    this.version(1).stores({
      playgrounds: '++id, Prop_ID, Playground_ID, Name, Location, Accessible, lat, lon',
      settings: 'key, value',
      favorites: '++id, playground_id, added_date',
      reviews: '++id, playground_prop_id, title, content, rating, author, date, featured, approved'
    });

    // Version 2 - Add extended playground information fields
    this.version(2).stores({
      playgrounds: '++id, Prop_ID, Playground_ID, Name, Location, Accessible, lat, lon, age_range_min, age_range_max, novelty_has, shade, fenced, star, surface, water_play, bathroom, drinking_fountain, seating, crowd_level, accessibility_ada_paths, accessibility_adaptive_swings, stroller_friendly, transit_nearest_stop, transit_walk_minutes, safety_line_of_sight, maintenance, last_verified, schema_version',
      settings: 'key, value',
      favorites: '++id, playground_id, added_date',
      reviews: '++id, playground_prop_id, title, content, rating, author, date, featured, approved'
    }).upgrade(trans => {
      // Migrate existing playgrounds to include new fields
      return trans.table('playgrounds').toCollection().modify(playground => {
        if (!playground.schema_version || playground.schema_version < 2) {
          // Add default values for new fields
          playground.age_range_min = null;
          playground.age_range_max = null;
          playground.novelty_has = null;
          playground.novelty_notes = null;
          playground.shade = 'unknown';
          playground.fenced = 'unknown';
          playground.star = null;
          playground.surface = 'unknown';
          playground.water_play = 'unknown';
          playground.bathroom = 'unknown';
          playground.drinking_fountain = 'unknown';
          playground.seating = 'unknown';
          playground.crowd_level = 'unknown';
          playground.accessibility_ada_paths = null;
          playground.accessibility_adaptive_swings = null;
          playground.accessibility_notes = null;
          playground.stroller_friendly = 'unknown';
          playground.transit_nearest_stop = null;
          playground.transit_walk_minutes = null;
          playground.safety_line_of_sight = 'unknown';
          playground.maintenance = 'unknown';
          playground.last_verified = null;
          playground.sources = [];
          playground.editor_notes = null;
          playground.schema_version = 2;
        }
      });
    });
  }
}

// Create database instance
const db = new PlaygroundDB();

// Database operations
class PlaygroundDatabase {
  constructor() {
    this.db = db;
  }

  // Initialize database with JSON data
  async initialize(jsonData) {
    try {
      const count = await this.db.playgrounds.count();
      if (count === 0) {
        console.log('Importing playground data to database...');
        await this.db.playgrounds.bulkAdd(jsonData);
        console.log(`Imported ${jsonData.length} playgrounds to database`);
      } else {
        // Check if we need to reload data (missing sprinkler data or outdated data)
        const sample = await this.db.playgrounds.limit(1).toArray();
        const totalCount = await this.db.playgrounds.count();
        const sprinklerCount = await this.db.playgrounds.filter(p => p.has_sprinkler === true).count();
        
        // Reload if missing sprinkler data OR if sprinkler count doesn't match expected (~691)
        const shouldReload = (sample.length > 0 && sample[0].has_sprinkler === undefined) || 
                           (sprinklerCount > 700); // Old data had ~718, new has ~691
        
        if (shouldReload) {
          console.log(`Database needs update: ${sprinklerCount} sprinkler playgrounds found, reloading with corrected data...`);
          await this.db.playgrounds.clear();
          await this.db.playgrounds.bulkAdd(jsonData);
          console.log(`Reloaded ${jsonData.length} playgrounds with corrected sprinkler data`);
        }
      }
    } catch (error) {
      console.error('Database initialization error:', error);
      // If there's a schema error, try to delete and recreate the database
      if (error.name === 'DatabaseClosedError' || error.message.includes('keyPath')) {
        console.log('Attempting to reset database due to schema error...');
        await this.resetDatabase();
        // Try again after reset
        await this.db.playgrounds.bulkAdd(jsonData);
        console.log(`Imported ${jsonData.length} playgrounds to database after reset`);
      } else {
        throw error;
      }
    }
  }

  // Reset database (for fixing schema issues)
  async resetDatabase() {
    try {
      await this.db.delete();
      await this.db.open();
      console.log('Database reset successfully');
    } catch (error) {
      console.error('Error resetting database:', error);
    }
  }

  // Get all playgrounds
  async getAllPlaygrounds() {
    return await this.db.playgrounds.toArray();
  }

  // Filter playgrounds with database queries
  async filterPlaygrounds(filters = {}) {
    let query = this.db.playgrounds;

    if (filters.borough && filters.borough !== 'All') {
      query = query.filter(p => {
        const propId = p.Prop_ID || '';
        const boroughMap = {B:'Brooklyn', M:'Manhattan', Q:'Queens', X:'Bronx', R:'Staten Island'};
        const borough = boroughMap[propId[0]] || 'Unknown';
        return borough === filters.borough;
      });
    }

    if (filters.accessible && filters.accessible !== 'Any') {
      query = query.filter(p => {
        const access = this.normalizeAccessible(p.Accessible);
        return access === filters.accessible;
      });
    }

    if (filters.sensory && filters.sensory !== 'Any') {
      query = query.filter(p => {
        const sensory = (p['Sensory-Friendly'] || '').toUpperCase();
        return sensory === filters.sensory;
      });
    }

    if (filters.bathroom) {
      query = query.filter(p => {
        const bathroom = (p['ADA_Accessible_Comfort_Station'] || '').trim();
        let bathroomMatch = false;
        
        if (filters.bathroom.any && (bathroom === 'Not Accessible' || bathroom === 'Accessible')) {
          bathroomMatch = true; // Has any bathroom (accessible or not)
        }
        if (filters.bathroom.accessible && bathroom === 'Accessible') {
          bathroomMatch = true; // Has accessible bathroom
        }
        
        return bathroomMatch;
      });
    }

    if (filters.sprinkler) {
      console.log('Database filtering: applying sprinkler filter');
      query = query.filter(p => {
        const hasSprinkler = p.has_sprinkler === true;
        return hasSprinkler;
      });
    }

    return await query.toArray();
  }

  // Add a new playground
  async addPlayground(playground) {
    const defaults = this.getDefaultPlaygroundInfo();
    const playgroundWithDefaults = {
      ...defaults,
      ...playground,
      schema_version: 2
    };
    return await this.db.playgrounds.add(playgroundWithDefaults);
  }

  // Update existing playground
  async updatePlayground(id, updates) {
    return await this.db.playgrounds.update(id, updates);
  }

  // Delete playground
  async deletePlayground(id) {
    return await this.db.playgrounds.delete(id);
  }

  // Search playgrounds by name or location
  async searchPlaygrounds(searchTerm) {
    const term = searchTerm.toLowerCase();
    return await this.db.playgrounds
      .filter(p => 
        (p.Name || '').toLowerCase().includes(term) ||
        (p.Location || '').toLowerCase().includes(term)
      )
      .toArray();
  }

  // Get playground by ID
  async getPlaygroundById(id) {
    return await this.db.playgrounds.get(id);
  }

  // Get playground by Prop_ID
  async getPlaygroundByPropId(propId) {
    return await this.db.playgrounds.where('Prop_ID').equals(propId).first();
  }

  // Favorites management
  async addToFavorites(playgroundId) {
    return await this.db.favorites.add({
      playground_id: playgroundId,
      added_date: new Date()
    });
  }

  async removeFromFavorites(playgroundId) {
    return await this.db.favorites.where('playground_id').equals(playgroundId).delete();
  }

  async getFavorites() {
    const favorites = await this.db.favorites.toArray();
    const playgroundIds = favorites.map(f => f.playground_id);
    return await this.db.playgrounds.where('id').anyOf(playgroundIds).toArray();
  }

  async isFavorite(playgroundId) {
    const count = await this.db.favorites.where('playground_id').equals(playgroundId).count();
    return count > 0;
  }

  // Settings management
  async setSetting(key, value) {
    return await this.db.settings.put({ key, value });
  }

  async getSetting(key, defaultValue = null) {
    const setting = await this.db.settings.get(key);
    return setting ? setting.value : defaultValue;
  }

  // Statistics
  async getStats() {
    const total = await this.db.playgrounds.count();
    const accessible = await this.db.playgrounds.where('Accessible').equals('Yes').count();
    const sensoryFriendly = await this.db.playgrounds.where('Sensory-Friendly').equals('Y').count();
    
    return {
      total,
      accessible,
      sensoryFriendly,
      accessiblePercent: total > 0 ? Math.round((accessible / total) * 100) : 0,
      sensoryPercent: total > 0 ? Math.round((sensoryFriendly / total) * 100) : 0
    };
  }

  // Helper methods
  normalizeAccessible(value) {
    const val = String(value || '').toLowerCase();
    if (val.includes('yes') || val.includes('accessible')) return 'Yes';
    if (val.includes('no') || val.includes('not')) return 'No';
    if (val.includes('limited')) return 'Limited';
    return value || 'Unknown';
  }

  // Clear all data (for testing)
  async clearAll() {
    await this.db.playgrounds.clear();
    await this.db.favorites.clear();
    await this.db.settings.clear();
  }

  // Export data to JSON
  async exportToJSON() {
    const playgrounds = await this.getAllPlaygrounds();
    return JSON.stringify(playgrounds, null, 2);
  }

  // Import data from JSON
  async importFromJSON(jsonData) {
    await this.clearAll();
    await this.initialize(jsonData);
  }

  // Review management methods
  async addReview(reviewData) {
    const review = {
      playground_prop_id: reviewData.playground_prop_id,
      title: reviewData.title,
      content: reviewData.content,
      rating: reviewData.rating,
      author: reviewData.author || 'Anonymous',
      date: reviewData.date || new Date().toISOString(),
      featured: reviewData.featured || false,
      approved: reviewData.approved !== undefined ? reviewData.approved : true,
      photos: reviewData.photos || []
    };
    return await this.db.reviews.add(review);
  }

  async updateReview(reviewId, updates) {
    return await this.db.reviews.update(reviewId, updates);
  }

  async deleteReview(reviewId) {
    return await this.db.reviews.delete(reviewId);
  }

  async getReviewsForPlayground(propId) {
    return await this.db.reviews
      .where('playground_prop_id')
      .equals(propId)
      .and(review => review.approved !== false)
      .reverse()
      .sortBy('date');
  }

  async getAllReviews() {
    return await this.db.reviews.orderBy('date').reverse().toArray();
  }

  async getFeaturedReviews() {
    return await this.db.reviews
      .where('featured')
      .equals(true)
      .and(review => review.approved !== false)
      .reverse()
      .sortBy('date');
  }

  async getReviewStats() {
    const total = await this.db.reviews.count();
    const approved = await this.db.reviews.where('approved').equals(true).count();
    const featured = await this.db.reviews.where('featured').equals(true).count();
    const avgRating = await this.db.reviews.where('approved').equals(true).toArray()
      .then(reviews => {
        if (reviews.length === 0) return 0;
        const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
        return Math.round((sum / reviews.length) * 10) / 10;
      });

    return {
      total,
      approved,
      featured,
      avgRating,
      pending: total - approved
    };
  }

  // Search reviews
  async searchReviews(searchTerm) {
    const term = searchTerm.toLowerCase();
    return await this.db.reviews
      .filter(review => 
        (review.title || '').toLowerCase().includes(term) ||
        (review.content || '').toLowerCase().includes(term) ||
        (review.author || '').toLowerCase().includes(term)
      )
      .and(review => review.approved !== false)
      .reverse()
      .sortBy('date');
  }

  // Playground management methods
  async addPlayground(playgroundData) {
    const defaults = this.getDefaultPlaygroundInfo();
    const playground = {
      ...defaults,
      Prop_ID: playgroundData.Prop_ID,
      Playground_ID: playgroundData.Playground_ID || playgroundData.Prop_ID,
      Name: playgroundData.Name,
      Location: playgroundData.Location,
      Accessible: playgroundData.Accessible || 'Unknown',
      lat: parseFloat(playgroundData.lat),
      lon: parseFloat(playgroundData.lon),
      'Sensory-Friendly': playgroundData['Sensory-Friendly'] || 'N',
      ADA_Accessible_Comfort_Station: playgroundData.ADA_Accessible_Comfort_Station || 'Unknown',
      slug: playgroundData.slug || null,
      added_date: new Date().toISOString(),
      added_by: 'admin',
      schema_version: 2
    };
    return await this.db.playgrounds.add(playground);
  }

  async updatePlayground(playgroundId, updates) {
    updates.modified_date = new Date().toISOString();
    updates.modified_by = 'admin';
    return await this.db.playgrounds.update(playgroundId, updates);
  }

  async deletePlayground(playgroundId) {
    // Also delete associated reviews
    await this.db.reviews.where('playground_prop_id').equals(playgroundId).delete();
    return await this.db.playgrounds.delete(playgroundId);
  }

  async getPlaygroundByPropId(propId) {
    return await this.db.playgrounds.where('Prop_ID').equals(propId).first();
  }

  async searchPlaygroundsAdmin(searchTerm) {
    const term = searchTerm.toLowerCase();
    return await this.db.playgrounds
      .filter(playground => 
        (playground.Name || '').toLowerCase().includes(term) ||
        (playground.Location || '').toLowerCase().includes(term) ||
        (playground.Prop_ID || '').toLowerCase().includes(term)
      )
      .toArray();
  }

  async validatePlayground(playgroundData) {
    const errors = [];
    
    if (!playgroundData.Prop_ID || playgroundData.Prop_ID.trim() === '') {
      errors.push('Property ID is required');
    }
    
    if (!playgroundData.Name || playgroundData.Name.trim() === '') {
      errors.push('Playground name is required');
    }
    
    if (!playgroundData.lat || !playgroundData.lon) {
      errors.push('Latitude and longitude are required');
    } else {
      const lat = parseFloat(playgroundData.lat);
      const lon = parseFloat(playgroundData.lon);
      
      if (isNaN(lat) || lat < -90 || lat > 90) {
        errors.push('Invalid latitude (must be between -90 and 90)');
      }
      
      if (isNaN(lon) || lon < -180 || lon > 180) {
        errors.push('Invalid longitude (must be between -180 and 180)');
      }
      
      // Check if coordinates are roughly in NYC area
      if (lat < 40.4 || lat > 40.9 || lon < -74.3 || lon > -73.7) {
        errors.push('Coordinates should be in NYC area (lat: 40.4-40.9, lon: -74.3 to -73.7)');
      }
    }
    
    // Check for duplicate Prop_ID
    const existing = await this.getPlaygroundByPropId(playgroundData.Prop_ID);
    if (existing) {
      errors.push('A playground with this Property ID already exists');
    }
    
    return errors;
  }

  async getPlaygroundStats() {
    const total = await this.db.playgrounds.count();
    const accessible = await this.db.playgrounds.where('Accessible').equals('Yes').count();
    const sensoryFriendly = await this.db.playgrounds.where('Sensory-Friendly').equals('Y').count();
    const withReviews = await this.db.playgrounds.toArray().then(playgrounds => {
      return Promise.all(playgrounds.map(async p => {
        const reviews = await this.getReviewsForPlayground(p.Prop_ID);
        return reviews.length > 0;
      }));
    }).then(results => results.filter(Boolean).length);

    return {
      total,
      accessible,
      sensoryFriendly,
      withReviews,
      accessiblePercent: total > 0 ? Math.round((accessible / total) * 100) : 0,
      sensoryPercent: total > 0 ? Math.round((sensoryFriendly / total) * 100) : 0,
      reviewedPercent: total > 0 ? Math.round((withReviews / total) * 100) : 0
    };
  }

  // Extended playground information methods
  
  // Get default playground info structure
  getDefaultPlaygroundInfo() {
    return {
      age_range_min: null,
      age_range_max: null,
      novelty_has: null,
      novelty_notes: null,
      shade: 'unknown',
      fenced: 'unknown',
      star: null,
      surface: 'unknown',
      water_play: 'unknown',
      bathroom: 'unknown',
      drinking_fountain: 'unknown',
      seating: 'unknown',
      crowd_level: 'unknown',
      accessibility_ada_paths: null,
      accessibility_adaptive_swings: null,
      accessibility_notes: null,
      stroller_friendly: 'unknown',
      transit_nearest_stop: null,
      transit_walk_minutes: null,
      safety_line_of_sight: 'unknown',
      maintenance: 'unknown',
      last_verified: null,
      sources: [],
      editor_notes: null,
      schema_version: 2
    };
  }

  // Update playground with detailed information
  async updatePlaygroundInfo(playgroundId, infoUpdates) {
    const updates = {
      ...infoUpdates,
      last_verified: new Date().toISOString(),
      schema_version: 2
    };
    return await this.db.playgrounds.update(playgroundId, updates);
  }

  // Get playground with all detailed information
  async getPlaygroundWithInfo(propId) {
    const playground = await this.getPlaygroundByPropId(propId);
    if (!playground) return null;

    // Ensure all fields exist (for backwards compatibility)
    const defaults = this.getDefaultPlaygroundInfo();
    return {
      ...defaults,
      ...playground
    };
  }

  // Batch update playground info for multiple playgrounds
  async batchUpdatePlaygroundInfo(updates) {
    const results = [];
    for (const update of updates) {
      try {
        const result = await this.updatePlaygroundInfo(update.id, update.info);
        results.push({ success: true, id: update.id, result });
      } catch (error) {
        results.push({ success: false, id: update.id, error: error.message });
      }
    }
    return results;
  }

  // Search playgrounds by extended info
  async searchPlaygroundsByInfo(criteria) {
    let playgrounds = await this.db.playgrounds.toArray();
    
    // Apply filters based on criteria
    if (criteria.shade && criteria.shade !== 'any') {
      playgrounds = playgrounds.filter(p => p.shade === criteria.shade);
    }
    
    if (criteria.fenced && criteria.fenced !== 'any') {
      playgrounds = playgrounds.filter(p => p.fenced === criteria.fenced);
    }
    
    if (criteria.water_play && criteria.water_play !== 'any') {
      playgrounds = playgrounds.filter(p => p.water_play === criteria.water_play);
    }
    
    if (criteria.star !== undefined && criteria.star !== null) {
      playgrounds = playgrounds.filter(p => p.star >= criteria.star);
    }

    if (criteria.age_range_min !== undefined && criteria.age_range_min !== null) {
      playgrounds = playgrounds.filter(p => 
        p.age_range_min === null || p.age_range_min <= criteria.age_range_min
      );
    }

    if (criteria.age_range_max !== undefined && criteria.age_range_max !== null) {
      playgrounds = playgrounds.filter(p => 
        p.age_range_max === null || p.age_range_max >= criteria.age_range_max
      );
    }

    return playgrounds;
  }

  // Force migration of all playgrounds to schema version 2
  async forceSchemaUpgrade() {
    console.log('Starting forced schema upgrade...');
    const playgrounds = await this.db.playgrounds.toArray();
    const defaults = this.getDefaultPlaygroundInfo();
    let updated = 0;

    for (const playground of playgrounds) {
      if (!playground.schema_version || playground.schema_version < 2) {
        await this.db.playgrounds.update(playground.id, {
          ...defaults,
          last_verified: null, // Don't set verification date for auto-migration
          schema_version: 2
        });
        updated++;
      }
    }

    console.log(`Upgraded ${updated} playgrounds to schema version 2`);
    return { upgraded: updated, total: playgrounds.length };
  }
}

// Export singleton instance
const playgroundDB = new PlaygroundDatabase();
export default playgroundDB;