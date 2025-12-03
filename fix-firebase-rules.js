const { exec } = require('child_process');
const fs = require('fs');

console.log('🔥 Firebase Storage Rules Fix');
console.log('=============================\n');

// Check if firebase-tools is installed
exec('firebase --version', (error, stdout, stderr) => {
  if (error) {
    console.log('❌ Firebase CLI not found. Installing...');
    exec('npm install -g firebase-tools', (installError) => {
      if (installError) {
        console.log('❌ Failed to install Firebase CLI');
        console.log('Please run: npm install -g firebase-tools');
        return;
      }
      console.log('✅ Firebase CLI installed successfully');
      deployRules();
    });
  } else {
    console.log('✅ Firebase CLI found');
    deployRules();
  }
});

function deployRules() {
  console.log('\n📝 Deploying Firebase Storage Rules...');
  
  // Create firebase.json if it doesn't exist
  if (!fs.existsSync('firebase.json')) {
    const firebaseConfig = {
      "storage": {
        "rules": "storage.rules"
      }
    };
    fs.writeFileSync('firebase.json', JSON.stringify(firebaseConfig, null, 2));
    console.log('✅ Created firebase.json');
  }
  
  // Create storage.rules if it doesn't exist
  if (!fs.existsSync('storage.rules')) {
    const rules = `rules_version = '2';
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
}`;
    fs.writeFileSync('storage.rules', rules);
    console.log('✅ Created storage.rules');
  }
  
  // Deploy the rules
  exec('firebase deploy --only storage', (error, stdout, stderr) => {
    if (error) {
      console.log('❌ Failed to deploy rules automatically');
      console.log('Please follow the manual steps in update-firebase-rules.md');
      console.log('\nError:', error.message);
    } else {
      console.log('✅ Firebase Storage Rules deployed successfully!');
      console.log('\n🎉 Your file upload feature should now work!');
      console.log('Try uploading a file in your app.');
    }
  });
} 