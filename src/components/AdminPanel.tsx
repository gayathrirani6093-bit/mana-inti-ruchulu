import { useState, useEffect, useRef } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { api } from '../api';
import { Meal, Order, Coupon, RestaurantSettings, User } from '../types';
import { 
  Home, LayoutGrid, Package, ClipboardList, Users, Tag, Truck, 
  Settings, BarChart2, LogOut, Check, X, Edit, Trash2, Plus, Filter, Search, MapPin, Map, Download, DollarSign, Clock, AlertCircle
} from 'lucide-react';

interface AdminPanelProps {
  settings: RestaurantSettings;
  onRefreshSettings: () => void;
  onLogout: () => void;
}

export default function AdminPanel({ settings, onRefreshSettings, onLogout }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'meals' | 'orders' | 'customers' | 'coupons' | 'settings' | 'reports'>('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  
  const [mealSearch, setMealSearch] = useState('');
  const [mealCategoryFilter, setMealCategoryFilter] = useState('');

  // Editing state for Meals
  const [editingMeal, setEditingMeal] = useState<Partial<Meal> | null>(null);
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);

  // Editing state for Coupons
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> | null>(null);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);

  // Editing state for Settings Form
  const [settingsForm, setSettingsForm] = useState<RestaurantSettings>(settings);

  // Period filter for reports tab
  const [reportsPeriodTab, setReportsPeriodTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Toast notifications & Confirmation Modals to replace window.alert / window.confirm inside sandboxed preview iframes
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Firebase Real-time Location Tracking & Sharing States for Admin
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [isFirebaseLoading, setIsFirebaseLoading] = useState(true);
  const [isRiderSharing, setIsRiderSharing] = useState(false);
  const [riderSharingStatus, setRiderSharingStatus] = useState<string | null>(null);
  const adminLocationWatchIdRef = useRef<number | null>(null);

  // Real-time locations of customers indexed by their firebaseUid
  const [customerLocations, setCustomerLocations] = useState<Record<string, { latitude: number; longitude: number; timestamp: string }>>({});

  // Initialize Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fUser) => {
      if (fUser) {
        setFirebaseUser(fUser);
        setIsFirebaseLoading(false);
      } else {
        signInAnonymously(auth)
          .then((cred) => {
            setFirebaseUser(cred.user);
            setIsFirebaseLoading(false);
          })
          .catch((err) => {
            console.error("Firebase Auth failed in Admin Panel", err);
            setIsFirebaseLoading(false);
          });
      }
    });
    return () => unsubscribe();
  }, []);

  // Set up real-time listeners for customers' live locations on active orders
  useEffect(() => {
    if (!orders.length) return;
    
    // Find all unique customer firebaseUids in orders that are not terminal (not Delivered / Cancelled)
    const activeFirebaseUids = Array.from(new Set(
      orders
        .filter(o => o.firebaseUid && !['Delivered', 'Cancelled'].includes(o.orderStatus))
        .map(o => o.firebaseUid as string)
    ));

    if (activeFirebaseUids.length === 0) return;

    // Create listeners for each active UID
    const unsubs = activeFirebaseUids.map(uid => {
      const path = `locations/${uid}`;
      return onSnapshot(doc(db, 'locations', uid), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setCustomerLocations(prev => ({
            ...prev,
            [uid]: {
              latitude: data.latitude,
              longitude: data.longitude,
              timestamp: data.timestamp
            }
          }));
        }
      }, (err) => {
        console.warn(`Failed listening to live location for user ${uid}:`, err);
      });
    });

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [orders]);

  // Geolocation watch controller for Admin/Rider
  const startRiderSharing = () => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by your browser.", "error");
      return;
    }
    if (!firebaseUser) {
      showToast("Firebase Auth not initialized.", "error");
      return;
    }

    setIsRiderSharing(true);
    setRiderSharingStatus("Initializing Rider GPS stream...");

    adminLocationWatchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const path = `locations/${firebaseUser.uid}`;
        try {
          await setDoc(doc(db, 'locations', firebaseUser.uid), {
            userId: firebaseUser.uid,
            latitude,
            longitude,
            timestamp: new Date().toISOString()
          });
          setRiderSharingStatus(`Rider Live Active: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        } catch (err: any) {
          console.error("Error writing rider location to Firestore", err);
          handleFirestoreError(err, OperationType.WRITE, path);
          setRiderSharingStatus("Database write permission denied.");
        }
      },
      (err) => {
        let errorMsg = "Rider tracking failed.";
        if (err.code === 1) {
          errorMsg = "Rider GPS permission denied.";
        } else if (err.code === 2) {
          errorMsg = "Rider GPS position unavailable.";
        } else if (err.code === 3) {
          errorMsg = "Rider GPS timeout.";
        }
        setRiderSharingStatus(errorMsg);
        showToast(errorMsg, "error");
        stopRiderSharing();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const stopRiderSharing = () => {
    if (adminLocationWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(adminLocationWatchIdRef.current);
      adminLocationWatchIdRef.current = null;
    }
    setIsRiderSharing(false);
    setRiderSharingStatus(null);
  };

  useEffect(() => {
    return () => {
      if (adminLocationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(adminLocationWatchIdRef.current);
      }
    };
  }, []);

  // Preset Meal images
  const mealPresets = [
    { name: 'Veg Meals', url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80' },
    { name: 'Special Meals', url: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=600&auto=format&fit=crop&q=80' },
    { name: 'Mini Meals', url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80' },
    { name: 'Samosa/Snacks', url: 'https://images.unsplash.com/photo-1601050690597-df056fb49785?w=600&auto=format&fit=crop&q=80' },
    { name: 'Biryani/Pulao', url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80' }
  ];

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, mealsData, ordersData, customersData, couponsData] = await Promise.all([
        api.getAdminStats(),
        api.getMeals(),
        api.getOrders(),
        api.getAdminCustomers(),
        api.getCoupons()
      ]);
      setStats(statsData);
      setMeals(mealsData);
      setOrders(ordersData.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setCustomers(customersData);
      setCoupons(couponsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load administration data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [activeTab]);

  const handleSaveMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMeal?.name || !editingMeal?.price || !editingMeal?.description) {
      showToast('Name, Price, and Description are required.', 'error');
      return;
    }
    try {
      if (editingMeal.id) {
        await api.updateMeal(editingMeal.id, editingMeal);
        showToast('Meal item updated successfully.', 'success');
      } else {
        await api.createMeal(editingMeal);
        showToast('New meal item created successfully.', 'success');
      }
      setIsMealModalOpen(false);
      setEditingMeal(null);
      loadAllData();
    } catch (err: any) {
      showToast(err.message || 'Error occurred while saving recipe', 'error');
    }
  };

  const handleDeleteMeal = async (id: string) => {
    setConfirmModal({
      message: 'Are you sure you want to delete this meal item? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await api.deleteMeal(id);
          showToast('Meal item deleted successfully.', 'success');
          loadAllData();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete meal', 'error');
        }
        setConfirmModal(null);
      }
    });
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoupon?.code || !editingCoupon?.discountType || !editingCoupon?.discountValue) {
      showToast('Coupon code, discount type, and value are required', 'error');
      return;
    }
    try {
      if (editingCoupon.id) {
        await api.updateCoupon(editingCoupon.id, editingCoupon);
        showToast('Coupon updated successfully.', 'success');
      } else {
        await api.createCoupon(editingCoupon);
        showToast('New promotion coupon created successfully.', 'success');
      }
      setIsCouponModalOpen(false);
      setEditingCoupon(null);
      loadAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save coupon', 'error');
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    setConfirmModal({
      message: 'Are you sure you want to delete this promotion coupon?',
      onConfirm: async () => {
        try {
          await api.deleteCoupon(id);
          showToast('Coupon deleted successfully.', 'success');
          loadAllData();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete coupon', 'error');
        }
        setConfirmModal(null);
      }
    });
  };

  const handleUpdateOrderStatus = async (id: string, orderStatus: string, paymentStatus?: string) => {
    try {
      const riderUidToLink = (orderStatus === 'Out for Delivery' && firebaseUser) ? firebaseUser.uid : undefined;
      await api.updateOrderStatus(id, { 
        orderStatus, 
        ...(paymentStatus ? { paymentStatus } : {}),
        ...(riderUidToLink ? { riderFirebaseUid: riderUidToLink } : {})
      });
      showToast(`Order status updated to "${orderStatus}" successfully.`, 'success');
      loadAllData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update order status', 'error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateSettings(settingsForm);
      onRefreshSettings();
      showToast('Restaurant configurations saved successfully.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save restaurant configs', 'error');
    }
  };

  const handleExportCSV = () => {
    if (!orders.length) return;
    const headers = ['Order Number', 'Date', 'Customer', 'Mobile', 'Items', 'Subtotal', 'Delivery', 'Discount', 'Grand Total', 'Payment Method', 'Payment Status', 'Order Status', 'Address'];
    const rows = orders.map(o => [
      o.orderNumber,
      new Date(o.createdAt).toLocaleDateString(),
      o.customerName,
      o.mobile,
      o.items.map(i => `${i.name} (${i.quantity}x)`).join('; '),
      o.subtotal,
      o.deliveryCharge,
      o.discount,
      o.total,
      o.paymentMethod,
      o.paymentStatus,
      o.orderStatus,
      o.address.replace(/,/g, ' ')
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Mana_Inti_Ruchulu_Orders_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Safe Image base64 conversion helper
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditingMeal(prev => ({ ...prev, image: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800">
      
      {/* Sidebar navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-200 flex flex-col border-b md:border-b-0 border-slate-800 shrink-0 shadow-lg">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{settings.logo || '🍲'}</span>
            <div>
              <h2 className="font-bold text-white tracking-wide leading-tight">Admin Console</h2>
              <span className="text-xs text-amber-500 font-semibold uppercase">{settings.name || 'Mana Inti Ruchulu'}</span>
            </div>
          </div>
          <button onClick={onLogout} className="md:hidden p-1 hover:text-red-400" title="Sign Out">
            <LogOut size={20} />
          </button>
        </div>

        <nav className="p-4 flex-1 space-y-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: Home },
            { id: 'meals', label: 'Meals Catalog', icon: Package },
            { id: 'orders', label: 'Orders Desk', icon: ClipboardList },
            { id: 'customers', label: 'Customer List', icon: Users },
            { id: 'coupons', label: 'Discount Coupons', icon: Tag },
            { id: 'settings', label: 'Restaurant Config', icon: Settings },
            { id: 'reports', label: 'Reports & CSV', icon: BarChart2 },
          ].map(item => {
            const Icon = item.icon;
            const isSel = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 font-medium transition-all text-sm ${
                  isSel ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 hidden md:block">
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800/50 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {loading && activeTab !== 'settings' ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500 text-sm">Refreshed and fetching active records...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">Synchronize Error</h3>
              <p className="text-xs">{error}</p>
              <button onClick={loadAllData} className="mt-2 text-xs font-semibold underline text-red-800">Retry Request</button>
            </div>
          </div>
        ) : (
          <div>
            {/* TAB CONTENT: DASHBOARD & METRICS */}
            {activeTab === 'dashboard' && stats && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">Performance Summary</h1>
                    <p className="text-slate-500 text-sm">Live billing updates and active kitchen statistics.</p>
                  </div>
                  <button 
                    onClick={loadAllData} 
                    className="self-start text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg font-semibold shadow-sm transition-colors"
                  >
                    Refresh Real-time Metrics
                  </button>
                </div>

                {/* Dashboard counts */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Today's Orders", val: stats.stats.todayOrders, detail: `${stats.stats.pending} pending checkout`, color: 'border-l-blue-500' },
                    { label: "Active Preparing", val: stats.stats.preparing, detail: 'Cooking in progress', color: 'border-l-amber-500' },
                    { label: "Out for Delivery", val: stats.stats.outForDelivery, detail: 'With rider', color: 'border-l-indigo-500' },
                    { label: "Completed Orders", val: stats.stats.delivered, detail: 'Successfully delivered', color: 'border-l-emerald-500' },
                    { label: "Today's Cash Flow", val: `₹${stats.stats.todayRevenue}`, detail: 'Confirmed successful payments', color: 'border-l-emerald-600 bg-emerald-50/20' },
                    { label: "Total Revenue", val: `₹${stats.stats.totalRevenue}`, detail: 'Life-time cash flow', color: 'border-l-orange-500' },
                    { label: "Active Customers", val: stats.stats.totalCustomers, detail: 'Unique registered profiles', color: 'border-l-teal-500' },
                    { label: "Average Order Value", val: `₹${stats.stats.averageOrderValue}`, detail: 'Per checkout average', color: 'border-l-purple-500' }
                  ].map((card, i) => (
                    <div key={i} className={`bg-white p-4 rounded-xl shadow-sm border-l-4 ${card.color} flex flex-col justify-between hover:shadow-md transition-shadow`}>
                      <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{card.label}</span>
                      <h3 className="text-2xl font-extrabold text-slate-900 mt-2 mb-1">{card.val}</h3>
                      <span className="text-slate-400 text-[11px] font-medium">{card.detail}</span>
                    </div>
                  ))}
                </div>

                {/* SVG Visual Sales Analytics */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  {/* Revenue Bar chart */}
                  <div className="bg-white p-5 rounded-xl shadow-sm">
                    <h3 className="font-bold text-slate-800 text-sm mb-4">Daily Sales Revenue Chart</h3>
                    <div className="h-64 flex items-end gap-3 pb-6 border-b border-slate-100 px-2">
                      {Object.entries(stats.charts.revenueByDate).slice(-7).map(([date, value]: any, index) => {
                        const maxValue = Math.max(...Object.values(stats.charts.revenueByDate) as number[], 100);
                        const heightPercent = Math.min((value / maxValue) * 100, 100);
                        return (
                          <div key={index} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                            {/* Hover Tooltip */}
                            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-xs px-2 py-1 rounded transition-opacity pointer-events-none z-10 font-bold">
                              ₹{value}
                            </div>
                            <div 
                              className="w-full bg-amber-500 hover:bg-amber-600 rounded-t transition-all cursor-pointer" 
                              style={{ height: `${heightPercent}%` }}
                            ></div>
                            <span className="text-[10px] text-slate-400 font-bold mt-2 rotate-12 origin-top-left whitespace-nowrap">
                              {date.substring(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Payment Breakdown Ring chart */}
                  <div className="bg-white p-5 rounded-xl shadow-sm flex flex-col">
                    <h3 className="font-bold text-slate-800 text-sm mb-4">Payment Methods breakdown</h3>
                    <div className="flex-1 flex flex-col md:flex-row items-center justify-around gap-4">
                      {/* Interactive circular representation */}
                      <div className="relative w-40 h-40 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                          {(() => {
                            const cod = stats.charts.paymentBreakdown.cod;
                            const online = stats.charts.paymentBreakdown.online;
                            const total = cod + online || 1;
                            const codPct = (cod / total) * 100;
                            const onlinePct = (online / total) * 100;
                            return (
                              <>
                                <circle 
                                  cx="18" cy="18" r="15.915" 
                                  fill="none" stroke="#22c55e" strokeWidth="3.2" 
                                  strokeDasharray={`${onlinePct} ${100 - onlinePct}`} 
                                  strokeDashoffset="0"
                                />
                                <circle 
                                  cx="18" cy="18" r="15.915" 
                                  fill="none" stroke="#3b82f6" strokeWidth="3.2" 
                                  strokeDasharray={`${codPct} ${100 - codPct}`} 
                                  strokeDashoffset={`-${onlinePct}`}
                                />
                              </>
                            );
                          })()}
                        </svg>
                        <div className="absolute text-center">
                          <span className="text-xs text-slate-400 uppercase font-semibold">Total Bills</span>
                          <p className="text-xl font-black text-slate-800">{stats.stats.totalOrders}</p>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-3.5 h-3.5 rounded bg-emerald-500"></div>
                          <span className="text-xs font-semibold text-slate-600">Online UPI Payments ({stats.charts.paymentBreakdown.online} orders)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3.5 h-3.5 rounded bg-blue-500"></div>
                          <span className="text-xs font-semibold text-slate-600">Cash on Delivery ({stats.charts.paymentBreakdown.cod} orders)</span>
                        </div>
                        <div className="pt-2 border-t border-slate-100 text-xs">
                          <p className="text-slate-500">UPI Cash Received: <strong className="text-slate-800 font-bold">₹{stats.charts.paymentBreakdown.onlineRevenue}</strong></p>
                          <p className="text-slate-500">COD Collected: <strong className="text-slate-800 font-bold">₹{stats.charts.paymentBreakdown.codRevenue}</strong></p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: MEALS CATALOG */}
            {activeTab === 'meals' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">Meals Catalog</h1>
                    <p className="text-slate-500 text-sm">Add, remove, configure pricing or toggles for your authentic homemade recipes.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingMeal({
                        name: '',
                        description: '',
                        price: 100,
                        image: mealPresets[0].url,
                        category: 'Meals',
                        availability: 'Available',
                        preparationTime: '20–30 mins',
                        isSpecial: false,
                        discount: 0
                      });
                      setIsMealModalOpen(true);
                    }}
                    className="self-start bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-bold shadow flex items-center gap-2 text-sm transition-all"
                  >
                    <Plus size={16} />
                    <span>Create New Meal</span>
                  </button>
                </div>

                {/* Filters Row */}
                <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col md:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search meals by name..." 
                      value={mealSearch}
                      onChange={e => setMealSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-amber-500"
                    />
                  </div>
                  <div className="w-full md:w-48">
                    <select
                      value={mealCategoryFilter}
                      onChange={e => setMealCategoryFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-amber-500"
                    >
                      <option value="">All Categories</option>
                      <option value="Meals">Meals</option>
                      <option value="Snacks">Snacks</option>
                      <option value="Beverages">Beverages</option>
                    </select>
                  </div>
                </div>

                {/* Meals Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {meals
                    .filter(m => m.name.toLowerCase().includes(mealSearch.toLowerCase()) && (!mealCategoryFilter || m.category === mealCategoryFilter))
                    .map(meal => (
                      <div key={meal.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                        <div className="h-44 relative bg-slate-100">
                          <img src={meal.image} alt={meal.name} className="w-full h-full object-cover" />
                          <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-sm uppercase ${
                              meal.availability === 'Available' ? 'bg-emerald-600' : 'bg-red-500'
                            }`}>
                              {meal.availability}
                            </span>
                            {meal.isSpecial && (
                              <span className="bg-orange-500 text-white px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm uppercase">
                                Today's Special
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-5 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-extrabold text-slate-800 text-base leading-snug">{meal.name}</h3>
                              <span className="font-black text-amber-700 text-base shrink-0">₹{meal.price}</span>
                            </div>
                            <span className="inline-block bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase mt-1">
                              {meal.category}
                            </span>
                            <p className="text-slate-500 text-xs mt-2 line-clamp-2 leading-relaxed">{meal.description}</p>
                          </div>

                          <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                              <Clock size={12} />
                              {meal.preparationTime}
                            </span>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => {
                                  setEditingMeal(meal);
                                  setIsMealModalOpen(true);
                                }}
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-50 rounded"
                                title="Edit meal"
                              >
                                <Edit size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteMeal(meal.id)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded"
                                title="Delete meal"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* TAB CONTENT: ORDERS MANAGEMENT */}
            {activeTab === 'orders' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Orders Desk</h1>
                  <p className="text-slate-500 text-sm">Dispatches kitchen workflows, accept checks, or map GPS coordinates for riders.</p>
                </div>

                {/* Rider Live Location Sharing Widget */}
                <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-5 rounded-2xl shadow-md text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                      <Truck size={24} className="text-white animate-bounce" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm tracking-wide">Rider Live Location Sharing Desk</h3>
                      <p className="text-[11px] text-amber-100 font-medium max-w-md">
                        Activate your live GPS stream. When orders are marked as <strong className="font-bold text-white">"Out for Delivery"</strong>, your live coordinates will automatically link to the order, allowing the customer to track you in real-time.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 self-start md:self-center shrink-0">
                    <button
                      type="button"
                      onClick={isRiderSharing ? stopRiderSharing : startRiderSharing}
                      className={`w-full md:w-auto px-4 py-2 rounded-xl text-xs font-bold transition-all shadow cursor-pointer flex items-center justify-center gap-1.5 ${
                        isRiderSharing
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <MapPin size={14} className={isRiderSharing ? "text-white" : "text-amber-600"} />
                      <span>{isRiderSharing ? "🔴 Disable Live GPS" : "🟢 Enable Live GPS"}</span>
                    </button>
                    {riderSharingStatus && (
                      <span className="text-[10px] text-amber-50 font-bold bg-black/20 px-2 py-0.5 rounded leading-none">
                        {riderSharingStatus}
                      </span>
                    )}
                  </div>
                </div>

                {/* Filters Row */}
                <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col md:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search orders by ID, Client name, phone..." 
                      value={orderSearch}
                      onChange={e => setOrderSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-amber-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 w-full md:w-auto">
                    <select
                      value={orderStatusFilter}
                      onChange={e => setOrderStatusFilter(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-amber-500"
                    >
                      <option value="">All Order Statuses</option>
                      <option value="Order Placed">Order Placed</option>
                      <option value="Accepted">Accepted</option>
                      <option value="Preparing">Preparing</option>
                      <option value="Ready">Ready</option>
                      <option value="Out for Delivery">Out for Delivery</option>
                      <option value="Delivered">Delivered</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                    <select
                      value={paymentStatusFilter}
                      onChange={e => setPaymentStatusFilter(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
                    >
                      <option value="">All Payment States</option>
                      <option value="Pending">Pending</option>
                      <option value="Processing">Processing</option>
                      <option value="Successful">Successful</option>
                      <option value="Failed">Failed</option>
                    </select>
                  </div>
                </div>

                {/* Orders List */}
                <div className="space-y-4">
                  {orders
                    .filter(o => {
                      const searchStr = `${o.orderNumber} ${o.customerName} ${o.mobile}`.toLowerCase();
                      const matchSearch = searchStr.includes(orderSearch.toLowerCase());
                      const matchStatus = !orderStatusFilter || o.orderStatus === orderStatusFilter;
                      const matchPayment = !paymentStatusFilter || o.paymentStatus === paymentStatusFilter;
                      return matchSearch && matchStatus && matchPayment;
                    })
                    .map(order => (
                      <div key={order.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden p-5 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-extrabold text-slate-800 text-sm tracking-wide uppercase">{order.orderNumber}</h3>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                order.orderStatus === 'Delivered' ? 'bg-emerald-100 text-emerald-800' :
                                order.orderStatus === 'Cancelled' ? 'bg-red-100 text-red-800' :
                                order.orderStatus === 'Out for Delivery' ? 'bg-indigo-100 text-indigo-800' :
                                'bg-amber-100 text-amber-800'
                              }`}>
                                {order.orderStatus}
                              </span>
                            </div>
                            <span className="text-slate-400 text-xs font-semibold">{new Date(order.createdAt).toLocaleString()}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-slate-500">Total Bill: <strong className="text-amber-700 text-sm font-black">₹{order.total}</strong></span>
                            <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                              order.paymentStatus === 'Successful' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                            }`}>
                              Payment: {order.paymentStatus}
                            </span>
                          </div>
                        </div>

                        {/* Customer & Address Detail Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1.5">
                            <h4 className="text-slate-400 uppercase font-semibold">Delivery Profile</h4>
                            <p className="font-bold text-slate-800">{order.customerName}</p>
                            <p className="font-medium text-slate-600">Verified Phone: {order.mobile}</p>
                            <p className="text-slate-500 leading-relaxed max-w-md">Address: {order.address}</p>
                            {order.latitude && order.longitude && (
                              <div className="rounded-xl overflow-hidden border border-slate-200 h-32 w-full mt-2">
                                <iframe
                                  title={`Map-order-${order.orderNumber}`}
                                  width="100%"
                                  height="100%"
                                  style={{ border: 0 }}
                                  src={`https://maps.google.com/maps?q=${order.latitude},${order.longitude}&z=15&output=embed`}
                                  allowFullScreen
                                ></iframe>
                              </div>
                            )}
                            {order.firebaseUid && customerLocations[order.firebaseUid] && (
                              <div className="space-y-1.5 mt-3 pt-2.5 border-t border-dashed border-slate-200">
                                <div className="flex items-center gap-1.5 text-xs text-rose-600 font-extrabold animate-pulse uppercase tracking-wider">
                                  <span className="w-2 h-2 bg-rose-600 rounded-full"></span>
                                  <span>Live Customer GPS Track Active!</span>
                                </div>
                                <div className="rounded-xl overflow-hidden border-2 border-rose-500 h-32 w-full">
                                  <iframe
                                    title={`Live-Map-order-${order.orderNumber}`}
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0 }}
                                    src={`https://maps.google.com/maps?q=${customerLocations[order.firebaseUid].latitude},${customerLocations[order.firebaseUid].longitude}&z=16&output=embed`}
                                    allowFullScreen
                                  ></iframe>
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                                  <span>Coords: {customerLocations[order.firebaseUid].latitude.toFixed(5)}, {customerLocations[order.firebaseUid].longitude.toFixed(5)}</span>
                                  <span>Last: {new Date(customerLocations[order.firebaseUid].timestamp).toLocaleTimeString()}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <h4 className="text-slate-400 uppercase font-semibold">Ordered Items</h4>
                            <div className="space-y-1 border border-slate-100 bg-slate-50/50 p-2 rounded-lg">
                              {order.items.map((item, i) => (
                                <div key={i} className="flex justify-between font-medium text-slate-700">
                                  <span>{item.name} <strong className="text-slate-400 text-[10px]">x{item.quantity}</strong></span>
                                  <span>₹{item.price * item.quantity}</span>
                                </div>
                              ))}
                              <div className="pt-1.5 border-t border-slate-200 flex justify-between font-bold text-slate-800">
                                <span>Grand Total</span>
                                <span>₹{order.total}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Order Management Actions Row */}
                        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                          {/* Map triggers */}
                          {order.latitude && order.longitude ? (
                            <button
                              onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${order.latitude},${order.longitude}`, '_blank')}
                              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                            >
                              <Map size={14} className="text-amber-600" />
                              <span>Open Location in Map</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No GPS coordinates recorded.</span>
                          )}

                          {/* Quick statuses */}
                          <div className="flex items-center gap-1.5 ml-auto">
                            {order.orderStatus === 'Order Placed' && (
                              <button 
                                onClick={() => handleUpdateOrderStatus(order.id, 'Accepted')}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                              >
                                Accept Order
                              </button>
                            )}
                            {order.orderStatus === 'Accepted' && (
                              <button 
                                onClick={() => handleUpdateOrderStatus(order.id, 'Preparing')}
                                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                              >
                                Start Cooking
                              </button>
                            )}
                            {order.orderStatus === 'Preparing' && (
                              <button 
                                onClick={() => handleUpdateOrderStatus(order.id, 'Ready')}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                              >
                                Mark Ready
                              </button>
                            )}
                            {order.orderStatus === 'Ready' && (
                              <button 
                                onClick={() => handleUpdateOrderStatus(order.id, 'Out for Delivery')}
                                className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                              >
                                Dispatch Rider
                              </button>
                            )}
                            {order.orderStatus === 'Out for Delivery' && (
                              <button 
                                onClick={() => handleUpdateOrderStatus(order.id, 'Delivered', 'Successful')}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                              >
                                Mark Delivered
                              </button>
                            )}
                            {order.paymentMethod === 'Cash on Delivery' && order.paymentStatus === 'Pending' && (
                              <button 
                                onClick={() => handleUpdateOrderStatus(order.id, order.orderStatus, 'Successful')}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1.5 rounded-lg text-xs border border-emerald-200"
                              >
                                Mark COD Paid
                              </button>
                            )}
                            {['Order Placed', 'Accepted', 'Preparing'].includes(order.orderStatus) && (
                              <button 
                                onClick={() => handleUpdateOrderStatus(order.id, 'Cancelled', 'Failed')}
                                className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded-lg text-xs"
                              >
                                Cancel Order
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* TAB CONTENT: CUSTOMERS DIRECTORY */}
            {activeTab === 'customers' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Customers Registry</h1>
                  <p className="text-slate-500 text-sm">Protected profiles displaying total spendings and historical interaction statistics.</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100">
                          <th className="p-4">Customer Name</th>
                          <th className="p-4">Mobile Number</th>
                          <th className="p-4">Total Orders</th>
                          <th className="p-4">Total Amount Spent</th>
                          <th className="p-4">Last Order</th>
                          <th className="p-4">Join Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {customers.map((cust, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-4 font-bold text-slate-800">{cust.name}</td>
                            <td className="p-4 text-slate-500">{cust.mobile}</td>
                            <td className="p-4">{cust.orderCount} checkouts</td>
                            <td className="p-4 font-bold text-amber-700">₹{cust.totalSpent}</td>
                            <td className="p-4 text-slate-500">{cust.lastOrderDate ? new Date(cust.lastOrderDate).toLocaleString() : 'N/A'}</td>
                            <td className="p-4 text-slate-400">{new Date(cust.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: COUPONS */}
            {activeTab === 'coupons' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">Discount Coupons</h1>
                    <p className="text-slate-500 text-sm">Create and schedule discount campaigns to increase order conversion rate.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingCoupon({
                        code: '',
                        discountType: 'percentage',
                        discountValue: 10,
                        minimumOrder: 80,
                        maximumDiscount: 50,
                        startDate: new Date().toISOString().split('T')[0],
                        endDate: '2030-12-31',
                        usageLimit: 100,
                        active: true
                      });
                      setIsCouponModalOpen(true);
                    }}
                    className="self-start bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-bold shadow flex items-center gap-2 text-sm transition-all"
                  >
                    <Plus size={16} />
                    <span>Create Promo Coupon</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {coupons.map(coupon => (
                    <div key={coupon.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col justify-between">
                      <div className="p-5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono bg-amber-50 text-amber-800 text-base font-black px-3 py-1 border border-amber-200/50 rounded uppercase">
                            {coupon.code}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            coupon.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                          }`}>
                            {coupon.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        <div className="mt-4 space-y-1 text-xs">
                          <p className="text-slate-500">
                            Discount: <strong className="text-slate-800 font-bold">{coupon.discountValue}{coupon.discountType === 'percentage' ? '%' : '₹'} Off</strong>
                          </p>
                          <p className="text-slate-500">
                            Minimum Order: <strong className="text-slate-800 font-bold">₹{coupon.minimumOrder}</strong>
                          </p>
                          <p className="text-slate-500">
                            Maximum Cap: <strong className="text-slate-800 font-bold">₹{coupon.maximumDiscount}</strong>
                          </p>
                          <p className="text-slate-500">
                            Usages: <strong className="text-slate-800 font-bold">{coupon.usedCount} / {coupon.usageLimit} times</strong>
                          </p>
                          <p className="text-slate-400 mt-2 font-semibold">
                            Period: {coupon.startDate} to {coupon.endDate}
                          </p>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-1">
                        <button 
                          onClick={() => {
                            setEditingCoupon(coupon);
                            setIsCouponModalOpen(true);
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-amber-600"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDeleteCoupon(coupon.id)}
                          className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-red-500"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB CONTENT: RESTAURANT CONFIGURATION */}
            {activeTab === 'settings' && (
              <form onSubmit={handleSaveSettings} className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Restaurant Settings</h1>
                  <p className="text-slate-500 text-sm">Configures branding, operational hours, contacts, or kitchen availability status.</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 space-y-6 max-w-4xl">
                  {/* Status toggle banner */}
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${
                    settingsForm.restaurantStatus === 'Open' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800">Operational Kitchen Status</h4>
                      <p className="text-xs text-slate-500">If toggled 'Closed', customers cannot place orders and see a beautiful offline alert.</p>
                    </div>
                    <select
                      value={settingsForm.restaurantStatus}
                      onChange={e => setSettingsForm(prev => ({ ...prev, restaurantStatus: e.target.value as any }))}
                      className={`px-4 py-2 text-xs font-bold rounded-lg border focus:outline-none ${
                        settingsForm.restaurantStatus === 'Open' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                      }`}
                    >
                      <option value="Open">🟢 Kitchen Open</option>
                      <option value="Closed">🔴 Kitchen Closed</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600">Restaurant Name</label>
                      <input 
                        type="text" 
                        value={settingsForm.name} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600">Logo Icon / Emoji</label>
                      <input 
                        type="text" 
                        value={settingsForm.logo} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, logo: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="font-bold text-slate-600">Slogan Tagline</label>
                      <input 
                        type="text" 
                        value={settingsForm.tagline} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, tagline: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600">Contact Telephone</label>
                      <input 
                        type="text" 
                        value={settingsForm.phone} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600">WhatsApp Mobile (+91...)</label>
                      <input 
                        type="text" 
                        value={settingsForm.whatsapp} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, whatsapp: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="font-bold text-slate-600">Google Map Link / Location URL</label>
                      <input 
                        type="text" 
                        value={settingsForm.address} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, address: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600">Opening Hours (e.g. 12:00 AM)</label>
                      <input 
                        type="text" 
                        value={settingsForm.openingTime} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, openingTime: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600">Closing Hours (e.g. 03:00 PM)</label>
                      <input 
                        type="text" 
                        value={settingsForm.closingTime} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, closingTime: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600">Fixed Delivery Charge (₹)</label>
                      <input 
                        type="number" 
                        value={settingsForm.deliveryCharge} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, deliveryCharge: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600">Minimum Order Subtotal Value (₹)</label>
                      <input 
                        type="number" 
                        value={settingsForm.minimumOrder} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, minimumOrder: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="font-bold text-slate-600">Merchant UPI Address (for Instant UPI Links)</label>
                      <input 
                        type="text" 
                        value={settingsForm.upiId} 
                        onChange={e => setSettingsForm(prev => ({ ...prev, upiId: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t flex justify-end">
                    <button 
                      type="submit"
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-6 py-2.5 rounded-lg text-xs tracking-wider uppercase shadow"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* TAB CONTENT: SALES REPORTS */}
            {activeTab === 'reports' && (() => {
              const successfulOrders = orders.filter(o => o.paymentStatus === 'Successful');

              // ---- 1. DAILY SALES (Last 10 Days) ----
              const dailyDataMap: Record<string, { revenue: number; count: number }> = {};
              successfulOrders.forEach(o => {
                const dStr = o.createdAt.slice(0, 10); // YYYY-MM-DD
                if (!dailyDataMap[dStr]) {
                  dailyDataMap[dStr] = { revenue: 0, count: 0 };
                }
                dailyDataMap[dStr].revenue += o.total;
                dailyDataMap[dStr].count += 1;
              });

              const dailyLabels: string[] = [];
              for (let i = 9; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dStr = d.toISOString().slice(0, 10);
                dailyLabels.push(dStr);
              }
              const dailyChartData = dailyLabels.map(dStr => {
                const item = dailyDataMap[dStr] || { revenue: 0, count: 0 };
                return {
                  period: dStr,
                  label: new Date(dStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                  revenue: item.revenue,
                  count: item.count,
                };
              });

              // ---- 2. WEEKLY SALES (Last 8 Weeks) ----
              const getStartOfWeek = (date: Date) => {
                const d = new Date(date);
                const day = d.getDay();
                const diff = d.getDate() - day; // adjust when day is sunday
                return new Date(d.setDate(diff));
              };

              const weeklyDataMap: Record<string, { revenue: number; count: number }> = {};
              successfulOrders.forEach(o => {
                const date = new Date(o.createdAt);
                const startOfWeek = getStartOfWeek(date);
                const weekStr = startOfWeek.toISOString().slice(0, 10);
                if (!weeklyDataMap[weekStr]) {
                  weeklyDataMap[weekStr] = { revenue: 0, count: 0 };
                }
                weeklyDataMap[weekStr].revenue += o.total;
                weeklyDataMap[weekStr].count += 1;
              });

              const weeklyLabels: string[] = [];
              for (let i = 7; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i * 7);
                const startOfWeek = getStartOfWeek(d);
                const weekStr = startOfWeek.toISOString().slice(0, 10);
                if (!weeklyLabels.includes(weekStr)) {
                  weeklyLabels.push(weekStr);
                }
              }
              weeklyLabels.sort();

              const weeklyChartData = weeklyLabels.map(weekStr => {
                const item = weeklyDataMap[weekStr] || { revenue: 0, count: 0 };
                const sun = new Date(weekStr);
                const sat = new Date(sun);
                sat.setDate(sun.getDate() + 6);
                return {
                  period: weekStr,
                  label: `${sun.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${sat.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
                  revenue: item.revenue,
                  count: item.count,
                };
              });

              // ---- 3. MONTHLY SALES (Last 6 Months) ----
              const monthlyDataMap: Record<string, { revenue: number; count: number }> = {};
              successfulOrders.forEach(o => {
                const mStr = o.createdAt.slice(0, 7); // YYYY-MM
                if (!monthlyDataMap[mStr]) {
                  monthlyDataMap[mStr] = { revenue: 0, count: 0 };
                }
                monthlyDataMap[mStr].revenue += o.total;
                monthlyDataMap[mStr].count += 1;
              });

              const monthlyLabels: string[] = [];
              for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const mStr = d.toISOString().slice(0, 7);
                monthlyLabels.push(mStr);
              }
              const monthlyChartData = monthlyLabels.map(mStr => {
                const item = monthlyDataMap[mStr] || { revenue: 0, count: 0 };
                const [yr, mn] = mStr.split('-');
                const date = new Date(Number(yr), Number(mn) - 1, 1);
                return {
                  period: mStr,
                  label: date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
                  revenue: item.revenue,
                  count: item.count,
                };
              });

              // Select active chart data
              const activeChartData = reportsPeriodTab === 'daily' 
                ? dailyChartData 
                : reportsPeriodTab === 'weekly' 
                ? weeklyChartData 
                : monthlyChartData;

              // Compute KPIs for the selected view
              const totalPeriodRevenue = activeChartData.reduce((sum, x) => sum + x.revenue, 0);
              const totalPeriodCount = activeChartData.reduce((sum, x) => sum + x.count, 0);
              const averagePeriodRevenue = Math.round(totalPeriodRevenue / activeChartData.length);
              
              // Find Peak Sales Period
              let peakPeriod = { label: 'N/A', revenue: 0 };
              activeChartData.forEach(x => {
                if (x.revenue > peakPeriod.revenue) {
                  peakPeriod = { label: x.label, revenue: x.revenue };
                }
              });

              // Max value for bar heights scaling
              const maxVal = Math.max(...activeChartData.map(x => x.revenue), 100);

              return (
                <div className="space-y-6 max-w-5xl">
                  {/* Top Bar with export */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900">Audits & Reports</h1>
                      <p className="text-slate-500 text-sm">Review accounting charts, financial trends, or download spreadsheet logs.</p>
                    </div>
                    <button 
                      onClick={handleExportCSV}
                      className="self-start bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg font-bold shadow flex items-center gap-2 text-sm transition-all cursor-pointer"
                    >
                      <Download size={16} />
                      <span>Export Completed CSV</span>
                    </button>
                  </div>

                  {/* Period selection tabs */}
                  <div className="flex border-b border-slate-200">
                    {[
                      { id: 'daily', label: 'Daily Sales' },
                      { id: 'weekly', label: 'Weekly Sales' },
                      { id: 'monthly', label: 'Monthly Sales' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setReportsPeriodTab(tab.id as any)}
                        className={`px-6 py-3 font-semibold text-sm border-b-2 transition-all ${
                          reportsPeriodTab === tab.id
                            ? 'border-amber-600 text-amber-700'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Reports KPI Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Sales (Period)</span>
                      <h3 className="text-xl font-extrabold text-slate-900 mt-1">₹{totalPeriodRevenue.toLocaleString('en-IN')}</h3>
                      <span className="text-slate-400 text-[10px] font-medium mt-1">For active view segments</span>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Orders Dispatched</span>
                      <h3 className="text-xl font-extrabold text-slate-900 mt-1">{totalPeriodCount} Orders</h3>
                      <span className="text-slate-400 text-[10px] font-medium mt-1">Successful deliveries/payments</span>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Peak Sales Period</span>
                      <h3 className="text-lg font-extrabold text-amber-700 mt-1 truncate" title={peakPeriod.label}>{peakPeriod.label}</h3>
                      <span className="text-slate-400 text-[10px] font-medium mt-1">Revenue: ₹{peakPeriod.revenue.toLocaleString('en-IN')}</span>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between">
                      <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Average Segment Sales</span>
                      <h3 className="text-xl font-extrabold text-slate-900 mt-1">₹{averagePeriodRevenue.toLocaleString('en-IN')}</h3>
                      <span className="text-slate-400 text-[10px] font-medium mt-1">Per {reportsPeriodTab} block</span>
                    </div>
                  </div>

                  {/* The Main Dynamic Bar Chart */}
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wide">
                        {reportsPeriodTab === 'daily' ? '10-Day Historical Revenue Chart' : 
                         reportsPeriodTab === 'weekly' ? '8-Week Dispatch Trend Chart' : 
                         '6-Month Sales Summary Chart'}
                      </h3>
                      <span className="text-[11px] font-semibold text-slate-400">Values in INR (₹)</span>
                    </div>

                    <div className="h-64 flex items-end gap-2 md:gap-4 pb-6 border-b border-slate-100 px-4 pt-4">
                      {activeChartData.map((data, index) => {
                        const heightPercent = Math.min((data.revenue / maxVal) * 100, 100);
                        return (
                          <div key={index} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                            {/* Hover Tooltip card */}
                            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-950 text-white text-[11px] px-3 py-1.5 rounded-lg shadow-xl transition-all pointer-events-none z-10 font-medium text-center border border-slate-800 whitespace-nowrap">
                              <p className="font-extrabold text-amber-500">{data.label}</p>
                              <p className="mt-0.5">Sales: <strong className="font-bold">₹{data.revenue}</strong></p>
                              <p>Volume: <strong className="font-bold">{data.count} orders</strong></p>
                            </div>

                            {/* Bar item */}
                            <div 
                              className={`w-full hover:opacity-90 rounded-t-md transition-all cursor-pointer flex flex-col justify-end overflow-hidden ${
                                data.revenue > 0 ? 'bg-amber-500 shadow-sm shadow-amber-500/20' : 'bg-slate-100'
                              }`} 
                              style={{ height: `${Math.max(heightPercent, 2)}%` }}
                            >
                              {data.revenue > 0 && heightPercent > 15 && (
                                <span className="text-[9px] text-white font-black text-center mb-1.5 rotate-90 origin-center block">
                                  ₹{data.revenue}
                                </span>
                              )}
                            </div>

                            {/* X-axis label */}
                            <span className="text-[10px] text-slate-400 font-bold mt-2 whitespace-nowrap truncate max-w-[50px] md:max-w-none" title={data.label}>
                              {data.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Period breakdown data grid table */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide">Tabular Period Breakdown</h3>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">{reportsPeriodTab} increments</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100">
                            <th className="p-3">Period Label</th>
                            <th className="p-3 text-right">Total Revenue</th>
                            <th className="p-3 text-center">Successful Orders</th>
                            <th className="p-3 text-right">Avg. Order Value</th>
                            <th className="p-3">Cash flow ratio</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {activeChartData.slice().reverse().map((data, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/40">
                              <td className="p-3 font-bold text-slate-800">{data.label}</td>
                              <td className="p-3 text-right font-black text-amber-700">₹{data.revenue.toLocaleString('en-IN')}</td>
                              <td className="p-3 text-center text-slate-500 font-bold">{data.count} checkouts</td>
                              <td className="p-3 text-right text-slate-600 font-bold">
                                ₹{data.count ? Math.round(data.revenue / data.count) : 0}
                              </td>
                              <td className="p-3">
                                <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-emerald-500 h-full" 
                                    style={{ width: `${Math.min((data.revenue / (maxVal || 1)) * 100, 100)}%` }}
                                  ></div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* General Audits & Secondary Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 space-y-3">
                      <h3 className="font-extrabold text-sm text-slate-800 uppercase">Interactive Ledger Audits</h3>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Download historical ledgers detailing verified mobile numbers, delivery timestamps, applied discount codes, and geographical check-in coordinates. Ready for upload directly into spreadsheet applications.
                      </p>
                      <button onClick={handleExportCSV} className="text-xs text-amber-600 font-bold hover:underline cursor-pointer">
                        Initiate CSV Generation &rarr;
                      </button>
                    </div>

                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 space-y-3">
                      <h3 className="font-extrabold text-sm text-slate-800 uppercase">Operational Metrics</h3>
                      <ul className="text-xs text-slate-600 space-y-2">
                        <li className="flex justify-between border-b pb-1 border-slate-100">
                          <span>Total Orders Recorded:</span>
                          <strong className="text-slate-800 font-extrabold">{orders.length}</strong>
                        </li>
                        <li className="flex justify-between border-b pb-1 border-slate-100">
                          <span>Cancelled orders rate:</span>
                          <strong className="text-slate-800 font-extrabold">
                            {orders.length ? Math.round((orders.filter(o => o.orderStatus === 'Cancelled').length / orders.length) * 100) : 0}%
                          </strong>
                        </li>
                        <li className="flex justify-between">
                          <span>Active Cash flow ratio:</span>
                          <strong className="text-emerald-700 font-extrabold">
                            ₹{orders.filter(o => o.paymentStatus === 'Successful').reduce((sum, o) => sum + o.total, 0).toLocaleString('en-IN')} collected
                          </strong>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {/* MEALS CREATION & EDIT MODAL */}
      {isMealModalOpen && editingMeal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-slate-800 text-base">
                {editingMeal.id ? 'Modify Recipe Information' : 'Add Recipe item'}
              </h3>
              <button onClick={() => setIsMealModalOpen(false)} className="p-1 hover:bg-slate-50 rounded">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMeal} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2">
                  <label className="font-bold text-slate-600">Recipe Name</label>
                  <input 
                    type="text" 
                    value={editingMeal.name || ''} 
                    onChange={e => setEditingMeal(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500"
                    placeholder="e.g. Veg Meals"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Price (₹)</label>
                  <input 
                    type="number" 
                    value={editingMeal.price || ''} 
                    onChange={e => setEditingMeal(prev => ({ ...prev, price: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Discount Discount/Deal (₹)</label>
                  <input 
                    type="number" 
                    value={editingMeal.discount || 0} 
                    onChange={e => setEditingMeal(prev => ({ ...prev, discount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="font-bold text-slate-600">Description</label>
                  <textarea 
                    value={editingMeal.description || ''} 
                    onChange={e => setEditingMeal(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg h-20 resize-none"
                    placeholder="Describe ingredients or size portion..."
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Preparation Time</label>
                  <input 
                    type="text" 
                    value={editingMeal.preparationTime || '20–30 mins'} 
                    onChange={e => setEditingMeal(prev => ({ ...prev, preparationTime: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Category</label>
                  <select 
                    value={editingMeal.category || 'Meals'} 
                    onChange={e => setEditingMeal(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="Meals">Meals</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Beverages">Beverages</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Availability</label>
                  <select 
                    value={editingMeal.availability || 'Available'} 
                    onChange={e => setEditingMeal(prev => ({ ...prev, availability: e.target.value as any }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="Available">Available</option>
                    <option value="Sold Out">Sold Out</option>
                  </select>
                </div>
                <div className="space-y-2 flex items-center pt-5 pl-2">
                  <input 
                    type="checkbox" 
                    id="isSpecial"
                    checked={editingMeal.isSpecial || false} 
                    onChange={e => setEditingMeal(prev => ({ ...prev, isSpecial: e.target.checked }))}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300"
                  />
                  <label htmlFor="isSpecial" className="ml-2 font-bold text-slate-600 cursor-pointer">Today's Special</label>
                </div>
              </div>

              {/* Image config selector */}
              <div className="space-y-2 border-t pt-3">
                <label className="font-bold text-slate-700">Recipe Banner Illustration</label>
                <div className="grid grid-cols-5 gap-2">
                  {mealPresets.map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setEditingMeal(prev => ({ ...prev, image: preset.url }))}
                      className={`h-11 rounded border overflow-hidden relative ${
                        editingMeal.image === preset.url ? 'border-amber-600 ring-2 ring-amber-500/20' : 'border-slate-200'
                      }`}
                    >
                      <img src={preset.url} alt="" className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white text-center font-bold truncate">
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5 mt-2">
                  <p className="text-[10px] text-slate-400">Or supply a direct Unsplash URL or upload local image file:</p>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Paste online image URL..." 
                      value={editingMeal.image || ''} 
                      onChange={e => setEditingMeal(prev => ({ ...prev, image: e.target.value }))}
                      className="w-full px-3 py-1.5 border rounded-lg"
                    />
                    <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border font-bold text-[10px] cursor-pointer shrink-0 flex items-center">
                      Upload
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsMealModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow"
                >
                  Save Recipe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COUPONS CREATION & EDIT MODAL */}
      {isCouponModalOpen && editingCoupon && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-slate-800 text-base">
                {editingCoupon.id ? 'Modify Campaign Details' : 'Create Promotion Campaign'}
              </h3>
              <button onClick={() => setIsCouponModalOpen(false)} className="p-1 hover:bg-slate-50 rounded">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCoupon} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-600 font-mono">Promo Code (All Caps)</label>
                <input 
                  type="text" 
                  value={editingCoupon.code || ''} 
                  onChange={e => setEditingCoupon(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 border rounded-lg uppercase"
                  placeholder="e.g. MONSOON20"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Discount Type</label>
                  <select 
                    value={editingCoupon.discountType || 'percentage'} 
                    onChange={e => setEditingCoupon(prev => ({ ...prev, discountType: e.target.value as any }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Rupees (₹)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Value</label>
                  <input 
                    type="number" 
                    value={editingCoupon.discountValue || ''} 
                    onChange={e => setEditingCoupon(prev => ({ ...prev, discountValue: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Minimum Order Subtotal (₹)</label>
                  <input 
                    type="number" 
                    value={editingCoupon.minimumOrder || 0} 
                    onChange={e => setEditingCoupon(prev => ({ ...prev, minimumOrder: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Maximum Discount Cap (₹)</label>
                  <input 
                    type="number" 
                    value={editingCoupon.maximumDiscount || 50} 
                    onChange={e => setEditingCoupon(prev => ({ ...prev, maximumDiscount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Start Campaign Date</label>
                  <input 
                    type="date" 
                    value={editingCoupon.startDate || ''} 
                    onChange={e => setEditingCoupon(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Expiration Date</label>
                  <input 
                    type="date" 
                    value={editingCoupon.endDate || ''} 
                    onChange={e => setEditingCoupon(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600">Total Usage Limits</label>
                  <input 
                    type="number" 
                    value={editingCoupon.usageLimit || 100} 
                    onChange={e => setEditingCoupon(prev => ({ ...prev, usageLimit: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="space-y-2 flex items-center pt-5 pl-2">
                  <input 
                    type="checkbox" 
                    id="active"
                    checked={editingCoupon.active || false} 
                    onChange={e => setEditingCoupon(prev => ({ ...prev, active: e.target.checked }))}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300"
                  />
                  <label htmlFor="active" className="ml-2 font-bold text-slate-600 cursor-pointer">Active Campaign</label>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsCouponModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-slate-600 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow"
                >
                  Save Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dynamic Toast Notifications */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs border font-semibold ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
          toast.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' :
          'bg-blue-50 border-blue-100 text-blue-800'
        }`}>
          {toast.type === 'success' ? '🟢' : toast.type === 'error' ? '🔴' : '🔵'}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Dynamic Custom Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white max-w-sm w-full rounded-2xl p-6 shadow-2xl border border-slate-100 text-xs text-center space-y-4">
            <h3 className="font-extrabold text-sm text-slate-800">Please Confirm</h3>
            <p className="text-slate-500 leading-relaxed">{confirmModal.message}</p>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setConfirmModal(null)}
                className="flex-1 border rounded-lg py-2.5 font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={confirmModal.onConfirm}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
