import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Mail, Lock, User, Shield, CheckCircle, RefreshCw } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth'; 
import { auth } from '../firebase'; 

const LoginPage = () => {
  const [formMode, setFormMode] = useState('login'); 
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '', // Added for re-enter password feature
    name: ''
  });
  const [particles, setParticles] = useState([]);
  const [passwordError, setPasswordError] = useState(''); // State for password validation errors

  const [captchaText, setCaptchaText] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const canvasRef = useRef(null);

  const { login, signup, sendVerificationEmail, error, setError } = useAuth();
  const navigate = useNavigate();

  const generateCaptcha = () => {
    const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCaptchaText(randomString);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.font = '30px Arial';
    ctx.fillStyle = '#333';
    
    for (let i = 0; i < randomString.length; i++) {
        const char = randomString[i];
        const x = 15 + i * 20;
        const y = 35 + Math.random() * 10 - 5;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((Math.random() - 0.5) * 0.4);
        ctx.fillText(char, 0, 0);
        ctx.restore();
    }
    
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.strokeStyle = '#aaa';
        ctx.stroke();
    }
    
    setCaptchaImage(canvas.toDataURL());
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  useEffect(() => {
    const generateParticles = () => {
      const newParticles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.random() * 4 + 2,
        duration: Math.random() * 20 + 10,
        delay: Math.random() * 5
      }));
      setParticles(newParticles);
    };
    generateParticles();
    const interval = setInterval(generateParticles, 30000);
    return () => clearInterval(interval);
  }, []);

  const validatePassword = (password) => {
    // Check for 14-digit length
    if (password.length < 14) {
      return "Password must be at least 14 characters long.";
    }
    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter.";
    }
    // Check for at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      return "Password must contain at least one lowercase letter.";
    }
    // Check for at least one special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(password)) {
      return "Password must contain at least one special character.";
    }
    return ''; // Return an empty string if valid
  };

  const clearFormState = () => {
    setError('');
    setMessage('');
    setFormData({ email: '', password: '', confirmPassword: '', name: '' });
    setCaptchaInput('');
    setPasswordError('');
    generateCaptcha();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (captchaInput.toLowerCase() !== captchaText.toLowerCase()) {
      setError("CAPTCHA does not match. Please try again.");
      generateCaptcha();
      setCaptchaInput("");
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    setPasswordError('');

    try {
      if (formMode === 'login') {
        await login(formData.email, formData.password);
        navigate('/dashboard');
      } else { 
        // Signup logic with password validation
        if (formData.password !== formData.confirmPassword) {
          setPasswordError("Passwords do not match.");
          setLoading(false);
          return;
        }
        
        const validationError = validatePassword(formData.password);
        if (validationError) {
          setPasswordError(validationError);
          setLoading(false);
          return;
        }

        await signup(formData.email, formData.password, formData.name);
        setMessage('Account created! Please check your email to verify your account.');
      }
    } catch (err) {
      if (err.message.includes('auth/email-not-verified')) {
        setError('Your email is not verified. Please check your inbox for a verification link.');
        setMessage(null);
      } else {
        setError(err.message);
      }
      generateCaptcha();
      setCaptchaInput("");
    } finally {
      setLoading(false);
    }
  };
  
  const handlePasswordReset = async (e) => {
    e.preventDefault();
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      await sendPasswordResetEmail(auth, formData.email);
      setMessage('If an account exists for this email, a password reset link has been sent.');
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await sendVerificationEmail();
      setMessage('Verification email sent again! Check your inbox.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Real-time password validation feedback during signup
    if (formMode === 'signup' && e.target.name === 'password') {
        const validationError = validatePassword(e.target.value);
        setPasswordError(validationError);
    }
  };

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.6, staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.5 } } };
  const formVariants = { hidden: { scale: 0.8, opacity: 0 }, visible: { scale: 1, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } } };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 flex flex-col">
      <div className="relative z-10 flex items-center justify-center flex-grow p-4">
        {/* Particles and Decorations */}
        <div className="absolute inset-0 pointer-events-none">
            {particles.map((particle) => (
              <motion.div
                key={particle.id}
                className="absolute bg-white/20 rounded-full"
                style={{ left: particle.x, top: particle.y, width: particle.size, height: particle.size }}
                animate={{ y: [0, -100, 0], opacity: [0, 1, 0], scale: [0, 1, 0] }}
                transition={{ duration: particle.duration, delay: particle.delay, repeat: Infinity, ease: "easeInOut" }}
              />
            ))}
        </div>
        <div className="absolute inset-0">
            <motion.div
              className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-r from-blue-400/30 to-purple-400/30 rounded-full blur-xl"
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute bottom-20 right-20 w-40 h-40 bg-gradient-to-r from-pink-400/30 to-purple-400/30 rounded-full blur-xl"
              animate={{ scale: [1.2, 1, 1.2], opacity: [0.6, 0.3, 0.6] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
        </div>

        <motion.div className="w-full max-w-md" variants={containerVariants} initial="hidden" animate="visible">
          
          <motion.div className="text-center mb-8" variants={itemVariants}>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              {formMode === 'login' && 'Login Page'}
              {formMode === 'signup' && 'Create Account'}
              {formMode === 'forgotPassword' && 'Reset Password'}
            </h1>
            <p className="text-white/80">
              {formMode === 'login' && 'Sign in to your account'}
              {formMode === 'signup' && 'Join us today'}
              {formMode === 'forgotPassword' && 'Enter your email to receive a reset link'}
            </p>
          </motion.div>

          <motion.div className="glass rounded-2xl p-6 sm:p-8 shadow-2xl" variants={formVariants} initial="hidden" animate="visible">
            
            {formMode === 'forgotPassword' ? (
              <form onSubmit={handlePasswordReset} className="space-y-6">
                 <motion.div variants={itemVariants} className="relative group">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input type="email" name="email" placeholder="Email Address" value={formData.email} onChange={handleInputChange} className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 input-focus" required />
                 </motion.div>
                 {error && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-red-300 text-sm text-center bg-red-500/20 rounded-lg p-3">{error}</motion.div>}
                 {message && !error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-green-300 text-sm text-center bg-green-500/20 rounded-lg p-3">
                    <div className="flex items-center justify-center space-x-2">
                      <CheckCircle className="w-4 h-4" />
                      <span>{message}</span>
                    </div>
                  </motion.div>
                )}
                 <motion.button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold btn-hover disabled:opacity-50 disabled:cursor-not-allowed" variants={itemVariants}>
                  {loading ? <div className="spinner mx-auto"></div> : 'Send Reset Link'}
                 </motion.button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {formMode === 'signup' && (
                  <motion.div variants={itemVariants} className="relative group">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input type="text" name="name" placeholder="Full Name" value={formData.name} onChange={handleInputChange} className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 input-focus" required={formMode === 'signup'} />
                  </motion.div>
                )}

                <motion.div variants={itemVariants} className="relative group">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input type="email" name="email" placeholder="Email Address" value={formData.email} onChange={handleInputChange} className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 input-focus" required />
                </motion.div>

                <motion.div variants={itemVariants} className="relative group">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input type={showPassword ? "text" : "password"} name="password" placeholder="Password" value={formData.password} onChange={handleInputChange} className="w-full pl-10 pr-12 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 input-focus" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </motion.div>
                
                {/* Re-enter password field for signup */}
                {formMode === 'signup' && (
                  <motion.div variants={itemVariants} className="relative group">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input type={showPassword ? "text" : "password"} name="confirmPassword" placeholder="Re-enter Password" value={formData.confirmPassword} onChange={handleInputChange} className="w-full pl-10 pr-12 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 input-focus" required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </motion.div>
                )}
                
                {/* Password strength feedback */}
                {formMode === 'signup' && passwordError && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-yellow-300 text-sm text-center bg-yellow-500/20 rounded-lg p-3">
                    {passwordError}
                  </motion.div>
                )}

                <motion.div variants={itemVariants}>
                  <label className="text-sm text-white/80 mb-2 block text-left">Please enter the text from the image</label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                      <div className="flex-shrink-0 flex items-center space-x-2">
                          {captchaImage && <img src={captchaImage} alt="CAPTCHA" className="rounded-lg w-[150px] h-[50px]" />}
                          <button type="button" onClick={generateCaptcha} title="Refresh CAPTCHA" className="p-2 text-white/60 hover:text-white">
                              <RefreshCw className="w-5 h-5"/>
                          </button>
                      </div>
                      <input 
                        type="text" 
                        placeholder="Enter text"
                        value={captchaInput}
                        onChange={(e) => setCaptchaInput(e.target.value)}
                        className="w-full pl-4 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 input-focus" 
                        required 
                      />
                  </div>
                </motion.div>

                {formMode === 'login' && (
                    <div className="text-right -mt-4">
                        <button 
                            type="button" 
                            onClick={() => {
                                setFormMode('forgotPassword');
                                setError('');
                                setMessage('');
                                setFormData(prev => ({ ...prev, password: '' }));
                            }} 
                            className="text-xs text-white/80 hover:text-white hover:underline">
                            Forgot Password?
                        </button>
                    </div>
                )}
                
                {error && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-red-300 text-sm text-center bg-red-500/20 rounded-lg p-3">{error}</motion.div>}
                {message && !error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-green-300 text-sm text-center bg-green-500/20 rounded-lg p-3">
                    <div className="flex items-center justify-center space-x-2"> <CheckCircle className="w-4 h-4" /> <span>{message}</span> </div>
                    {message.includes("verify your account") && (<button onClick={handleResendVerification} className="text-blue-300 hover:text-blue-200 underline mt-2">Resend verification email</button>)}
                  </motion.div>
                )}

                <motion.button type="submit" disabled={loading || passwordError} className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold btn-hover disabled:opacity-50 disabled:cursor-not-allowed" variants={itemVariants} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  {loading ? (<div className="spinner mx-auto"></div>) : (<span className="flex items-center justify-center"><Shield className="w-5 h-5 mr-2" />{formMode === 'login' ? 'Sign In' : 'Create Account'}</span>)}
                </motion.button>
              </form>
            )}

            <motion.div className="mt-6 text-center" variants={itemVariants}>
              {formMode === 'login' && (<button onClick={() => { setFormMode('signup'); clearFormState(); }} className="text-white/80 hover:text-white transition-colors">Don't have an account? Sign up</button>)}
              {formMode === 'signup' && (<button onClick={() => { setFormMode('login'); clearFormState(); }} className="text-white/80 hover:text-white transition-colors">Already have an account? Sign in</button>)}
              {formMode === 'forgotPassword' && (<button onClick={() => { setFormMode('login'); clearFormState(); }} className="text-white/80 hover:text-white transition-colors">Back to Login</button>)}
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
      
      <canvas ref={canvasRef} width="150" height="50" style={{ display: 'none' }}></canvas>
      <footer className="relative z-10 text-center p-4 text-white/60 text-sm">
      </footer>
    </div>
  );
};

export default LoginPage;
