// Database abstraction layer using Dexie.js
import Dexie from './node_modules/dexie/dist/dexie.mjs';

class PlaygroundDB extends Dexie {
  constructor() {
    super('PlaygroundDatabase');
    
    // Define schema
    this.version(1).stores({
      playgrounds: '++id, Prop_ID, Playground_ID, Name, Location, Accessible, lat, lon',
      settings: 'key, value',
      favorites: '++id, playground_id, added_date'
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
}

// Export singleton instance
const playgroundDB = new PlaygroundDatabase();
export default playgroundDB;