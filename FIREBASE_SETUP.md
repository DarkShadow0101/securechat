# 🔥 Firebase Setup Guide

## Quick Setup for Development

### Option 1: Run Without Firebase (Demo Mode)
The application will run without Firebase authentication for development purposes. You can still see the beautiful UI and animations!

```bash
npm run dev
```

### Option 2: Full Firebase Setup

#### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter a project name (e.g., "animated-login-app")
4. Enable Google Analytics (optional)
5. Click "Create project"

#### Step 2: Enable Authentication
1. In your Firebase project, go to "Authentication" in the left sidebar
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password" provider
5. Click "Save"

#### Step 3: Get Frontend Configuration
1. Go to Project Settings (gear icon)
2. Scroll down to "Your apps" section
3. Click the web icon (</>) to add a web app
4. Register app with a nickname (e.g., "animated-login-web")
5. Copy the Firebase config object

#### Step 4: Update Frontend Config
Replace the config in `client/src/firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

#### Step 5: Get Backend Service Account
1. In Project Settings, go to "Service accounts" tab
2. Click "Generate new private key"
3. Download the JSON file
4. Replace `server/firebase-service-account.json` with the downloaded file

#### Step 6: Test the Setup
```bash
npm run dev
```

## Environment Variables (Optional)

Create a `.env` file in the root directory:

```env
# Backend
PORT=5000
NODE_ENV=development

# Frontend (optional - can be set in firebase.js directly)
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=1:123456789:web:abcdef
```

## Troubleshooting

### "Failed to parse private key" Error
- Make sure you downloaded the correct service account JSON file
- The file should contain a valid private key in PEM format
- Check that the file path is correct: `server/firebase-service-account.json`

### "Firebase not configured" Error
- Follow the setup steps above
- Make sure both frontend and backend configurations are correct
- Check that the service account file exists and is valid

### Authentication Not Working
- Verify that Email/Password authentication is enabled in Firebase Console
- Check that your Firebase config in `client/src/firebase.js` is correct
- Ensure the service account has the necessary permissions

## Demo Mode Features

When running without Firebase:
- ✅ Beautiful UI and animations work
- ✅ Form validation and interactions
- ✅ Responsive design
- ❌ Actual authentication (will show error messages)
- ❌ Protected routes (will redirect to login)

## Next Steps

Once Firebase is configured:
1. Test user registration and login
2. Explore the dashboard features
3. Customize the UI and animations
4. Add additional Firebase services (Firestore, Storage, etc.) 