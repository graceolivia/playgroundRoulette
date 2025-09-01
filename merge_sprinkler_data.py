#!/usr/bin/env python3
"""
Script to merge playground data with sprinkler information.
Matches 'subpropertyname' from sprinklers.json to 'Name' from DPR_Playgrounds_001.json
and creates a new JSON file with all playground data plus has_sprinkler trait.
"""

import json
import re
from difflib import SequenceMatcher

def normalize_name(name):
    """Normalize playground names for better matching."""
    if not name:
        return ""
    
    # Convert to lowercase and remove extra whitespace
    normalized = name.lower().strip()
    
    # Remove common suffixes and prefixes that might cause mismatches
    suffixes_to_remove = [
        " playground", " plgd", " park playground", " park", 
        " tot lot", " playgrnd", " plgrnd"
    ]
    
    for suffix in suffixes_to_remove:
        if normalized.endswith(suffix):
            normalized = normalized[:-len(suffix)].strip()
    
    # Remove special characters and extra spaces
    normalized = re.sub(r'[^\w\s]', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    return normalized

def similarity_score(name1, name2):
    """Calculate similarity score between two playground names."""
    norm1 = normalize_name(name1)
    norm2 = normalize_name(name2)
    
    if not norm1 or not norm2:
        return 0.0
    
    # Exact match after normalization gets highest score
    if norm1 == norm2:
        return 1.0
    
    # Check if they share significant words (prevent bad matches like "Dan Ross" -> "Diana Ross")
    words1 = set(norm1.split())
    words2 = set(norm2.split())
    
    # If they share no common words, score is 0
    if len(words1.intersection(words2)) == 0:
        return 0.0
    
    # Use SequenceMatcher for fuzzy matching
    return SequenceMatcher(None, norm1, norm2).ratio()

def find_best_match(playground_name, sprinkler_names, threshold=0.98):
    """Find the best matching sprinkler name for a playground."""
    best_match = None
    best_score = 0.0
    
    # First try exact match after normalization
    norm_playground = normalize_name(playground_name)
    for sprinkler_name in sprinkler_names:
        norm_sprinkler = normalize_name(sprinkler_name)
        if norm_playground == norm_sprinkler:
            return sprinkler_name, 1.0
    
    # Then try fuzzy matching with very high threshold
    for sprinkler_name in sprinkler_names:
        score = similarity_score(playground_name, sprinkler_name)
        if score > best_score and score >= threshold:
            # Additional validation: check that they share meaningful words
            playground_words = set(normalize_name(playground_name).split())
            sprinkler_words = set(normalize_name(sprinkler_name).split())
            shared_words = playground_words.intersection(sprinkler_words)
            
            # Require at least 2 shared words OR very high similarity (>0.99)
            if len(shared_words) >= 2 or score > 0.99:
                best_score = score
                best_match = sprinkler_name
    
    return best_match, best_score

def main():
    print("🏗️ NYC Playground Sprinkler Data Merger")
    print("=" * 50)
    
    # Load sprinkler data
    print("📄 Loading sprinklers.json...")
    try:
        with open('sprinklers.json', 'r') as f:
            sprinkler_data = json.load(f)
        print(f"✅ Loaded {len(sprinkler_data)} sprinkler records")
    except FileNotFoundError:
        print("❌ Error: sprinklers.json not found")
        return
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing sprinklers.json: {e}")
        return
    
    # Load playground data
    print("📄 Loading DPR_Playgrounds_001.json...")
    try:
        with open('DPR_Playgrounds_001.json', 'r') as f:
            playground_data = json.load(f)
        print(f"✅ Loaded {len(playground_data)} playground records")
    except FileNotFoundError:
        print("❌ Error: DPR_Playgrounds_001.json not found")
        return
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing DPR_Playgrounds_001.json: {e}")
        return
    
    # Create a set of sprinkler playground names for faster lookup
    print("🔍 Processing sprinkler data...")
    sprinkler_names = set()
    sprinkler_lookup = {}
    
    for sprinkler in sprinkler_data:
        name = sprinkler.get('subpropertyname', '').strip()
        if name:
            sprinkler_names.add(name)
            # Store sprinkler info (status, system, etc.)
            sprinkler_lookup[name] = {
                'status': sprinkler.get('status', ''),
                'system': sprinkler.get('system', ''),
                'district': sprinkler.get('district', ''),
                'featuretype': sprinkler.get('featuretype', '')
            }
    
    print(f"✅ Found {len(sprinkler_names)} unique sprinkler playground names")
    
    # Process each playground
    print("🔄 Matching playgrounds with sprinkler data...")
    matched_count = 0
    fuzzy_matched_count = 0
    enhanced_playgrounds = []
    
    for playground in playground_data:
        # Start with all original playground data
        enhanced_playground = playground.copy()
        
        playground_name = playground.get('Name', '').strip()
        
        # Initialize sprinkler data
        enhanced_playground['has_sprinkler'] = False
        enhanced_playground['sprinkler_status'] = None
        enhanced_playground['sprinkler_system'] = None
        enhanced_playground['sprinkler_district'] = None
        
        if not playground_name:
            enhanced_playgrounds.append(enhanced_playground)
            continue
        
        # Try exact match first
        exact_match = None
        for sprinkler_name in sprinkler_names:
            if playground_name.lower().strip() == sprinkler_name.lower().strip():
                exact_match = sprinkler_name
                break
        
        if exact_match:
            # Exact match found
            enhanced_playground['has_sprinkler'] = True
            sprinkler_info = sprinkler_lookup[exact_match]
            enhanced_playground['sprinkler_status'] = sprinkler_info['status']
            enhanced_playground['sprinkler_system'] = sprinkler_info['system']
            enhanced_playground['sprinkler_district'] = sprinkler_info['district']
            matched_count += 1
        else:
            # Try fuzzy matching
            best_match, score = find_best_match(playground_name, sprinkler_names, threshold=0.8)
            
            if best_match:
                enhanced_playground['has_sprinkler'] = True
                sprinkler_info = sprinkler_lookup[best_match]
                enhanced_playground['sprinkler_status'] = sprinkler_info['status']
                enhanced_playground['sprinkler_system'] = sprinkler_info['system']
                enhanced_playground['sprinkler_district'] = sprinkler_info['district']
                fuzzy_matched_count += 1
                print(f"🔗 Fuzzy match ({score:.2f}): '{playground_name}' → '{best_match}'")
        
        enhanced_playgrounds.append(enhanced_playground)
    
    # Write the merged data
    output_file = 'Playgrounds_Sprinkler_Info.json'
    print(f"💾 Writing merged data to {output_file}...")
    
    try:
        with open(output_file, 'w') as f:
            json.dump(enhanced_playgrounds, f, indent=2, ensure_ascii=False)
        print(f"✅ Successfully created {output_file}")
    except Exception as e:
        print(f"❌ Error writing output file: {e}")
        return
    
    # Print statistics
    print("\n📊 Matching Statistics:")
    print(f"Total playgrounds: {len(playground_data)}")
    print(f"Exact matches: {matched_count}")
    print(f"Fuzzy matches: {fuzzy_matched_count}")
    print(f"Total with sprinklers: {matched_count + fuzzy_matched_count}")
    print(f"No sprinkler data: {len(playground_data) - matched_count - fuzzy_matched_count}")
    print(f"Match rate: {((matched_count + fuzzy_matched_count) / len(playground_data) * 100):.1f}%")
    
    # Show some examples of playgrounds with sprinklers
    print("\n🌊 Sample playgrounds with sprinklers:")
    sprinkler_playgrounds = [p for p in enhanced_playgrounds if p['has_sprinkler']][:5]
    for playground in sprinkler_playgrounds:
        print(f"  • {playground['Name']} ({playground['sprinkler_status']})")
    
    print("\n✨ Merge complete! The new database includes:")
    print("  • All original playground data from DPR_Playgrounds_001.json")
    print("  • has_sprinkler: Boolean indicating if playground has sprinklers")
    print("  • sprinkler_status: Status of the sprinkler system (if available)")
    print("  • sprinkler_system: System identifier (if available)")
    print("  • sprinkler_district: District information (if available)")

if __name__ == "__main__":
    main()