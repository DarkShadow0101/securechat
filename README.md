# 🎨 Beautiful Animated Login Page
test

A stunning login page with dynamic animations built with React.js, Node.js, and Firebase authentication. Features glass morphism effects, floating particles, and smooth transitions.

## ✨ Features

  - **🎭 Dynamic Animations**: Smooth page transitions and micro-interactions
  - **🌊 Glass Morphism**: Modern glass-like UI effects with backdrop blur
  - **✨ Floating Particles**: Animated background particles for visual appeal
  - **🔐 Firebase Authentication**: Secure user authentication with **email and password**
  - **📧 Email Verification**: Automatic email confirmation for new accounts
  - **📱 Responsive Design**: Works perfectly on all devices
  - **🎨 Beautiful UI**: Modern gradient backgrounds and smooth animations
  - **⚡ Real-time Updates**: Live form validation and error handling
  - **🛡️ Protected Routes**: Secure dashboard with authentication guards
  - **🌙 Dark Mode**: A sleek, eye-friendly dark theme option
  - **⬆️ File Sharing**: Upload and share files with other users via generated links, with access to previously uploaded files across sessions.

## 🚀 Live Demo

[View Live Demo](https://puni-bhai-login-page.vercel.app)

## 🛠️ Tech Stack

### Frontend

  - **React.js** - Modern UI library
  - **Framer Motion** - Animation library
  - **Tailwind CSS** - Utility-first CSS framework
  - **Lucide React** - Beautiful icons
  - **React Router** - Client-side routing

### Backend

  - **Node.js** - Server runtime
  - **Express.js** - Web framework
  - **Firebase Admin SDK** - Server-side authentication
  - **CORS** - Cross-origin resource sharing
  - **Helmet** - Security middleware

### Authentication

  - **Firebase Authentication** - User management
  - **Email Verification** - Account confirmation
  - **JWT Tokens** - Secure session management

## 📦 Installation

### Prerequisites

  - Node.js (v16 or higher)
  - npm or yarn
  - Firebase project

### 1\. Clone the Repository

```bash
git clone https://github.com/DarkShadow0101/Codec_Projects
cd login-Page-main
```

### 2\. Install Dependencies

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### 3\. Firebase Setup

#### Create Firebase Project

1.  Go to [Firebase Console](https://console.firebase.google.com/)
2.  Create a new project
3.  Enable Authentication with Email/Password provider
4.  Enable Email verification

#### Frontend Configuration

1.  In Firebase Console, go to Project Settings
2.  Add a web app to your project
3.  Copy the Firebase config object
4.  Update `client/src/firebase.js` with your config

#### Backend Configuration

1.  In Firebase Console, go to Project Settings \> Service Accounts
2.  Generate a new private key
3.  Download the JSON file
4.  Replace `server/firebase-service-account.json` with the downloaded file

### 4\. Environment Variables

Create a `.env` file in the root directory:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
```

## 🎯 Usage

### Development Mode

```bash
# Start both frontend and backend
npm run dev

# Or start them separately
npm run server     # Backend on port 5000
npm run client     # Frontend on port 3000
```

### Production Build

```bash
# Build the React app
npm run build

# Start production server
npm start
```

## 🚀 Deployment

### Vercel Deployment

1.  **Connect to GitHub:**

      - Go to [Vercel](https://vercel.com)
      - Import your GitHub repository
      - Select the repository: `DarkShadow0101/Codec_Projects`

2.  **Configure Build Settings:**

      - **Framework Preset**: Create React App
      - **Root Directory**: `client`
      - **Build Command**: `npm run build`
      - **Output Directory**: `build`
      - **Install Command**: `npm install`

3.  **Environment Variables:**
    Add these in Vercel dashboard:

    ```
    REACT_APP_FIREBASE_API_KEY=your-api-key
    REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
    REACT_APP_FIREBASE_PROJECT_ID=your-project-id
    REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
    REACT_APP_FIREBASE_APP_ID=your-app-id
    ```

4.  **Deploy:**

      - Click "Deploy"
      - Vercel will automatically build and deploy your app

### Backend Deployment (Optional)

For the backend API, you can deploy to:

  - **Railway**
  - **Heroku**
  - **Render**
  - **Vercel Functions**

## 🎨 Features in Detail

### Login Page

  - **Toggle between Login/Signup**: Seamless form switching
  - **Password Visibility Toggle**: Show/hide password with eye icon
  - **Real-time Validation**: Instant feedback on form inputs
  - **Loading States**: Beautiful loading animations
  - **Error Handling**: User-friendly error messages
  - **Floating Particles**: Dynamic background animations
  - **Glass Morphism**: Modern translucent UI elements
  - **Email Verification**: Automatic confirmation emails
  - **Dark Mode**: Toggle between light and dark themes for a personalized experience.

### Dashboard

  - **Protected Routes**: Authentication-required pages
  - **User Profile**: Display user information
  - **Activity Overview**: Statistics and recent activity
  - **Responsive Layout**: Works on all screen sizes
  - **Smooth Transitions**: Animated page changes
  - **File Upload & Sharing**: Authenticated users can upload files and share them via unique links.
  - **Persistent File Access**: All previously uploaded files are accessible in subsequent login sessions.

### Animations

  - **Page Transitions**: Smooth route changes
  - **Form Animations**: Staggered input field animations
  - **Button Interactions**: Hover and click effects
  - **Loading Spinners**: Custom animated loaders
  - **Particle System**: Dynamic background particles

## 🛠️ Customization

### Colors

Update the color scheme in `client/tailwind.config.js`:

```javascript
colors: {
  primary: {
    500: '#3b82f6', // Your primary color
  },
  secondary: {
    500: '#d946ef', // Your secondary color
  }
}
```

### Animations

Modify animation durations in `client/src/index.css`:

```css
.input-focus:focus {
  transform: scale(1.02);
  transition: all 0.3s ease;
}
```

## 🔧 API Endpoints

### Backend Routes

  - `GET /api/health` - Server health check
  - `GET /api/profile` - Protected user profile (requires auth token)
  - `POST /api/upload` - Upload files (requires authentication)
  - `GET /api/files` - Retrieve uploaded files (requires authentication)

### Authentication Flow

1.  User submits login/signup form using their **email and password**.
2.  Firebase authenticates user.
3.  Email verification sent (for signup).
4.  JWT token sent to backend.
5.  Backend validates token.
6.  Protected routes and file sharing features become accessible.

## 📱 Browser Support

  - Chrome (latest)
  - Firefox (latest)
  - Safari (latest)
  - Edge (latest)

## 🤝 Contributing

1.  Fork the repository
2.  Create a feature branch
3.  Make your changes
4.  Add tests if applicable
5.  Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

  - [Framer Motion](https://www.framer.com/motion/) for animations
  - [Tailwind CSS](https://tailwindcss.com/) for styling
  - [Lucide](https://lucide.dev/) for icons
  - [Firebase](https://firebase.google.com/) for authentication

-----

Made with ❤️  (https://github.com/DarkShadow0101)
