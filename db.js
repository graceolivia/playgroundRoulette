// Database abstraction layer using Dexie.js
import Dexie from './node_modules/dexie/dist/dexie.mjs';

class PlaygroundDB extends Dexie {
  constructor() {
    super('PlaygroundDatabase');
    
    // Define schema
    this.version(1).stores({
      playgrounds: '++id, Prop_ID, Playground_ID, Name, Location, Accessible, lat, lon',
      settings: 'key, value',
      favorites: '++id, playground_id, added_date',
      reviews: '++id, playground_prop_id, title, content, rating, author, date, featured, approved'
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

    return await query.toArray();
  }

  // Add a new playground
  async addPlayground(playground) {
    return await this.db.playgrounds.add(playground);
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
    const playground = {
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
      added_by: 'admin'
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
}

// Export singleton instance
const playgroundDB = new PlaygroundDatabase();
export default playgroundDB;