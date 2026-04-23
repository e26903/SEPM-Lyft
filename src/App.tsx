import React, { useState, useEffect, useRef } from 'react';
import brandingVideo from './assets/brand/brand.mp4';
import brandingGif from './assets/brand/brand.gif';
import brandingJpg from './assets/brand/brand.jpg';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  ClipboardList, 
  Search, 
  ChevronRight, 
  ArrowLeft,
  Download,
  FileText,
  Save,
  Trash2,
  Menu,
  X,
  Send,
  Database,
  FileSpreadsheet,
  CheckCircle2,
  Mail,
  Settings as SettingsIcon,
  Upload,
  Link2,
  History,
  ShieldCheck,
  UserPlus
} from 'lucide-react';
import Papa from 'papaparse';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import { InspectionData } from './types';
import { 
  getAllInspections, 
  saveInspection, 
  deleteInspection, 
  saveSites, 
  getSmartsheetUrl, 
  saveSmartsheetUrl, 
  getSiteMetadata, 
  clearImportedSites,
  getDestinationUrl,
  saveDestinationUrl,
  getDropboxToken,
  saveDropboxToken,
  getEmailRecipients,
  saveEmailRecipients,
  getAuthorizedUsers,
  addAuthorizedUser,
  removeAuthorizedUser
} from './lib/storage';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from './lib/firebase';
import { InspectionForm } from './components/InspectionForm';
import { generateInspectionPDF } from './lib/pdf';
import { exportToCSV } from './lib/csv';
import { Site } from './data/sites';

// Screens
type Screen = 'welcome' | 'dashboard' | 'form' | 'success' | 'reports' | 'settings';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('welcome');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [inspections, setInspections] = useState<InspectionData[]>([]);
  const [currentInspection, setCurrentInspection] = useState<InspectionData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const mainStageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      loadInspections();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Scroll entire screen to top when navigation occurs
    window.scrollTo(0, 0);
    if (mainStageRef.current) {
      mainStageRef.current.scrollTop = 0;
    }
  }, [currentScreen]);

  async function loadInspections() {
    const data = await getAllInspections();
    setInspections(data);
  }

  const startNewInspection = () => {
    const newId = crypto.randomUUID();
    const newInspection: InspectionData = {
      id: newId,
      status: 'draft',
      createdAt: new Date().toISOString(),
      workOrderNo: '',
      arrivalDateTime: new Date().toISOString().slice(0, 16),
      departureDateTime: new Date().toISOString().slice(0, 16),
      contractorCompany: 'SEPM Construction',
      technicianName: '',
      storeNo: '',
      streetAddress1: '',
      streetAddress2: '',
      city: '',
      state: '',
      zipcode: '',
      propertyClassification: ' - - - - - ',
      propertyClassificationOtherDetails: '',
      inspectionType: ' - - - - - ',
      liftStationType: ' - - - - - ',
      alarmStatus: ' - - - - - ',
      ratingScore: 100,
      inspectionDetailsNotes: '',
      pump1Electrical: emptyElectrical(),
      pump2Electrical: emptyElectrical(),
      pump1Evaluation: emptyEvaluation(),
      pump2Evaluation: emptyEvaluation(),
      visualAlarmTest: { condition: ' - - - - - ', notes: '', images: [] },
      audibleAlarmTest: { condition: ' - - - - - ', notes: '', images: [] },
      overallSiteCondition: { condition: ' - - - - - ', notes: '', images: [] },
      wetWell: {
        sideRails: ' - - - - - ',
        brackets: ' - - - - - ',
        piping: ' - - - - - ',
        flanges: ' - - - - - ',
        plugValves: ' - - - - - ',
        checkValves: ' - - - - - ',
        floats: ' - - - - - ',
        overallWell: ' - - - - - ',
        notes: '',
        images: []
      },
      controlBox: {
        boxCondition: ' - - - - - ',
        breakers: ' - - - - - ',
        starters: ' - - - - - ',
        relays: ' - - - - - ',
        contactors: ' - - - - - ',
        alternators: ' - - - - - ',
        controlConnections: ' - - - - - ',
        hoaSwitches: ' - - - - - ',
        levelControl: ' - - - - - ',
        notes: '',
        images: []
      },
      manifest: {
        number: '',
        disposalSite: '',
        disposalMethod: '',
        volumeGals: '',
        pumpingContractor: ''
      },
      generator: {
        lastServiceDate: '',
        nextServiceDate: '',
        nextInspectionDate: '',
        notes: ''
      },
      remoteAlarm: {
        brand: '',
        condition: ' - - - - - ',
        notes: '',
        images: []
      }
    };
    setCurrentInspection(newInspection);
    setCurrentScreen('form');
  };

  const emptyElectrical = () => ({
    volts_off: { l1: '', l2: '', l3: '' },
    volts_on: { l1: '', l2: '', l3: '' },
    amps: { l1: '', l2: '', l3: '' },
    meg: { l1: '', l2: '', l3: '' },
    ohms: { l1: '', l2: '', l3: '' },
  });

  const emptyEvaluation = () => ({
    meterReading: '',
    runtime: '',
    condition: ' - - - - - ' as any,
    images: []
  });

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (deleteConfirmId) {
      await deleteInspection(deleteConfirmId);
      await loadInspections();
      setDeleteConfirmId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-2 md:p-8 overflow-hidden">
      <div className="mesh-bg" />
      <div 
        ref={mainStageRef}
        className="w-full max-w-5xl h-[calc(100vh-1rem)] md:h-[85vh] frosted-glass flex flex-col md:rounded-[2.5rem] shadow-2xl relative overflow-hidden border-8 border-sepm-cyan"
      >
        <AnimatePresence mode="wait">
          {currentScreen === 'welcome' && (
            <WelcomeScreen key="welcome" onStart={() => setCurrentScreen('dashboard')} />
          )}

          {currentScreen === 'dashboard' && (
            <div className="flex-1 flex overflow-hidden">
              <aside className="w-72 glass-sidebar p-8 flex flex-col justify-between hidden md:flex">
                <div className="space-y-8">
                  <div className="logo-container flex flex-col items-center">
                    <h1 className="text-2xl font-black text-white tracking-widest leading-none uppercase">SEPM Lyft</h1>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-[0.3em] mt-1 font-bold">Service Inspection</p>
                  </div>
                  <nav className="space-y-4">
                    <button onClick={() => setCurrentScreen('dashboard')} className={cn(
                      "w-full text-left p-4 rounded-2xl font-bold flex items-center gap-3 transition-colors",
                      currentScreen === 'dashboard' ? "bg-sepm-cyan text-slate-900" : "bg-white/5 text-white hover:bg-white/10"
                    )}>
                      <ClipboardList size={20} /> Dashboard
                    </button>
                    <button onClick={() => {
                      setCurrentScreen('settings');
                      setMobileMenuOpen(false);
                    }} className={cn(
                      "w-full text-left p-4 rounded-2xl font-bold flex items-center gap-3 transition-colors",
                      currentScreen === 'settings' ? "bg-sepm-cyan text-slate-900" : "bg-white/5 text-white hover:bg-white/10"
                    )}>
                      <SettingsIcon size={20} /> Settings
                    </button>
                    <button className="w-full text-left p-4 bg-white/5 border border-white/10 text-white rounded-2xl font-bold flex items-center gap-3 opacity-50 cursor-not-allowed">
                      <Database size={20} /> Station Map
                    </button>
                  </nav>
                </div>
                <div className="footer-brand pt-4 opacity-40">
                  <p className="text-[10px] uppercase font-bold tracking-widest">Powered By</p>
                  <p className="text-xs font-black">SEPM Construction</p>
                </div>
              </aside>
              <DashboardScreen 
                key="dashboard"
                inspections={inspections}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onNew={startNewInspection}
                onEdit={(inspection) => {
                  setCurrentInspection(inspection);
                  setCurrentScreen('form');
                }}
                onDelete={handleDeleteClick}
                onExportCSV={() => exportToCSV(inspections)}
                onSettings={() => setCurrentScreen('settings')}
                loadInspections={loadInspections}
              />
            </div>
          )}

          {currentScreen === 'form' && currentInspection && (
            <InspectionForm
              key="form"
              inspection={currentInspection}
              setInspection={setCurrentInspection}
              onBack={() => {
                setCurrentScreen('dashboard');
                loadInspections();
              }}
              onComplete={() => {
                setCurrentScreen('success');
                loadInspections();
              }}
            />
          )}

          {currentScreen === 'success' && currentInspection && (
            <SuccessScreen 
              key="success" 
              inspection={currentInspection}
              onDashboard={() => setCurrentScreen('dashboard')} 
            />
          )}

          {currentScreen === 'settings' && (
            <SettingsScreen key="settings" onBack={() => setCurrentScreen('dashboard')} />
          )}
        </AnimatePresence>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6 mx-auto">
                <Trash2 size={32} />
              </div>
              <h3 className="text-2xl font-black text-white text-center mb-2 uppercase italic tracking-tight">Delete Inspection?</h3>
              <p className="text-zinc-400 text-center mb-8">This action cannot be undone. This record will be permanently removed from your device.</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-4 bg-red-500 hover:bg-red-600 text-white font-black rounded-2xl transition-all uppercase tracking-widest"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Screens ---

function WelcomeScreen({ onStart }: { onStart: () => void, key?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginMode, setLoginMode] = useState<'options' | 'email' | 'register'>('options');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/popup-blocked') {
        alert("The login popup was blocked by your browser. Please allow popups for this site and try again.");
      } else if (error.code === 'auth/unauthorized-domain') {
        alert("This domain is not authorized for login. If you are using a new URL (like Vercel), it must be added to the Authorized Domains in the Firebase Console.");
      } else {
        alert(`Authentication failed: ${error.message || 'Please try again.'}`);
      }
    }
  };
  
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setIsSubmitting(true);
    try {
      if (loginMode === 'register') {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        alert("Account created successfully!");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error: any) {
      console.error("Auth failed:", error);
      if (error.code === 'auth/user-not-found') {
        alert("No account found with this email. Please check your spelling or register if you are pre-authorized.");
      } else {
        alert(`Error: ${error.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      alert("Please enter your email address first.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email sent. Please check your inbox.");
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const user = auth.currentUser;

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50 overflow-y-auto"
    >
      <div className="w-full max-w-2xl mb-8">
        <div className="aspect-video shadow-2xl rounded-2xl overflow-hidden bg-black border border-slate-200">
           <LogoAnimation />
        </div>
      </div>
      
      <div className="w-full max-w-sm space-y-6 pb-12">
        {user ? (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Signed In As</p>
              <p className="font-bold text-slate-900 truncate">{user.email}</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onStart}
              className="w-full py-5 bg-sepm-cyan text-white font-black rounded-full text-lg shadow-2xl shadow-sepm-cyan/30 transition-all uppercase tracking-[0.2em]"
            >
              Enter Portal
            </motion.button>
          </div>
        ) : (
          <div className="space-y-4">
            {loginMode === 'options' ? (
              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleGoogleLogin}
                  className="w-full py-5 bg-slate-900 text-white font-black rounded-full text-xs shadow-xl shadow-slate-900/10 transition-all uppercase tracking-[0.2em] flex items-center justify-center gap-4"
                >
                  <Mail size={18} /> Stakeholder Login (Google)
                </motion.button>
                
                <div className="relative py-4">
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-slate-200" />
                  <span className="relative bg-slate-50 px-4 text-[10px] font-black text-slate-300 uppercase tracking-widest">or</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setLoginMode('email')}
                    className="py-5 bg-white border border-slate-200 text-slate-600 font-black rounded-3xl text-xs transition-all uppercase tracking-[0.1em] flex items-center justify-center gap-2"
                  >
                    Login
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setLoginMode('register')}
                    className="py-5 bg-sepm-cyan/10 border border-sepm-cyan/20 text-sepm-cyan font-black rounded-3xl text-xs transition-all uppercase tracking-[0.1em] flex items-center justify-center gap-2"
                  >
                    Register
                  </motion.button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEmailLogin} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4 bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-xl">
                  <div className="text-left mb-6">
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{loginMode === 'register' ? 'Create Account' : 'Portal Sign In'}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Authorized Personnel Only</p>
                  </div>

                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Email Address</label>
                    <input 
                      type="email"
                      required
                      placeholder="name@company.com"
                      className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-3xl text-sm outline-none focus:border-sepm-cyan transition-all"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Password</label>
                    <input 
                      type="password"
                      required
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-3xl text-sm outline-none focus:border-sepm-cyan transition-all"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-5 bg-sepm-cyan text-white rounded-3xl font-black uppercase tracking-widest text-xs hover:brightness-110 shadow-lg shadow-sepm-cyan/20 disabled:opacity-50 transition-all mt-4"
                  >
                    {isSubmitting ? 'Verifying Authorization...' : (loginMode === 'register' ? 'Initialize Account' : 'Enter Portal')}
                  </button>
                  
                  <div className="flex justify-between items-center px-4 pt-4">
                    {loginMode === 'email' && (
                      <button 
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-[10px] text-slate-400 font-bold uppercase tracking-widest hover:text-sepm-cyan transition-colors"
                      >
                        Forgot Password?
                      </button>
                    )}
                    <button 
                      type="button"
                      onClick={() => setLoginMode('options')}
                      className="text-[10px] text-sepm-cyan font-black uppercase tracking-widest hover:underline mx-auto"
                    >
                      Back to Options
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="space-y-4 pt-4 opacity-40">
          <p className="text-slate-900 text-[10px] font-bold tracking-[0.4em] uppercase">
            SEPM Construction & Maintenance
          </p>
          {!user && (
            <div className="pt-2">
              <a 
                href="mailto:Ruth.Haas@sepmfix.com?subject=Access%20Request%20-%20SEPM%20Lyft%20Portal&body=Hello,%20I%20would%20like%20to%20request%20access%20to%20the%20SEPM%20Lyft%20Operational%20Portal.%0A%0AEmail:%20"
                className="text-[10px] text-sepm-cyan font-black uppercase tracking-widest hover:underline"
              >
                Request Authorization
              </a>
            </div>
          )}
          <p className="text-sepm-cyan text-[9px] font-mono font-bold tracking-widest">
            STATION INSPECTION PROTOCOL v1.0.44
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function LogoAnimation() {
  const [mediaLevel, setMediaLevel] = useState(0); // 0: mp4, 1: gif, 2: jpg, 3: none
  const [mediaActive, setMediaActive] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);

  const sources = {
    mp4: brandingVideo,
    gif: brandingGif,
    jpg: brandingJpg
  };

  useEffect(() => {
    // Load YouTube API
    if (mediaLevel === 0 && !window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      
      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    } else if (mediaLevel === 0 && window.YT) {
      initPlayer();
    }

    function initPlayer() {
      if (playerRef.current) return;
      
      playerRef.current = new window.YT.Player('yt-player', {
        height: '100%',
        width: '100%',
        videoId: 'r6jjV_6L1Ws',
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          showinfo: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
          enablejsapi: 1,
          disablekb: 1,
          fs: 0,
          origin: window.location.origin
        },
        events: {
          onReady: (event: any) => {
            event.target.playVideo();
            setPlayerReady(true);
          },
          onStateChange: (event: any) => {
            // event.data: 1 = playing, 2 = paused, 3 = buffering, 0 = ended
            if (event.data === 1) {
              setMediaActive(true);
            } else if (event.data === 0) {
              // Re-play immediately on end to minimize gap
              event.target.playVideo();
              setMediaActive(false); // Briefly fade to logo during reset
            } else if (event.data === 3) {
              // Only hide if buffering is sustained
            }
          }
        }
      });
    }

    return () => {
      // Clean up if needed
    };
  }, [mediaLevel]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-white overflow-hidden">
      {/* THE VIDEO PLAYER (CLEAN FRAME MODE) */}
      <div className={`absolute inset-0 transition-opacity duration-1000 ${mediaActive ? 'opacity-100' : 'opacity-0'}`}>
        {mediaLevel === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            <div id="yt-player" className="w-[118%] h-[118%]" />
          </div>
        )}
        {mediaLevel === 1 && (
          <img 
            ref={logoRef}
            src={sources.gif} 
            alt="SEPM Animation"
            className="w-full h-full object-contain"
            onLoad={() => setMediaActive(true)}
            onError={() => setMediaLevel(2)}
          />
        )}
      </div>
    </div>
  );
}

function DashboardScreen({ inspections, searchQuery, setSearchQuery, onNew, onEdit, onDelete, onExportCSV, onSettings, loadInspections }: any) {
  const filtered = inspections.filter((i: any) => 
    (i.workOrderNo || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.storeNo || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.city || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col h-full overflow-hidden bg-white"
    >
      <header className="p-6 md:p-10 flex justify-between items-center bg-slate-50/50 border-b border-slate-100 space-x-4">
        <div className="flex items-center gap-4">
          <div className="md:hidden">
             <div className="logo-container flex flex-col">
              <h1 className="text-xl font-black text-sepm-dark tracking-widest leading-none uppercase">SEPM Lyft</h1>
            </div>
          </div>
          <div className="hidden md:block">
            <h2 className="text-2xl font-black text-sepm-dark uppercase tracking-tight">Dashboard</h2>
            <p className="text-sm opacity-60 text-slate-500 font-medium">Operations Center • SEPM Lyft</p>
          </div>
        </div>
        <div className="flex gap-2 flex-1 justify-end max-w-[200px] md:max-w-none">
          <div className="relative group hidden sm:block w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-sepm-cyan transition-colors" size={16} />
            <input 
              type="text"
              placeholder="Search work orders, stores..."
              className="white-input rounded-xl py-2 pl-10 pr-4 text-xs w-full font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={onNew}
            className="px-6 py-3 bg-sepm-cyan text-white rounded-xl md:rounded-2xl hover:brightness-110 transition-all shadow-lg shadow-sepm-cyan/20 active:scale-95 flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={20} strokeWidth={3} /> <span className="font-black text-xs uppercase tracking-widest hidden xs:block">New Inspection</span>
          </button>
        </div>
      </header>

      <div className="px-6 md:px-10 space-y-6 md:space-y-8 flex-1 overflow-y-auto pt-8 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
          <div className="bg-slate-50 border border-slate-100 p-4 md:p-6 rounded-2xl md:rounded-3xl">
            <span className="text-[8px] md:text-[10px] uppercase tracking-widest text-slate-400 block mb-1 md:mb-2 font-black">Status</span>
            <span className="text-xs md:text-2xl font-black text-sepm-cyan truncate block uppercase tracking-tighter">System Live</span>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-4 md:p-6 rounded-2xl md:rounded-3xl">
            <span className="text-[8px] md:text-[10px] uppercase tracking-widest text-slate-400 block mb-1 md:mb-2 font-black">Sync</span>
            <span className="text-xs md:text-2xl font-black truncate block tracking-tighter text-slate-900">{inspections.filter((i: any) => i.status === 'draft').length} PENDING</span>
          </div>
          <div className="bg-sepm-cyan/5 border border-sepm-cyan/10 p-4 md:p-6 rounded-2xl md:rounded-3xl hidden md:block">
            <span className="text-[10px] uppercase tracking-widest text-sepm-cyan block mb-2 font-black">Verified</span>
            <span className="text-2xl font-black tracking-tighter text-sepm-cyan uppercase italic">SECURE</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <h3 className="font-black uppercase tracking-widest text-[9px] md:text-xs text-slate-400">Recent Inspections</h3>
              <button 
                onClick={() => loadInspections()} 
                className="p-1.5 text-slate-300 hover:text-sepm-cyan transition-colors"
                title="Refresh Records"
              >
                <History size={12} />
              </button>
            </div>
            <span className="text-[10px] font-bold text-sepm-cyan bg-sepm-cyan/10 px-2 py-0.5 rounded-full uppercase tracking-widest">{filtered.length} TOTAL</span>
          </div>

          <div className="md:hidden space-y-3">
            {filtered.map((i: any) => (
              <div 
                key={i.id} 
                onClick={() => onEdit(i)}
                className="p-5 bg-white border border-slate-100 rounded-2xl active:bg-slate-50 transition-colors relative shadow-sm"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-black text-sepm-cyan">#{i.workOrderNo || 'DRAFT'}</span>
                  <span className={cn(
                    "text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest",
                    i.status === 'submitted' ? "bg-lyft-lime/10 text-lyft-lime" : "bg-amber-400/10 text-amber-500"
                  )}>
                    {i.status}
                  </span>
                </div>
                <div className="text-xs font-black text-slate-900 mb-4 uppercase tracking-tight line-clamp-1 truncate">Store #{i.storeNo} • {i.city}</div>
                <div className="flex justify-between items-center mt-2 border-t border-slate-50 pt-3">
                   <p className="text-[9px] text-slate-400 uppercase font-bold">{format(new Date(i.createdAt), 'MMM d, yyyy')}</p>
                   <div className="flex gap-2">
                        {i.status === 'submitted' && (
                          <button 
                            onClick={async (e) => {
                              e.stopPropagation();
                              const doc = await generateInspectionPDF(i);
                              doc.save(`SEPM_Report_${i.workOrderNo || 'Draft'}.pdf`);
                            }}
                            className="p-2 text-sepm-cyan hover:scale-110 active:scale-95 transition-all"
                          >
                            <Download size={16} />
                          </button>
                        )}
                     <button 
                        onClick={(e) => onDelete(i.id, e)}
                        className="p-2 text-slate-300 hover:text-red-500 active:scale-90 transition-transform"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="p-2 text-sepm-cyan">
                        <ChevronRight size={16} />
                      </div>
                   </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="pb-4 font-black p-4">Work Order</th>
                  <th className="pb-4 font-black p-4">Location</th>
                  <th className="pb-4 font-black p-4">Status</th>
                  <th className="pb-4 font-black p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((i: any) => (
                  <tr key={i.id} onClick={() => onEdit(i)} className="group cursor-pointer hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-black text-slate-900">#{i.workOrderNo || 'DRAFT'}</td>
                    <td className="p-4 text-sm text-slate-600 font-medium uppercase tracking-tight">Store #{i.storeNo} • {i.city}</td>
                    <td className="p-4">
                      <span className={cn(
                          "text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest",
                          i.status === 'submitted' ? "bg-lyft-lime/10 text-lyft-lime" : "bg-amber-400/10 text-amber-500"
                        )}>
                          {i.status}
                        </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {i.status === 'submitted' && (
                          <button 
                            onClick={async (e) => {
                              e.stopPropagation();
                              const doc = await generateInspectionPDF(i);
                              doc.save(`SEPM_Report_${i.workOrderNo || 'Draft'}.pdf`);
                            }}
                            className="p-2 text-sepm-cyan hover:scale-110 active:scale-95 transition-all"
                            title="Export PDF"
                          >
                            <Download size={18} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => onDelete(i.id, e)} 
                          className="p-2 text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-sepm-cyan transition-colors" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="py-20 text-center opacity-20 uppercase tracking-[0.3em] font-black text-sm">
              No Records
            </div>
          )}
        </div>
      </div>

      <footer className="p-6 md:p-10 pt-0 flex flex-col sm:flex-row gap-4 mt-auto">
        <button onClick={onExportCSV} className="w-full sm:w-auto px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100 transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
          Sync Master CSV
        </button>
        <button onClick={onSettings} className="md:hidden flex items-center justify-center gap-2 w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-sepm-cyan">
           <SettingsIcon size={14} /> System Config
        </button>
      </footer>
    </motion.div>
  );
}

function SuccessScreen({ inspection, onDashboard }: { inspection: InspectionData, onDashboard: () => void, key?: string }) {
  const [recipients, setRecipients] = useState('Ruth.Haas@sepmfix.com');

  useEffect(() => {
    getEmailRecipients().then(setRecipients);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} 
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex-1 flex flex-col items-center justify-center p-8 md:p-12 text-center"
    >
      <div className="w-20 h-20 md:w-24 md:h-24 bg-sepm-cyan rounded-full flex items-center justify-center mb-6 md:mb-8 shadow-2xl shadow-sepm-cyan/40">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.2 }}
        >
          <CheckCircle2 size={40} className="text-slate-900" />
        </motion.div>
      </div>
      
      <div className="space-y-4 mb-10">
        <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none italic text-sepm-cyan">Report Locked</h2>
        <p className="text-slate-500 text-xs md:text-sm font-bold uppercase tracking-widest opacity-60">Manifest Transmitted Successfully</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-12">
        <button 
          onClick={() => {
            const subject = encodeURIComponent(`Inspection Report: WO #${inspection.workOrderNo} - Store #${inspection.storeNo}`);
            const body = encodeURIComponent(`Find the attached inspection report for Work Order #${inspection.workOrderNo} completed on ${format(new Date(), 'PPP')}.`);
            window.location.href = `mailto:${recipients}?subject=${subject}&body=${body}`;
          }}
          className="flex flex-col items-center gap-4 p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:border-sepm-cyan transition-all group shadow-sm"
        >
          <div className="p-4 bg-sepm-cyan/10 text-sepm-cyan rounded-2xl group-hover:scale-110 transition-transform">
            <Mail size={24} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-sepm-cyan">Push Email</span>
        </button>

        <button 
          onClick={async () => {
            const doc = await generateInspectionPDF(inspection);
            doc.save(`SEPM_Report_${inspection.workOrderNo}.pdf`);
          }}
          className="flex flex-col items-center gap-4 p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:border-sepm-cyan transition-all group shadow-sm"
        >
          <div className="p-4 bg-sepm-cyan/10 text-sepm-cyan rounded-2xl group-hover:scale-110 transition-transform">
            <Download size={24} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-sepm-cyan">Local PDF</span>
        </button>
      </div>

      <button 
        onClick={onDashboard}
        className="w-full max-w-sm py-5 bg-sepm-dark text-white rounded-3xl font-black uppercase tracking-widest text-sm hover:brightness-125 transition-all shadow-xl shadow-sepm-cyan/10"
      >
        Operational Dashboard
      </button>
    </motion.div>
  );
}

function SettingsScreen({ onBack }: { onBack: () => void, key?: string }) {
  const [url, setUrl] = useState('');
  const [destUrl, setDestUrl] = useState('');
  const [dbxToken, setDbxToken] = useState('');
  const [recipients, setRecipients] = useState('');
  const [authUsers, setAuthUsers] = useState<string[]>([]);
  const [newAuthEmail, setNewAuthEmail] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{ fileName: string; count: number; date: string } | null>(null);

  const isAdmin = auth.currentUser?.email === 'crcjehaas@gmail.com';

  useEffect(() => {
    getSmartsheetUrl().then(setUrl);
    getDestinationUrl().then(setDestUrl);
    getDropboxToken().then(setDbxToken);
    getEmailRecipients().then(setRecipients);
    getSiteMetadata().then(setMetadata);
    if (isAdmin) {
      getAuthorizedUsers().then(setAuthUsers);
    }
  }, [isAdmin]);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus('Processing...');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const mapped: Site[] = results.data.map((row: any) => ({
          storeNo: row['Location ID'] || row['Store #'] || '',
          city: row['City'] || '',
          state: row['State'] || '',
          streetAddress1: row['Address'] || row['Full Address'] || '',
          zipcode: row['Zip'] || row['Zipcode'] || ''
        })).filter(s => s.storeNo);

        const newMeta = {
          fileName: file.name,
          count: mapped.length,
          date: new Date().toISOString()
        };

        await saveSites(mapped, newMeta);
        setMetadata(newMeta);
        setImportStatus(`Success! Imported ${mapped.length} locations.`);
        setTimeout(() => setImportStatus(null), 3000);
      },
      error: (err) => {
        setImportStatus(`Error: ${err.message}`);
      }
    });
  };

  const handleSaveUrl = async () => {
    await saveSmartsheetUrl(url);
    setImportStatus('URL saved successfully.');
    setTimeout(() => setImportStatus(null), 2000);
  };

  const handleSaveDestUrl = async () => {
    await saveDestinationUrl(destUrl);
    setImportStatus('Destination URL updated.');
    setTimeout(() => setImportStatus(null), 2000);
  };

  const handleSaveRecipients = async () => {
    await saveEmailRecipients(recipients);
    setImportStatus('Stakeholder recipients updated.');
    setTimeout(() => setImportStatus(null), 2000);
  };

  const handleAddUser = async () => {
    if (!newAuthEmail || !newAuthEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }
    await addAuthorizedUser(newAuthEmail);
    const updated = await getAuthorizedUsers();
    setAuthUsers(updated);
    setNewAuthEmail('');
    setImportStatus('User authorized successfully.');
    setTimeout(() => setImportStatus(null), 2000);
  };

  const handleRemoveUser = async (email: string) => {
    if (window.confirm(`Revoke access for ${email}?`)) {
      await removeAuthorizedUser(email);
      const updated = await getAuthorizedUsers();
      setAuthUsers(updated);
    }
  };

  const handleSaveDbxToken = async () => {
    await saveDropboxToken(dbxToken);
    setImportStatus('Dropbox token saved.');
    setTimeout(() => setImportStatus(null), 2000);
  };

  const handleClearData = async () => {
    if (window.confirm('Clear all imported site data? Built-in sites will remain.')) {
      await clearImportedSites();
      setMetadata(null);
      setImportStatus('Site database reset.');
      setTimeout(() => setImportStatus(null), 2000);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex-1 flex flex-col p-6 md:p-10 overflow-auto"
    >
      <header className="flex items-center gap-4 md:gap-6 mb-8 md:mb-12">
        <button onClick={onBack} className="p-2.5 md:p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
        </button>
        <h2 className="text-xl md:text-3xl font-black text-white uppercase italic tracking-tighter leading-none">System Configuration</h2>
      </header>

      <div className="max-w-2xl space-y-12 pb-24">
        {/* Persistent Status Banners */}
        <div className="space-y-3">
          {metadata ? (
            <div className="p-4 bg-teal-400/10 border border-teal-400/20 rounded-2xl flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-teal-400/20 rounded-xl flex items-center justify-center text-teal-400">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Active Manifest</p>
                  <p className="text-sm font-bold text-white">{metadata.fileName}</p>
                  <p className="text-[9px] text-white/40 font-mono uppercase">{metadata.count} Sites • Linked {format(new Date(metadata.date), 'PPp')}</p>
                </div>
              </div>
              <button onClick={handleClearData} className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-500 rounded-lg transition-all">
                <Trash2 size={16} />
              </button>
            </div>
          ) : (
            <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4 border-dashed">
              <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/20">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">No Custom Manifest</p>
                <p className="text-xs text-white/40">Using standard built-in site database</p>
              </div>
            </div>
          )}

          {url ? (
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
                <Link2 size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Remote Sync Active</p>
                <p className="text-sm font-bold text-white truncate max-w-[400px]">{url}</p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4 border-dashed">
              <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/20">
                <Link2 size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">No Remote Source</p>
                <p className="text-xs text-white/40">Manual Smart Sheet entry required for remote sync</p>
              </div>
            </div>
          )}
        </div>

        <section className="space-y-6">
          <div className="flex items-center gap-3 text-teal-400">
            <Upload size={18} />
            <h3 className="font-black uppercase tracking-widest text-xs md:text-sm">Update Manifest</h3>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-[28px] md:rounded-[32px] p-6 md:p-8 space-y-4 shadow-xl">
            <p className="text-[13px] md:text-sm text-white/60 leading-relaxed">
              Upload a new CSV to replace your active manifest. 
            </p>
            <div className="relative group">
              <input 
                type="file" 
                accept=".csv"
                onChange={handleCsvUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="py-6 md:py-8 border-2 border-dashed border-white/10 group-hover:border-teal-400/50 rounded-2xl flex flex-col items-center justify-center gap-3 transition-colors">
                <FileSpreadsheet className="text-white/10 group-hover:text-teal-400/40 transition-colors w-10 h-10 md:w-12 md:h-12" />
                <span className="text-[11px] font-black uppercase tracking-widest text-white/30">Select New CSV</span>
              </div>
            </div>
            {importStatus && (
              <p className="text-[11px] font-black text-teal-400 animate-pulse uppercase tracking-wider text-center">{importStatus}</p>
            )}
          </div>
        </section>

        <section className="space-y-6 opacity-80">
          <div className="flex items-center gap-3 text-sepm-cyan">
            <Database size={20} />
            <h3 className="font-black uppercase tracking-widest text-sm">Automated Cloud Sync</h3>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
            <p className="text-sm text-white/60 leading-relaxed">
              Enable "Zero-Involvement" uploads. Providing an <strong className="text-sepm-cyan">Access Token</strong> allows the system to push reports directly to your folder without manual interaction.
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Dropbox Access Token</label>
                <div className="flex gap-2">
                  <input 
                    type="password"
                    placeholder={import.meta.env.VITE_DROPBOX_ACCESS_TOKEN ? "Active (from environment)" : "sl.u.A1b2c3..."}
                    className="flex-1 bg-white/5 border border-white/10 px-5 py-4 rounded-2xl text-sm outline-none focus:border-sepm-cyan transition-all font-mono"
                    value={dbxToken}
                    onChange={(e) => setDbxToken(e.target.value)}
                  />
                  <button 
                    onClick={handleSaveDbxToken}
                    className="px-6 bg-sepm-cyan text-slate-900 font-black uppercase text-xs rounded-2xl hover:bg-white transition-colors"
                  >
                    Authorize
                  </button>
                </div>
                {import.meta.env.VITE_DROPBOX_ACCESS_TOKEN && !dbxToken && (
                  <p className="text-[9px] text-teal-400/60 mt-1 italic">Using environment-provided access token.</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Destination Path</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="Reporting/Inspections"
                    className="flex-1 bg-white/5 border border-white/10 px-5 py-4 rounded-2xl text-sm outline-none focus:border-sepm-cyan transition-all font-mono"
                    value={destUrl}
                    onChange={(e) => setDestUrl(e.target.value)}
                  />
                  <button 
                    onClick={handleSaveDestUrl}
                    className="px-6 bg-sepm-cyan text-slate-900 font-black uppercase text-xs rounded-2xl hover:bg-white transition-colors"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[9px] text-white/20 italic">If using an automated token, enter the folder path instead of a URL.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6 opacity-80">
          <div className="flex items-center gap-3 text-sepm-cyan">
            <Mail size={20} />
            <h3 className="font-black uppercase tracking-widest text-sm">Communication Protocol</h3>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
            <p className="text-sm text-white/60 leading-relaxed">
              Define the default "Push Email" recipients. Use commas for multiple addresses.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Stakeholder Recipients</label>
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Ruth.Haas@sepmfix.com, tech@sepm.com"
                  className="flex-1 bg-white/5 border border-white/10 px-5 py-4 rounded-2xl text-sm outline-none focus:border-sepm-cyan transition-all font-mono"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                />
                <button 
                  onClick={handleSaveRecipients}
                  className="px-6 bg-sepm-cyan text-slate-900 font-black uppercase text-xs rounded-2xl hover:bg-white transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6 opacity-80">
          <div className="flex items-center gap-3 text-teal-400">
            <Link2 size={20} />
            <h3 className="font-black uppercase tracking-widest text-sm">Remote Sourcing (BETA)</h3>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
            <p className="text-sm text-white/60 leading-relaxed">
              Connect directly to a live Smart Sheet or API endpoint for real-time Location ID fetching.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Source Data URL</label>
              <div className="flex gap-2">
                <input 
                  type="url"
                  placeholder="https://publish.smartsheet.com/..."
                  className="flex-1 bg-white/5 border border-white/10 px-5 py-4 rounded-2xl text-sm outline-none focus:border-teal-400 transition-all font-mono"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <button 
                  onClick={handleSaveUrl}
                  className="px-6 bg-teal-400 text-slate-900 font-black uppercase text-xs rounded-2xl hover:bg-teal-300"
                >
                  Link
                </button>
              </div>
            </div>
          </div>
        </section>

        {isAdmin && (
          <section className="space-y-6">
            <div className="flex items-center gap-3 text-sepm-cyan">
              <ShieldCheck size={20} />
              <h3 className="font-black uppercase tracking-widest text-sm">Personnel Authorization</h3>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
              <p className="text-sm text-white/60 leading-relaxed">
                 Manage who can access the operational portal. Authorized users must sign in with their Google account matching the email below.
              </p>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Authorize New Stakeholder</label>
                <div className="flex gap-2">
                  <input 
                    type="email"
                    placeholder="teammate@sepmfix.com"
                    className="flex-1 bg-white/5 border border-white/10 px-5 py-4 rounded-2xl text-sm outline-none focus:border-sepm-cyan transition-all"
                    value={newAuthEmail}
                    onChange={(e) => setNewAuthEmail(e.target.value)}
                  />
                  <button 
                    onClick={handleAddUser}
                    className="px-6 bg-sepm-cyan text-slate-900 font-black uppercase text-xs rounded-2xl hover:bg-white transition-colors flex items-center justify-center gap-2"
                  >
                    <UserPlus size={14} /> Add
                  </button>
                </div>
              </div>

              <div className="pt-6 space-y-3">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest block mb-2">Active Authorization Allowlist</label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-sepm-cyan rounded-full pulse" />
                      <span className="text-sm font-bold text-white">crcjehaas@gmail.com</span>
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-sepm-cyan bg-sepm-cyan/10 px-2 py-1 rounded">Organization Admin</span>
                  </div>
                  {authUsers.filter(e => e !== 'crcjehaas@gmail.com').map(email => (
                    <div key={email} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 group">
                      <span className="text-sm font-medium text-white/80">{email}</span>
                      <button 
                        onClick={() => handleRemoveUser(email)}
                        className="p-2 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {authUsers.length === 0 && (
                    <p className="text-[10px] text-white/20 text-center py-4 italic">No additional personnel authorized yet.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="space-y-6 opacity-80">
          <div className="flex items-center gap-3 text-red-500">
            <Trash2 size={20} />
            <h3 className="font-black uppercase tracking-widest text-sm">Session Control</h3>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
            <p className="text-sm text-white/60 leading-relaxed">
              Log out to switch stakeholders or clear your session from this device.
            </p>
            <button 
              onClick={async () => {
                await auth.signOut();
                onBack(); // Go to welcome
              }}
              className="w-full py-5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-red-500 hover:text-white transition-all"
            >
              Terminate Session
            </button>
          </div>
        </section>

        <div className="pt-8 border-t border-white/5">
          <div className="bg-white/5 rounded-2xl p-6 text-center">
            <p className="text-[10px] text-white/20 font-mono tracking-tighter uppercase leading-relaxed">
              Configuration ID: SEPM-NODE-{new Date().getTime().toString(16).toUpperCase()} • ALL CHANGES PERSISTED LOCALLY
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

