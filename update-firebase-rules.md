# Firebase Storage Rules Update Guide

## Quick Fix for File Upload Issues

### Step 1: Go to Firebase Console
1. Open your browser and go to: https://console.firebase.google.com/
2. Select your project: `login-page-3264b`

### Step 2: Navigate to Storage Rules
1. Click on **Storage** in the left sidebar
2. Click on the **Rules** tab

### Step 3: Replace the Rules
Copy and paste these rules into the editor:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to read and write their own files
    match /uploads/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Allow public read access to uploaded files (for sharing)
    match /uploads/{userId}/{allPaths=**} {
      allow read: if true;
    }
  }
}
```

### Step 4: Publish Rules
1. Click **Publish** button
2. Wait for the rules to be deployed

### Step 5: Test
1. Go back to your app at http://localhost:3000
2. Try uploading a file
3. The errors should be resolved!

## Alternative Rules (if above doesn't work)
If you still get permission errors, use these more permissive rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## What These Rules Do:
- **Line 5-7**: Allows authenticated users to read/write files in their own folder
- **Line 9-11**: Allows public read access to all uploaded files (for sharing)
- **Alternative rules**: Allow any authenticated user to read/write anywhere (less secure but easier for testing) 