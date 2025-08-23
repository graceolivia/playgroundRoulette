# NYC Playground Explorer

An interactive map-based application to discover and explore NYC playgrounds with database functionality for favorites and filtering.

## Features

🗺️ **Interactive Map**
- OpenStreetMap integration with Leaflet.js
- Color-coded markers (Green = Accessible, Yellow = Limited, Red = Not Accessible)
- Different icons for sensory-friendly playgrounds (🧸) vs regular (🛝)
- Marker clustering for better performance
- Popup details with quick info

🎲 **Smart Discovery** 
- "Pick Random" button for playground discovery
- Advanced filtering by borough, accessibility, and sensory-friendly features
- "Near Me" location-based exploration
- Real-time marker updates based on filters

❤️ **Database Features**
- Persistent favorites system using IndexedDB
- Local data storage for offline functionality  
- Export playground data to JSON
- Statistics dashboard
- Database management tools

📱 **Mobile Optimized**
- Responsive design for all screen sizes
- Touch-friendly map controls
- Sliding details panel on mobile
- Location services integration

## Getting Started

1. Install dependencies: `npm install`
2. Start server: `npm start` or `python3 -m http.server 8001`
3. Open: `http://localhost:8001`
4. Explore NYC playgrounds on the map!

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript ES6+
- **Mapping**: Leaflet.js + OpenStreetMap
- **Database**: Dexie.js (IndexedDB wrapper)
- **UI**: Custom CSS with dark theme
- **Data**: NYC Parks Department playground dataset
