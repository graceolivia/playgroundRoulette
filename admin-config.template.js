// Admin Configuration Template
// Copy this file to admin-config.js and set your own credentials
// admin-config.js is ignored by git for security

export const ADMIN_CONFIG = {
  // Base64 encode your admin password: btoa("your-secret-password")
  passwordHash: 'YOUR_BASE64_ENCODED_PASSWORD_HERE',
  
  // Admin features to enable
  features: {
    reviews: true,
    playgroundEditor: true,
    databaseManager: true,
    analytics: true
  },
  
  // Admin metadata
  adminInfo: {
    name: 'Admin',
    role: 'Playground Editor',
    lastLogin: null
  },
  
  // Review moderation settings
  reviewSettings: {
    requireApproval: false,
    maxPhotosPerReview: 3,
    allowAnonymous: false
  }
};

/* 
HOW TO SET UP:
1. Copy this file: cp admin-config.template.js admin-config.js
2. Edit admin-config.js with your actual password
3. Generate base64: console.log(btoa("your-password"))
4. Replace YOUR_BASE64_ENCODED_PASSWORD_HERE with the result
5. Commit the template, but admin-config.js stays private!

Example:
If your password is "playground2024", run:
btoa("playground2024") // Returns "cGxheWdyb3VuZDIwMjQ="

Then set:
passwordHash: 'cGxheWdyb3VuZDIwMjQ='
*/