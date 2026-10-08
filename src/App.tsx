import { useState, useEffect } from 'react';
import { api } from './api';
import { User, Admin, RestaurantSettings } from './types';
import CustomerPortal from './components/CustomerPortal';
import AdminPanel from './components/AdminPanel';
import { Lock, User as UserIcon, X, AlertCircle } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [role, setRole] = useState<'customer' | 'admin' | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  // Admin login credentials states
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const loadSettingsAndSession = async () => {
    setLoading(true);
    try {
      // 1. Load restaurant configurations
      const config = await api.getSettings();
      setSettings(config);

      // 2. Check if active session token exists
      const token = localStorage.getItem('mir_token');
      if (token) {
        const session = await api.getMe();
        if (session.role === 'admin' && session.admin) {
          setAdmin(session.admin);
          setRole('admin');
        } else if (session.role === 'customer' && session.user) {
          setUser(session.user);
          setRole('customer');
        }
      }
    } catch (err) {
      console.warn('No active session or settings sync issues:', err);
      // Clean up corrupt tokens if any
      localStorage.removeItem('mir_token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsAndSession();
  }, []);

  const handleLoginSuccess = (verifiedUser: User, token: string) => {
    localStorage.setItem('mir_token', token);
    setUser(verifiedUser);
    setRole('customer');
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await api.adminLogin(adminEmail, adminPassword);
      localStorage.setItem('mir_token', res.token);
      setAdmin(res.admin);
      setRole('admin');
      setShowAdminLogin(false);
      setAdminEmail('');
      setAdminPassword('');
    } catch (err: any) {
      setLoginError(err.message || 'Invalid admin credentials');
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error(err);
    }
    setUser(null);
    setAdmin(null);
    setRole(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-amber-50/20 flex flex-col items-center justify-center gap-4 text-slate-800">
        {/* Saffron Spinning Loader */}
        <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-center">
          <h2 className="font-extrabold text-slate-800 text-base">Mana Inti Ruchulu</h2>
          <p className="text-slate-400 text-xs mt-1">Authentic Home-style cooking delivered warm...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans antialiased text-slate-800">
      
      {/* Direct routing based on active validated role */}
      {role === 'admin' && admin && settings ? (
        <AdminPanel 
          settings={settings} 
          onRefreshSettings={loadSettingsAndSession} 
          onLogout={handleLogout} 
        />
      ) : (
        <div className="relative">
          {/* Main customer-facing layout workspace */}
          {settings && (
            <CustomerPortal 
              user={user} 
              settings={settings} 
              onLoginSuccess={handleLoginSuccess} 
              onLogout={handleLogout} 
            />
          )}

          {/* Quick invisible Admin access triggers in footer / background */}
          <div className="bg-slate-900 py-6 px-4 text-center text-slate-500 text-[11px] font-semibold border-t border-slate-800 mb-14">
            <p>&copy; 2026 Mana Inti Ruchulu. All Rights Reserved.</p>
            <p className="text-slate-600 mt-1">Inti Ruchi • Fresh Meals • Affordable • Delivered</p>
            <button 
              onClick={() => {
                setLoginError(null);
                setShowAdminLogin(true);
              }}
              className="mt-3.5 bg-slate-800 text-slate-400 border border-slate-700/50 hover:bg-slate-700 hover:text-white px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5 font-bold uppercase tracking-wider"
            >
              <Lock size={12} />
              <span>Super Admin Access</span>
            </button>
          </div>
        </div>
      )}

      {/* OVERLAY: ADMIN LOGIN DIALOGUE */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-5 border border-slate-100 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Lock className="text-amber-600" size={18} />
                <h3 className="font-extrabold text-slate-800 text-sm">Super Admin Portal Access</h3>
              </div>
              <button 
                onClick={() => setShowAdminLogin(false)}
                className="p-1 hover:bg-slate-50 rounded text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="font-bold text-slate-600">Authorized Email Address</label>
                <input 
                  type="email" 
                  value={adminEmail} 
                  onChange={e => setAdminEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-lg focus:outline-amber-500"
                  placeholder="gayathrirani6093@gmail.com"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600">Secret Security Password</label>
                <input 
                  type="password" 
                  value={adminPassword} 
                  onChange={e => setAdminPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-lg focus:outline-amber-500"
                  placeholder="••••••••"
                  required
                />
              </div>

              {loginError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg flex items-start gap-2">
                  <AlertCircle className="shrink-0 mt-0.5" size={14} />
                  <span>{loginError}</span>
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-lg text-xs tracking-wider uppercase shadow transition-colors"
              >
                Authenticate & Login
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
