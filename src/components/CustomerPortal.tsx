import { useState, useEffect, useRef } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { api } from '../api';
import { Meal, Order, Coupon, RestaurantSettings, User, Address, CartItem, Review } from '../types';
import { 
  Home as HomeIcon, ShoppingCart, ClipboardList, User as UserIcon, Plus, Minus, Trash2, 
  MapPin, Clock, Phone, MessageSquare, Tag, Check, AlertCircle, ShoppingBag, ArrowRight, Map, LogOut, Bell, Star, Truck
} from 'lucide-react';

interface CustomerPortalProps {
  user: User | null;
  settings: RestaurantSettings;
  onLoginSuccess: (user: User, token: string) => void;
  onLogout: () => void;
}

export default function CustomerPortal({ user, settings, onLoginSuccess, onLogout }: CustomerPortalProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'cart' | 'orders' | 'profile'>('home');
  
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

  const [meals, setMeals] = useState<Meal[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reviews states
  const [selectedMealReviews, setSelectedMealReviews] = useState<Review[]>([]);
  const [reviewModalOrder, setReviewModalOrder] = useState<{ orderId: string; mealId: string; mealName: string } | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewFeedback, setReviewFeedback] = useState<string>('');
  const [reviewSubmitting, setReviewSubmitting] = useState<boolean>(false);
  const [myReviews, setMyReviews] = useState<Review[]>([]);

  // Cart state stored in local state + synced with localStorage
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('mir_cart');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('mir_cart', JSON.stringify(cart));
  }, [cart]);

  // Selected Meal for details Modal
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [detailQty, setDetailQty] = useState(1);

  useEffect(() => {
    if (selectedMeal) {
      api.getMealReviews(selectedMeal.id)
        .then(res => setSelectedMealReviews(res))
        .catch(err => console.error('Failed to load meal reviews:', err));
    } else {
      setSelectedMealReviews([]);
    }
  }, [selectedMeal]);

  // Checkout & Authentication flow states
  const [currentView, setCurrentView] = useState<'browse' | 'checkout' | 'tracking'>('browse');
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);

  // OTP Verification state
  const [authName, setAuthName] = useState('');
  const [authMobile, setAuthMobile] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [sandboxOtp, setSandboxOtp] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Checkout address & payment states
  const [deliveryAddress, setDeliveryAddress] = useState({
    fullName: '',
    mobileNumber: '',
    houseNumber: '',
    streetArea: '',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '',
    landmark: '',
    latitude: null as number | null,
    longitude: null as number | null
  });
  const [addressMsg, setAddressMsg] = useState('');
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'Cash on Delivery'>('UPI');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);

  const [addressBookForm, setAddressBookForm] = useState<Partial<Address> | null>(null);

  // Simulated Payment Modal Overlay State
  const [simulatedPayment, setSimulatedPayment] = useState<{ amount: number; rzpOrderId: string; fullAddress: string } | null>(null);

  // Real-time Order Notifications System
  const [activeNotifications, setActiveNotifications] = useState<{
    id: string;
    orderId: string;
    orderNumber: string;
    oldStatus: string;
    newStatus: string;
    message: string;
    timestamp: string;
    createdAtTime: number;
  }[]>([]);

  // Firebase Real-time Location Sharing States
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [isFirebaseLoading, setIsFirebaseLoading] = useState(true);
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [sharingStatus, setSharingStatus] = useState<string | null>(null);
  const [riderLocation, setRiderLocation] = useState<{ latitude: number; longitude: number; timestamp: string } | null>(null);
  const locationWatchIdRef = useRef<number | null>(null);

  // Initialize Firebase Anonymous Authentication
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
            console.error("Firebase Anonymous Auth failed", err);
            setIsFirebaseLoading(false);
          });
      }
    });
    return () => unsubscribe();
  }, []);

  // Periodic watch location sharing
  const startSharingLocation = () => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by your browser.", "error");
      return;
    }
    if (!firebaseUser) {
      showToast("Firebase Authentication is not ready. Please try again.", "error");
      return;
    }

    setIsSharingLocation(true);
    setSharingStatus("Initializing real-time GPS tracking...");

    locationWatchIdRef.current = navigator.geolocation.watchPosition(
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
          setSharingStatus(`Live GPS Active: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        } catch (err: any) {
          console.error("Error writing location to Firestore", err);
          handleFirestoreError(err, OperationType.WRITE, path);
          setSharingStatus("Database permission error.");
        }
      },
      (err) => {
        let errMsg = "Location tracking failed.";
        if (err.code === 1) {
          errMsg = "Location permission denied. Please allow GPS access in browser.";
        } else if (err.code === 2) {
          errMsg = "Position unavailable on your device.";
        } else if (err.code === 3) {
          errMsg = "GPS timeout.";
        }
        setSharingStatus(errMsg);
        showToast(errMsg, "error");
        stopSharingLocation();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const stopSharingLocation = () => {
    if (locationWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    }
    setIsSharingLocation(false);
    setSharingStatus(null);
  };

  // Listen to Rider's live location if order is Out for Delivery and riderFirebaseUid is set
  useEffect(() => {
    if (currentView === 'tracking' && trackingOrder?.riderFirebaseUid) {
      const path = `locations/${trackingOrder.riderFirebaseUid}`;
      const unsub = onSnapshot(doc(db, 'locations', trackingOrder.riderFirebaseUid), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setRiderLocation({
            latitude: data.latitude,
            longitude: data.longitude,
            timestamp: data.timestamp
          });
        }
      }, (err) => {
        console.warn("Failed to listen to rider live location:", err);
      });
      return () => unsub();
    } else {
      setRiderLocation(null);
    }
  }, [currentView, trackingOrder]);

  useEffect(() => {
    return () => {
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
      }
    };
  }, []);

  const orderStatusesRef = useRef<Record<string, string>>({});
  const initialLoadDoneRef = useRef(false);

  const playChimeSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain1.gain.setValueAtTime(0.12, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.6);
    } catch (e) {
      console.warn('Audio Context interaction prevented or unsupported:', e);
    }
  };

  // Poll active orders for status updates (every 5 seconds)
  useEffect(() => {
    if (!user) return;

    const intervalId = setInterval(async () => {
      try {
        const ords = await api.getOrders();
        const sortedOrds = ords.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        
        // If initial state map is empty, fill it first
        if (!initialLoadDoneRef.current) {
          sortedOrds.forEach(o => {
            orderStatusesRef.current[o.id] = o.orderStatus;
          });
          initialLoadDoneRef.current = true;
          setOrderHistory(sortedOrds);
          return;
        }

        // Check for any status changes
        let statusChanged = false;
        sortedOrds.forEach(order => {
          const prevStatus = orderStatusesRef.current[order.id];
          
          if (prevStatus && prevStatus !== order.orderStatus) {
            statusChanged = true;
            // Found a change! Map friendly text
            let bannerMsg = `Order status updated to ${order.orderStatus}`;
            if (order.orderStatus === 'Accepted') {
              bannerMsg = `🍳 Chef accepted! Order ${order.orderNumber} is confirmed.`;
            } else if (order.orderStatus === 'Preparing') {
              bannerMsg = `🔥 cooking started! Order ${order.orderNumber} is being prepared in our home kitchen.`;
            } else if (order.orderStatus === 'Ready') {
              bannerMsg = `🍱 Hot & Fresh! Order ${order.orderNumber} is packed & ready for the rider.`;
            } else if (order.orderStatus === 'Out for Delivery') {
              bannerMsg = `🛵 Rider dispatched! Order ${order.orderNumber} is Out for Delivery.`;
            } else if (order.orderStatus === 'Delivered') {
              bannerMsg = `🎉 Delicious meals delivered! Order ${order.orderNumber} is now Delivered. Enjoy!`;
            } else if (order.orderStatus === 'Cancelled') {
              bannerMsg = `❌ Order ${order.orderNumber} has been Cancelled.`;
            }

            // Play nice audio notification chime
            playChimeSound();

            // Append custom real-time notification
            const newNotif = {
              id: `notif-${Math.random().toString(36).substring(2, 9)}`,
              orderId: order.id,
              orderNumber: order.orderNumber,
              oldStatus: prevStatus,
              newStatus: order.orderStatus,
              message: bannerMsg,
              timestamp: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
              createdAtTime: Date.now()
            };

            setActiveNotifications(prev => [newNotif, ...prev]);

            // Automatically sync tracking view details in real-time
            if (trackingOrder && trackingOrder.id === order.id) {
              setTrackingOrder(order);
            }
          }
          
          // Keep current status tracked
          orderStatusesRef.current[order.id] = order.orderStatus;
        });

        if (statusChanged || sortedOrds.length !== orderHistory.length) {
          setOrderHistory(sortedOrds);
        }
      } catch (err) {
        console.warn('Real-time notification system check issue:', err);
      }
    }, 5000); // 5 seconds polling is standard, fast, and real-time feel

    return () => clearInterval(intervalId);
  }, [user, orderHistory, trackingOrder]);

  // Clean up notifications after 8 seconds dynamically
  useEffect(() => {
    if (activeNotifications.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setActiveNotifications(prev => prev.filter(n => now - n.createdAtTime < 8000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeNotifications]);

  const loadPortalData = async () => {
    setLoading(true);
    try {
      const [mealsData, couponsData] = await Promise.all([
        api.getMeals(),
        api.getCoupons()
      ]);
      setMeals(mealsData);
      setCoupons(couponsData);

      if (user) {
        const [addrs, ords, revs] = await Promise.all([
          api.getAddresses(),
          api.getOrders(),
          api.getMyReviews()
        ]);
        setAddresses(addrs);
        setOrderHistory(ords.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setMyReviews(revs);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sync application data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortalData();
    if (user) {
      setDeliveryAddress(prev => ({
        ...prev,
        fullName: prev.fullName || user.name || '',
        mobileNumber: prev.mobileNumber || user.mobile || ''
      }));
    }
  }, [user]);

  // Cart operations helpers
  const handleAddToCart = (meal: Meal, qty: number) => {
    if (meal.availability === 'Sold Out') {
      showToast('This meal is sold out for today.', 'error');
      return;
    }
    setCart(prev => {
      const idx = prev.findIndex(item => item.id === meal.id);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx].quantity += qty;
        return updated;
      }
      return [...prev, { id: meal.id, name: meal.name, price: meal.price, quantity: qty, image: meal.image }];
    });
  };

  const handleUpdateCartQty = (id: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.id === id) {
          const nextQty = item.quantity + delta;
          return nextQty > 0 ? { ...item, quantity: nextQty } : null;
        }
        return item;
      }).filter(Boolean) as CartItem[];
    });
  };

  const handleApplyCoupon = async () => {
    setCouponError(null);
    if (!couponCodeInput) return;
    try {
      const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const res = await api.validateCoupon(couponCodeInput, subtotal);
      setAppliedCoupon(res);
      showToast(`Coupon "${couponCodeInput}" applied successfully!`, 'success');
    } catch (err: any) {
      setCouponError(err.message);
      setAppliedCoupon(null);
      showToast(err.message || 'Invalid coupon code', 'error');
    }
  };

  const handleRequestOtp = async () => {
    setOtpError(null);
    if (!authMobile || !/^\+91\d{10}$/.test(authMobile)) {
      setOtpError('Please enter a valid 10-digit mobile number starting with +91');
      return;
    }
    if (!authName) {
      setOtpError('Please enter your full name');
      return;
    }
    try {
      const res = await api.sendOtp(authMobile, authName);
      setOtpSent(true);
      setOtpTimer(60);
      if (res.sandboxOtp) {
        setSandboxOtp(res.sandboxOtp);
      }
      showToast('SMS verification code sent successfully.', 'success');
    } catch (err: any) {
      setOtpError(err.message);
      showToast(err.message || 'Failed to send OTP code', 'error');
    }
  };

  const handleVerifyOtp = async () => {
    setOtpError(null);
    if (!otpCode) {
      setOtpError('Please enter the verification code');
      return;
    }
    try {
      const res = await api.verifyOtp(authMobile, otpCode, authName);
      onLoginSuccess(res.user, res.token);
      setOtpSent(false);
      setSandboxOtp(null);
      showToast('Profile authenticated successfully!', 'success');
    } catch (err: any) {
      setOtpError(err.message);
      showToast(err.message || 'OTP verification failed', 'error');
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setAddressMsg("Geolocation is not supported by your browser.");
      showToast("Geolocation is not supported by your browser.", "error");
      return;
    }
    setAddressMsg("Requesting device GPS coordinates...");
    setIsReverseGeocoding(true);
    setAddressConfirmed(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setAddressMsg(`Coordinates: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. Reverse geocoding...`);

        try {
          // OpenStreetMap Nominatim reverse geocoding API
          const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
          const res = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'ManaIntiRuchuluFoodDeliveryApp/1.0'
            }
          });
          
          if (!res.ok) throw new Error("Reverse geocoding service returned error status");
          const data = await res.json();
          
          if (data && data.address) {
            const addrDetails = data.address;
            
            // Extract fields cleanly
            const houseNum = addrDetails.house_number || addrDetails.building || '';
            const road = addrDetails.road || '';
            const suburb = addrDetails.suburb || addrDetails.neighbourhood || addrDetails.village || '';
            const area = road && suburb ? `${road}, ${suburb}` : road || suburb || '';
            
            const city = addrDetails.city || addrDetails.town || addrDetails.municipality || 'Hyderabad';
            const state = addrDetails.state || 'Telangana';
            const pincode = addrDetails.postcode || '';
            
            setDeliveryAddress(prev => ({
              ...prev,
              houseNumber: houseNum,
              streetArea: area,
              city,
              state,
              pincode,
              latitude,
              longitude
            }));
            setAddressMsg("Location successfully loaded! Review and edit address fields below.");
            showToast("Readable address fetched successfully!", "success");
          } else {
            throw new Error("No address returned from geocoder");
          }
        } catch (err: any) {
          console.warn("Reverse geocoding failed or rate limited:", err);
          // Safe fallback with mock area from coordinates
          setDeliveryAddress(prev => ({
            ...prev,
            latitude,
            longitude,
            city: 'Hyderabad',
            state: 'Telangana',
            streetArea: 'Near fetched GPS Coordinates'
          }));
          setAddressMsg(`GPS coords obtained: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. Please fill details manually.`);
          showToast("GPS coordinates loaded. Please enter address manually.", "info");
        } finally {
          setIsReverseGeocoding(false);
        }
      },
      (err) => {
        let errorMsg = "Location access denied. Please enter details manually.";
        if (err.code === 1) {
          errorMsg = "Location permission was denied. Please fill delivery address manually.";
        } else if (err.code === 2) {
          errorMsg = "Position unavailable. Please fill delivery address manually.";
        } else if (err.code === 3) {
          errorMsg = "GPS request timeout. Please fill delivery address manually.";
        }
        setAddressMsg(errorMsg);
        showToast(errorMsg, "error");
        setIsReverseGeocoding(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleChangeLocation = () => {
    setDeliveryAddress(prev => ({
      ...prev,
      houseNumber: '',
      streetArea: '',
      pincode: '',
      latitude: null,
      longitude: null
    }));
    setAddressConfirmed(false);
    setAddressMsg('');
    showToast("Location reset. Please choose a new location.", "info");
  };

  const [isPaying, setIsProcessingPayment] = useState(false);

  const handlePlaceOrder = async () => {
    if (!user) {
      showToast('Please verify your mobile number before placing your order.', 'error');
      return;
    }
    if (settings.restaurantStatus === 'Closed') {
      showToast(`${settings.name} is currently closed. Please order during our business hours (${settings.openingTime} - ${settings.closingTime}).`, 'error');
      return;
    }

    // Required fields check
    const { fullName, mobileNumber, houseNumber, streetArea, city, state, pincode, landmark } = deliveryAddress;
    if (!fullName || !mobileNumber || !houseNumber || !streetArea || !city || !state || !pincode) {
      showToast('Please fill out all required address fields: Full Name, Mobile, House/Flat, Street/Area, City, State, and Pincode.', 'error');
      return;
    }

    if (!addressConfirmed) {
      showToast('Please confirm your delivery address by tapping "Confirm Delivery Address" before placing your order.', 'error');
      return;
    }

    const fullAddress = `Recipient: ${fullName}, Mobile: ${mobileNumber}, Addr: ${houseNumber}, ${streetArea}, Landmark: ${landmark || 'N/A'}, ${city}, ${state} - ${pincode}`;

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const delCharge = settings.deliveryCharge;
    const discountAmt = appliedCoupon ? appliedCoupon.discount : 0;
    const total = (subtotal + delCharge) - discountAmt;

    // ONLINE PAYMENT GATEWAY INTEGRATION (Razorpay)
    if (paymentMethod === 'UPI') {
      setIsProcessingPayment(true);
      try {
        // 1. Create order on secure backend first
        const paymentOrder = await api.createPaymentOrder(
          cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity })),
          appliedCoupon?.code
        );

        if (!paymentOrder.success || !paymentOrder.rzpOrderId) {
          throw new Error(paymentOrder.error || "Failed to create payment order on server");
        }

        if (paymentOrder.isSimulated) {
          setSimulatedPayment({
            amount: paymentOrder.amount,
            rzpOrderId: paymentOrder.rzpOrderId,
            fullAddress
          });
          setIsProcessingPayment(false);
          return;
        }

        // 2. Configure & open Razorpay Checkout SDK Overlay
        const options = {
          key: paymentOrder.keyId,
          amount: Math.round(paymentOrder.amount * 100), // convert to paise
          currency: "INR",
          name: settings.name || "Mana Inti Ruchulu",
          description: "Authentic Home-Style Meal Delivery",
          image: settings.logo || "🍲",
          order_id: paymentOrder.rzpOrderId,
          handler: async function (response: any) {
            setIsProcessingPayment(true);
            try {
              // 3. Send checkout parameters back to backend for secure cryptographic signature validation
              const orderDetails = {
                items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
                address: fullAddress,
                paymentMethod: 'UPI',
                latitude: deliveryAddress.latitude,
                longitude: deliveryAddress.longitude,
                couponCode: appliedCoupon?.code,
                firebaseUid: firebaseUser?.uid || null
              };

              const verifiedOrder = await api.verifyPayment({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                orderDetails
              });

              // 4. Clean up state on success
              setCart([]);
              setAppliedCoupon(null);
              setTrackingOrder(verifiedOrder);
              setCurrentView('tracking');
              showToast('Payment verified successfully & order accepted!', 'success');
            } catch (err: any) {
              showToast(err.message || 'Payment signature verification failed. Please contact restaurant.', 'error');
            } finally {
              setIsProcessingPayment(false);
            }
          },
          prefill: {
            name: fullName,
            contact: mobileNumber
          },
          theme: {
            color: "#d97706" // amber-600 brand theme
          },
          modal: {
            ondismiss: function () {
              showToast('Payment window closed by user. You can retry checkout anytime.', 'info');
              setIsProcessingPayment(false);
            }
          }
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } catch (err: any) {
        showToast(err.message || "Failed to initiate online payment. Pls retry.", "error");
        setIsProcessingPayment(false);
      }
      return;
    }

    // STANDARD CASH ON DELIVERY (COD) ORDER PLACEMENT
    setIsProcessingPayment(true);
    try {
      const orderData = {
        items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
        subtotal,
        deliveryCharge: delCharge,
        discount: discountAmt,
        total,
        paymentMethod: 'Cash on Delivery' as const,
        address: fullAddress,
        latitude: deliveryAddress.latitude,
        longitude: deliveryAddress.longitude,
        couponCode: appliedCoupon?.code,
        firebaseUid: firebaseUser?.uid || null
      };

      const finalOrder = await api.createOrder(orderData);
      
      // Save address in book if it's new
      try {
        await api.saveAddress({
          address: `${houseNumber}, ${streetArea}`,
          landmark,
          city,
          state,
          pincode,
          latitude: deliveryAddress.latitude,
          longitude: deliveryAddress.longitude
        });
      } catch (addrErr) {
        console.warn('Address auto-save skipped or exists', addrErr);
      }

      setCart([]);
      setAppliedCoupon(null);
      setTrackingOrder(finalOrder);
      setCurrentView('tracking');
      showToast('COD order successfully placed!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to place order.', 'error');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleReorder = (order: Order) => {
    setCart(order.items.map(i => {
      const matchMeal = meals.find(m => m.id === i.id);
      return {
        id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        image: matchMeal?.image || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80'
      };
    }));
    setActiveTab('cart');
    setCurrentView('browse');
    showToast('Items populated into your cart. Review now!', 'success');
  };

  const handleSaveAddressBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressBookForm?.address || !addressBookForm?.pincode) return;
    try {
      if (addressBookForm.id) {
        await api.updateAddress(addressBookForm.id, addressBookForm);
        showToast('Address updated successfully.', 'success');
      } else {
        await api.saveAddress(addressBookForm);
        showToast('New address saved successfully.', 'success');
      }
      setAddressBookForm(null);
      loadPortalData();
    } catch (err: any) {
      showToast(err.message || 'Failed to save address', 'error');
    }
  };

  const handleDeleteAddress = async (id: string) => {
    setConfirmModal({
      message: 'Are you sure you want to delete this address from your book?',
      onConfirm: async () => {
        try {
          await api.deleteAddress(id);
          showToast('Address deleted successfully.', 'success');
          loadPortalData();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete address', 'error');
        }
        setConfirmModal(null);
      }
    });
  };

  const handleTrackCurrentOrder = async () => {
    if (!trackingOrder) return;
    try {
      const freshOrder = await api.getOrderById(trackingOrder.id);
      setTrackingOrder(freshOrder);
    } catch (err) {
      console.error(err);
    }
  };

  // Poll current order status
  useEffect(() => {
    if (currentView === 'tracking' && trackingOrder) {
      const interval = setInterval(() => {
        handleTrackCurrentOrder();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [currentView, trackingOrder]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalBill = (subtotal + settings.deliveryCharge) - (appliedCoupon ? appliedCoupon.discount : 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20">

      {/* REAL-TIME NOTIFICATIONS POPUP STACK */}
      {activeNotifications.length > 0 && (
        <div className="fixed top-4 inset-x-4 md:left-auto md:right-4 md:w-96 space-y-3 z-50 pointer-events-none">
          {activeNotifications.map(notif => (
            <div 
              key={notif.id} 
              className="bg-slate-950/95 backdrop-blur-md border border-slate-800 text-white p-4 rounded-2xl shadow-2xl flex items-start gap-3 pointer-events-auto transition-all duration-300 transform translate-y-0 scale-100 animate-in slide-in-from-top-4"
              style={{ contentVisibility: 'auto' }}
            >
              <div className="w-9 h-9 bg-amber-600 rounded-xl flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
                <Bell size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0 space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-amber-500 tracking-wider text-[10px] uppercase">Live Status Update!</span>
                  <span className="text-[9px] text-slate-400 font-bold">{notif.timestamp}</span>
                </div>
                <h4 className="font-bold text-slate-100 truncate">Order #{notif.orderNumber}</h4>
                <p className="text-slate-300 text-[11px] leading-relaxed font-medium">{notif.message}</p>
                
                <div className="pt-2 flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      // Dismiss this notification
                      setActiveNotifications(prev => prev.filter(n => n.id !== notif.id));
                    }}
                    className="text-[10px] text-slate-400 font-bold hover:text-white px-2 py-1 rounded"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => {
                      // Load order from DB and direct user to tracking view
                      api.getOrderById(notif.orderId).then(order => {
                        setTrackingOrder(order);
                        setCurrentView('tracking');
                        // Dismiss notification
                        setActiveNotifications(prev => prev.filter(n => n.id !== notif.id));
                      }).catch(err => {
                        console.error('Failed to load tracked order:', err);
                        // fallback using existing state if possible
                        const match = orderHistory.find(o => o.id === notif.orderId);
                        if (match) {
                          setTrackingOrder(match);
                          setCurrentView('tracking');
                        }
                      });
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold px-3 py-1 rounded-lg text-[10px] flex items-center gap-1 shadow-sm cursor-pointer"
                  >
                    🛵 Track Live Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Secure Online Payment Processing Overlay */}
      {isPaying && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4 text-white text-xs">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-extrabold tracking-wider animate-pulse uppercase text-amber-500 text-sm">Securely Contacting Payment Gateway...</p>
          <p className="text-slate-400 font-medium">Please do not refresh or close this browser window...</p>
        </div>
      )}

      {/* High-Fidelity Simulated UPI / Cards Payment Sheet Fallback */}
      {simulatedPayment && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-amber-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🍲</span>
                <div>
                  <h3 className="font-black text-sm tracking-wide">Mana Inti Ruchulu</h3>
                  <span className="text-[10px] text-amber-100 font-bold block leading-none">Simulated Secure Payment Sheet</span>
                </div>
              </div>
              <span className="bg-white/20 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase text-amber-50">Sandbox Fallback</span>
            </div>

            {/* Billing Summary */}
            <div className="p-5 space-y-4 text-xs text-slate-700">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-center space-y-1">
                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Amount Payable</p>
                <h4 className="text-2xl font-black text-amber-700">₹{simulatedPayment.amount}</h4>
                <p className="text-[10px] text-slate-400 font-semibold truncate leading-none">Order ID: {simulatedPayment.rzpOrderId}</p>
              </div>

              <div className="space-y-2">
                <p className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">Select Simulated App / Method</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'gpay', title: 'Google Pay', logo: '🟢' },
                    { id: 'phonepe', title: 'PhonePe', logo: '🟣' },
                    { id: 'paytm', title: 'Paytm', logo: '🔵' }
                  ].map((method) => (
                    <div key={method.id} className="border border-amber-200 bg-amber-50/20 p-2.5 rounded-xl text-center space-y-1 cursor-pointer">
                      <span className="text-lg block">{method.logo}</span>
                      <strong className="text-[9px] text-slate-700 font-black block leading-none">{method.title}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 text-[10px] font-medium leading-relaxed">
                <p className="font-bold text-blue-900 flex items-center gap-1 mb-0.5">💡 Why am I seeing this simulated sheet?</p>
                Our server automatically activated the fully validated Sandbox Gateway because real Razorpay keys are unconfigured or temporarily rate-limited. This maintains 100% test compatibility.
              </div>

              {/* Actions */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={async () => {
                    setIsProcessingPayment(true);
                    try {
                      const paymentId = `pay_sim_${Math.random().toString(36).substring(2, 10)}`;
                      const simulatedResponse = {
                        razorpay_payment_id: paymentId,
                        razorpay_order_id: simulatedPayment.rzpOrderId,
                        razorpay_signature: `sim_sig_${simulatedPayment.rzpOrderId}_${paymentId}`
                      };

                      const orderDetails = {
                        items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
                        address: simulatedPayment.fullAddress,
                        paymentMethod: 'UPI' as const,
                        latitude: deliveryAddress.latitude,
                        longitude: deliveryAddress.longitude,
                        couponCode: appliedCoupon?.code,
                        firebaseUid: firebaseUser?.uid || null
                      };

                      const verifiedOrder = await api.verifyPayment({
                        razorpay_payment_id: simulatedResponse.razorpay_payment_id,
                        razorpay_order_id: simulatedResponse.razorpay_order_id,
                        razorpay_signature: simulatedResponse.razorpay_signature,
                        orderDetails
                      });

                      // Clean up state on success
                      setCart([]);
                      setAppliedCoupon(null);
                      setTrackingOrder(verifiedOrder);
                      setCurrentView('tracking');
                      setSimulatedPayment(null);
                      showToast('Simulated Payment Verified successfully! Order Confirmed!', 'success');
                    } catch (err: any) {
                      showToast(err.message || 'Payment signature verification failed.', 'error');
                    } finally {
                      setIsProcessingPayment(false);
                    }
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl uppercase tracking-wider text-xs shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check size={14} />
                  <span>💸 Complete Simulated Pay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSimulatedPayment(null);
                    showToast('Payment cancelled by user.', 'info');
                  }}
                  className="w-full border hover:bg-slate-50 text-slate-500 font-bold py-2.5 rounded-xl uppercase tracking-wider text-[10px] transition-all cursor-pointer"
                >
                  Cancel & Change Method
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dev Mode OTP Banner */}
      {sandboxOtp && (
        <div className="bg-amber-500 text-slate-950 font-bold text-center py-2 px-4 text-xs animate-pulse shadow-md z-40 shrink-0 flex items-center justify-center gap-1.5 border-b border-amber-600">
          <span>🔔 Sandbox Test SMS: Verification code for {authMobile} is </span>
          <span className="bg-white px-2 py-0.5 rounded font-black text-amber-700 tracking-wider text-sm select-all">{sandboxOtp}</span>
        </div>
      )}

      {/* App Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur shadow-sm py-4 px-4 border-b border-slate-100 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-3xl">{settings.logo || '🍲'}</span>
          <div>
            <h1 className="font-extrabold text-slate-900 tracking-wide leading-tight text-base">{settings.name || 'Mana Inti Ruchulu'}</h1>
            <span className="text-[10px] text-amber-600 font-bold tracking-wide block leading-none">{settings.tagline}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
          {settings.restaurantStatus === 'Open' ? (
            <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
              Open Now
            </span>
          ) : (
            <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-full border border-red-100 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              Closed
            </span>
          )}
        </div>
      </header>

      {/* Portal Workspaces */}
      <main className="flex-1 overflow-y-auto">
        
        {/* VIEW: TRACKING ORDER */}
        {currentView === 'tracking' && trackingOrder && (
          <div className="max-w-md mx-auto p-4 space-y-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-center space-y-3">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Check size={32} />
              </div>
              <h2 className="font-extrabold text-xl text-slate-900">🎉 Order Confirmed!</h2>
              <p className="text-slate-500 text-xs">Your meal is currently being prepared with fresh homemade ingredients.</p>
              <div className="bg-slate-50 p-3 rounded-xl border font-mono text-xs text-slate-700 font-bold">
                Order ID: {trackingOrder.orderNumber}
              </div>
            </div>

            {/* Tracking Visual timeline */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
              <h3 className="font-bold text-slate-800 text-sm">Visual Delivery Tracker</h3>
              
              <div className="relative pl-8 space-y-6">
                {/* Visual Connector Line */}
                <div className="absolute top-2 left-3 bottom-2 w-0.5 bg-slate-100"></div>

                {[
                  { title: 'Order Placed', desc: 'Awaiting kitchen confirmation', stages: ['Order Placed', 'Accepted', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'] },
                  { title: 'Accepted', desc: 'Accepted by master chef', stages: ['Accepted', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered'] },
                  { title: 'Preparing', desc: 'Cooking fresh meals in progress', stages: ['Preparing', 'Ready', 'Out for Delivery', 'Delivered'] },
                  { title: 'Ready', desc: 'Meals packed and ready for dispatch', stages: ['Ready', 'Out for Delivery', 'Delivered'] },
                  { title: 'Out for Delivery', desc: 'With professional delivery partner', stages: ['Out for Delivery', 'Delivered'] },
                  { title: 'Delivered', desc: 'Successfully delivered to your location', stages: ['Delivered'] }
                ].map((step, idx) => {
                  const isDone = step.stages.includes(trackingOrder.orderStatus);
                  const isCurrent = trackingOrder.orderStatus === step.title;
                  return (
                    <div key={idx} className="relative flex gap-3 text-xs">
                      {/* Tracker Dot */}
                      <div className={`absolute -left-[25px] w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center ${
                        isCurrent ? 'bg-amber-600 border-amber-600 text-white animate-pulse' :
                        isDone ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200'
                      }`}>
                        {isDone && <Check size={10} />}
                      </div>

                      <div className="space-y-0.5">
                        <h4 className={`font-bold ${isCurrent ? 'text-amber-600 font-extrabold text-sm' : 'text-slate-800'}`}>
                          {step.title}
                        </h4>
                        <p className="text-slate-400 text-[11px] font-medium leading-none">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Real-Time Live GPS Location sharing and Tracking Card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping shrink-0"></span>
                <span>Real-Time Live Location Desk</span>
              </h3>
              
              <div className="space-y-3">
                {/* 1. Customer Live Location Sharing */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-slate-700">Share your live location</h4>
                      <p className="text-[10px] text-slate-400">Allows super admin & delivery agent to see you on the map</p>
                    </div>
                    <button
                      type="button"
                      onClick={isSharingLocation ? stopSharingLocation : startSharingLocation}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer ${
                        isSharingLocation 
                          ? 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100' 
                          : 'bg-amber-600 text-white hover:bg-amber-700'
                      }`}
                    >
                      <MapPin size={12} />
                      <span>{isSharingLocation ? "Stop Sharing" : "Share GPS Live"}</span>
                    </button>
                  </div>
                  {sharingStatus && (
                    <div className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 pt-1 bg-amber-50/50 p-2 rounded-lg border border-amber-100/50">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0"></span>
                      <span>{sharingStatus}</span>
                    </div>
                  )}
                </div>

                {/* 2. Rider Tracking Map */}
                {trackingOrder.riderFirebaseUid ? (
                  <div className="space-y-3">
                    <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex items-center gap-2.5">
                      <Truck className="text-indigo-600 animate-bounce shrink-0" size={18} />
                      <div>
                        <h4 className="font-bold text-xs text-indigo-950">Rider GPS Active!</h4>
                        <p className="text-[10px] text-indigo-700">Rider is bringing your delicious meal now.</p>
                      </div>
                    </div>

                    {riderLocation ? (
                      <div className="space-y-2">
                        <div className="rounded-xl overflow-hidden border border-slate-200 h-40 w-full relative">
                          <iframe
                            title="Rider Live GPS Map"
                            width="100%"
                            height="100%"
                            style={{ border: 0 }}
                            src={`https://maps.google.com/maps?q=${riderLocation.latitude},${riderLocation.longitude}&z=16&output=embed`}
                            allowFullScreen
                          ></iframe>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold px-1">
                          <span>Coords: {riderLocation.latitude.toFixed(5)}, {riderLocation.longitude.toFixed(5)}</span>
                          <span>Last updated: {new Date(riderLocation.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 text-center py-6 px-4 rounded-xl border text-[11px] font-medium text-slate-400">
                        ⏱️ Awaiting initial coordinate stream from rider...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 text-center py-4 px-4 rounded-xl border border-slate-100 text-[10px] text-slate-400 font-semibold">
                    Rider location tracking will unlock as soon as your order is dispatched.
                  </div>
                )}
              </div>
            </div>

            {/* Order details summary */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-3 text-xs text-slate-700">
              <h3 className="font-bold text-slate-800 border-b pb-2">Checkout Details</h3>
              <p>Customer Name: <strong className="text-slate-900 font-bold">{trackingOrder.customerName}</strong></p>
              <p>Delivery Location: <strong className="text-slate-500 font-bold">{trackingOrder.address}</strong></p>
              <p>Estimated Arrival: <strong className="text-slate-900 font-extrabold">{trackingOrder.estimatedDeliveryTime}</strong></p>
              <p>Payment: <strong className="text-slate-900 font-bold">{trackingOrder.paymentMethod} ({trackingOrder.paymentStatus})</strong></p>
              <p>Grand Total paid: <strong className="text-amber-700 text-sm font-black">₹{trackingOrder.total}</strong></p>
            </div>

            <button 
              onClick={() => {
                setCurrentView('browse');
                setActiveTab('home');
              }}
              className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 text-xs tracking-wider uppercase transition-colors"
            >
              Back to Home Catalog
            </button>
          </div>
        )}

        {/* VIEW: BROWSE CATALOGUE (Home tab) */}
        {currentView === 'browse' && activeTab === 'home' && (
          <div className="p-4 space-y-6">
            
            {/* Restaurant Offline Warning */}
            {settings.restaurantStatus === 'Closed' && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl flex items-start gap-3">
                <AlertCircle className="shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm">We are currently Offline</h3>
                  <p className="text-xs mt-1">
                    Mana Inti Ruchulu is currently closed. Please order during our active hours: <strong className="font-bold text-red-800">{settings.openingTime} to {settings.closingTime}</strong>. You can browse recipes now.
                  </p>
                </div>
              </div>
            )}

            {/* Banner coupons promotion */}
            {coupons.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider pl-1">Active Special Offers</h3>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
                  {coupons.map((coupon, i) => (
                    <div key={i} className="min-w-[240px] bg-amber-600 text-white p-4 rounded-2xl flex flex-col justify-between shrink-0 shadow-sm relative overflow-hidden">
                      {/* Decorative background circle */}
                      <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-amber-500/30 rounded-full"></div>
                      
                      <div>
                        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded uppercase font-bold tracking-wider">PROMO DISCOUNTS</span>
                        <h4 className="font-black text-base mt-1.5">{coupon.discountValue}{coupon.discountType === 'percentage' ? '%' : '₹'} FLAT OFF</h4>
                        <p className="text-[10px] text-amber-100">On order subtotals above ₹{coupon.minimumOrder}</p>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/20 pt-2.5 mt-2.5">
                        <span className="font-mono text-xs font-bold bg-white text-amber-700 px-2.5 py-1 rounded tracking-wide">{coupon.code}</span>
                        <button 
                          onClick={() => {
                            setCouponCodeInput(coupon.code);
                            setActiveTab('cart');
                          }}
                          className="text-[10px] text-white underline font-bold"
                        >
                          Apply now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Today's meals grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pl-1">
                <h2 className="font-extrabold text-slate-800 text-base">Today's Fresh Meals</h2>
                <span className="text-xs text-slate-400 font-medium">Prepared daily with love</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {meals.map(meal => (
                  <div 
                    key={meal.id} 
                    onClick={() => {
                      setSelectedMeal(meal);
                      setDetailQty(1);
                    }}
                    className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow transition-shadow flex flex-col cursor-pointer"
                  >
                    <div className="h-48 relative bg-slate-50">
                      <img src={meal.image} alt={meal.name} className="w-full h-full object-cover" />
                      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                        {meal.isSpecial && (
                          <span className="bg-orange-500 text-white px-2.5 py-1 rounded-full text-[10px] font-bold shadow uppercase">
                            Today's Special
                          </span>
                        )}
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold text-white uppercase ${
                          meal.availability === 'Available' ? 'bg-emerald-600' : 'bg-red-500'
                        }`}>
                          {meal.availability}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h3 className="font-extrabold text-slate-800 text-sm">{meal.name}</h3>
                          <span className="font-black text-amber-700 text-sm shrink-0">₹{meal.price}</span>
                        </div>
                        <p className="text-slate-500 text-xs mt-1.5 line-clamp-2 leading-relaxed">{meal.description}</p>
                        
                        {/* High-fidelity unboxed star ratings */}
                        {meal.reviewsCount !== undefined && meal.reviewsCount > 0 ? (
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mt-2">
                            <span className="text-amber-500 text-sm leading-none">★</span>
                            <span className="font-extrabold text-slate-800">{meal.rating}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-500 font-medium">{meal.reviewsCount} {meal.reviewsCount === 1 ? 'review' : 'reviews'}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mt-2">
                            <span className="text-slate-300 text-sm leading-none">★</span>
                            <span>No reviews yet</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-100 mt-3 flex items-center justify-between text-slate-400 text-[10px] font-bold">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {meal.preparationTime}
                        </span>
                        <span className="text-amber-600 font-bold underline text-[10px]">View Recipe Details &rarr;</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Why choose us Section */}
            <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100 space-y-3">
              <h3 className="font-extrabold text-slate-800 text-sm">Why Choose Mana Inti Ruchulu?</h3>
              <ul className="space-y-2 text-xs text-slate-600 font-medium">
                <li className="flex items-start gap-2">
                  <Check className="text-emerald-600 shrink-0 mt-0.5" size={14} />
                  <span>Freshly Prepared - Cooked only upon placing your order.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="text-emerald-600 shrink-0 mt-0.5" size={14} />
                  <span>Homemade Taste - Made with pure premium organic ingredients, no additives.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="text-emerald-600 shrink-0 mt-0.5" size={14} />
                  <span>Convenient Delivery - Direct to your doorstep.</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* VIEW: CART DETAILS */}
        {currentView === 'browse' && activeTab === 'cart' && (
          <div className="p-4 space-y-6 max-w-md mx-auto">
            <h2 className="font-extrabold text-slate-900 text-base pl-1">Your Food Cart</h2>

            {cart.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl shadow-sm text-center border border-slate-100 space-y-3">
                <ShoppingBag className="mx-auto text-slate-300" size={44} />
                <h3 className="font-bold text-slate-800 text-sm">Your Cart is Empty</h3>
                <p className="text-xs text-slate-400">Add home-style meals to start building your delivery order.</p>
                <button 
                  onClick={() => setActiveTab('home')}
                  className="bg-amber-600 text-white font-bold text-xs px-4 py-2 rounded-lg"
                >
                  Browse Recipe Menu
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Cart items list */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50">
                  {cart.map((item, idx) => (
                    <div key={idx} className="p-4 flex items-center gap-3">
                      <img src={item.image} alt={item.name} className="w-16 h-16 object-cover rounded-lg shrink-0 bg-slate-100" />
                      <div className="flex-1 space-y-0.5">
                        <h4 className="font-bold text-slate-800 text-xs leading-none">{item.name}</h4>
                        <span className="text-slate-400 text-[10px] font-bold">₹{item.price} each</span>
                        <p className="font-bold text-amber-700 text-xs">Total: ₹{item.price * item.quantity}</p>
                      </div>
                      <div className="flex items-center gap-1.5 border rounded-lg px-2 py-1">
                        <button onClick={() => handleUpdateCartQty(item.id, -1)} className="p-0.5 text-slate-400 hover:text-slate-700">
                          <Minus size={12} />
                        </button>
                        <span className="text-xs font-bold text-slate-800 w-4 text-center">{item.quantity}</span>
                        <button onClick={() => handleUpdateCartQty(item.id, 1)} className="p-0.5 text-slate-400 hover:text-slate-700">
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Promo Code Coupon input */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-2">
                  <label className="font-bold text-slate-600 text-xs">Apply Promotion Coupon</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g. WELCOME50" 
                      value={couponCodeInput}
                      onChange={e => setCouponCodeInput(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-2 border rounded-lg text-xs uppercase"
                    />
                    <button 
                      onClick={handleApplyCoupon}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-lg"
                    >
                      Apply
                    </button>
                  </div>
                  {couponError && <p className="text-red-500 text-[10px] font-semibold">{couponError}</p>}
                  {appliedCoupon && (
                    <div className="flex items-center justify-between bg-emerald-50 text-emerald-800 p-2 rounded-lg text-xs border border-emerald-200">
                      <span>🎉 Coupon <strong>{appliedCoupon.code}</strong> Applied successfully!</span>
                      <strong className="font-black">- ₹{appliedCoupon.discount}</strong>
                    </div>
                  )}
                </div>

                {/* Subtotal bill details */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-2.5 text-xs text-slate-600 font-medium">
                  <h3 className="font-bold text-slate-800 mb-2">Billing Breakdown</h3>
                  <div className="flex justify-between">
                    <span>Recipe Subtotal</span>
                    <span>₹{subtotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fixed Delivery Charge</span>
                    <span>₹{settings.deliveryCharge}</span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Promo Coupon Discount</span>
                      <span>- ₹{appliedCoupon.discount}</span>
                    </div>
                  )}
                  <div className="pt-2.5 border-t flex justify-between font-extrabold text-slate-900 text-sm">
                    <span>Grand Total Bill</span>
                    <span className="text-amber-700 font-black">₹{totalBill}</span>
                  </div>
                </div>

                <button 
                  onClick={() => setCurrentView('checkout')}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-1 text-xs tracking-wider uppercase shadow transition-all"
                >
                  <span>Proceed to Delivery & Checkout</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* VIEW: CHECKOUT SCREEN */}
        {currentView === 'checkout' && (
          <div className="p-4 space-y-6 max-w-md mx-auto">
            <h2 className="font-extrabold text-slate-900 text-base pl-1">Checkout & Verify</h2>

            {/* Step 1: Customer Profile OTP Authentication */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Step 1: Contact Verification</h3>
              
              {user ? (
                <div className="bg-emerald-50 text-emerald-800 p-3.5 rounded-xl border border-emerald-100 flex items-start gap-2.5 text-xs">
                  <Check className="shrink-0 mt-0.5" size={16} />
                  <div>
                    <h4 className="font-bold">Mobile verified successfully</h4>
                    <p className="mt-0.5">Welcome, {user.name} ({user.mobile})</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5 text-xs">
                  <p className="text-slate-500 leading-relaxed">Please verify your mobile number to confirm your delivery dispatch address.</p>
                  
                  {otpSent ? (
                    <div className="space-y-2.5">
                      <label className="font-bold text-slate-600 block">Verification Code (Sent via Sandbox)</label>
                      <input 
                        type="text" 
                        placeholder="6-digit code" 
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                      <div className="flex gap-2">
                        <button 
                          onClick={handleVerifyOtp}
                          className="flex-1 bg-amber-600 text-white font-bold py-2.5 rounded-lg"
                        >
                          Verify code
                        </button>
                        <button 
                          onClick={() => setOtpSent(false)}
                          className="px-3 py-2.5 border rounded-lg font-bold text-slate-500"
                        >
                          Change Number
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-600">Your Full Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Raghunatha Reddy" 
                          value={authName}
                          onChange={e => setAuthName(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-slate-600">Mobile Number (+91...)</label>
                        <input 
                          type="text" 
                          placeholder="+919951875972" 
                          value={authMobile}
                          onChange={e => setAuthMobile(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500"
                        />
                      </div>
                      <button 
                        onClick={handleRequestOtp}
                        className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-lg mt-1"
                      >
                        Request Verification Code
                      </button>
                    </div>
                  )}
                  {otpError && <p className="text-red-500 text-[10px] font-semibold">{otpError}</p>}
                </div>
              )}
            </div>

            {/* Step 2: Address entry & Geolocation */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4 text-xs">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center justify-between">
                <span>Step 2: Delivery Destination</span>
                {addressConfirmed && (
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[9px] font-bold">Confirmed</span>
                )}
              </h3>

              {/* Saved Address presets */}
              {user && addresses.length > 0 && (
                <div className="space-y-2">
                  <label className="font-bold text-slate-600 block mb-1">Use Saved Address</label>
                  <div className="grid grid-cols-1 gap-2">
                    {addresses.map((addr, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => {
                          setDeliveryAddress({
                            fullName: user.name || '',
                            mobileNumber: user.mobile || '',
                            houseNumber: addr.address.split(',')[0] || addr.address,
                            streetArea: addr.address.split(',').slice(1).join(', ') || '',
                            city: addr.city || 'Hyderabad',
                            state: addr.state || 'Telangana',
                            pincode: addr.pincode || '',
                            landmark: addr.landmark || '',
                            latitude: addr.latitude,
                            longitude: addr.longitude
                          });
                          setAddressConfirmed(true);
                          showToast('Saved address loaded successfully!', 'success');
                        }}
                        className="text-left p-2.5 border rounded-lg hover:border-amber-500 hover:bg-amber-50/20 transition-all cursor-pointer"
                      >
                        <p className="font-bold text-slate-800">{addr.address}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{addr.city}, {addr.pincode} {addr.landmark ? `(Landmark: ${addr.landmark})` : ''}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Geolocation Button */}
              <div className="space-y-2">
                <button 
                  type="button"
                  onClick={handleGetCurrentLocation}
                  disabled={isReverseGeocoding}
                  className="w-full bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-55"
                >
                  <MapPin size={15} className="text-amber-600" />
                  <span>{isReverseGeocoding ? "📍 Reverse Geocoding Address..." : "📍 Use Current Location"}</span>
                </button>
                {addressMsg && <p className="text-[10px] text-slate-500 text-center font-semibold italic">{addressMsg}</p>}
              </div>

              {/* Address Edit Fields */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block">Full Name *</label>
                    <input 
                      type="text" 
                      disabled={addressConfirmed}
                      value={deliveryAddress.fullName}
                      onChange={e => {
                        setDeliveryAddress(prev => ({ ...prev, fullName: e.target.value }));
                        setAddressConfirmed(false);
                      }}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500 bg-slate-50/50 disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="e.g. Raghunatha Reddy"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block">Mobile Number *</label>
                    <input 
                      type="text" 
                      disabled={addressConfirmed}
                      value={deliveryAddress.mobileNumber}
                      onChange={e => {
                        setDeliveryAddress(prev => ({ ...prev, mobileNumber: e.target.value }));
                        setAddressConfirmed(false);
                      }}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500 bg-slate-50/50 disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="e.g. +919951875972"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block">House/Flat Number *</label>
                    <input 
                      type="text" 
                      disabled={addressConfirmed}
                      value={deliveryAddress.houseNumber}
                      onChange={e => {
                        setDeliveryAddress(prev => ({ ...prev, houseNumber: e.target.value }));
                        setAddressConfirmed(false);
                      }}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500 bg-slate-50/50 disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="e.g. Flat 402, Gouthami Residency"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block">Street/Area Name *</label>
                    <input 
                      type="text" 
                      disabled={addressConfirmed}
                      value={deliveryAddress.streetArea}
                      onChange={e => {
                        setDeliveryAddress(prev => ({ ...prev, streetArea: e.target.value }));
                        setAddressConfirmed(false);
                      }}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500 bg-slate-50/50 disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="e.g. Madhapur Road, Kakatiya Hills"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block">Landmark (Optional)</label>
                    <input 
                      type="text" 
                      disabled={addressConfirmed}
                      value={deliveryAddress.landmark}
                      onChange={e => {
                        setDeliveryAddress(prev => ({ ...prev, landmark: e.target.value }));
                        setAddressConfirmed(false);
                      }}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500 bg-slate-50/50 disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="e.g. Near Image Hospital"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block">Postal Pincode *</label>
                    <input 
                      type="text" 
                      disabled={addressConfirmed}
                      value={deliveryAddress.pincode}
                      onChange={e => {
                        setDeliveryAddress(prev => ({ ...prev, pincode: e.target.value }));
                        setAddressConfirmed(false);
                      }}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500 bg-slate-50/50 disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="e.g. 500081"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block">City *</label>
                    <input 
                      type="text" 
                      disabled={addressConfirmed}
                      value={deliveryAddress.city}
                      onChange={e => {
                        setDeliveryAddress(prev => ({ ...prev, city: e.target.value }));
                        setAddressConfirmed(false);
                      }}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500 bg-slate-50/50 disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="Hyderabad"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block">State *</label>
                    <input 
                      type="text" 
                      disabled={addressConfirmed}
                      value={deliveryAddress.state}
                      onChange={e => {
                        setDeliveryAddress(prev => ({ ...prev, state: e.target.value }));
                        setAddressConfirmed(false);
                      }}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-amber-500 bg-slate-50/50 disabled:bg-slate-100 disabled:text-slate-500"
                      placeholder="Telangana"
                      required
                    />
                  </div>
                </div>

                {/* Mapped visual display with change location */}
                {deliveryAddress.latitude && deliveryAddress.longitude && (
                  <div className="space-y-2 mt-3 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-500 text-[10px] uppercase">📍 Mapped GPS Coordinates</span>
                      <button 
                        type="button"
                        onClick={handleChangeLocation}
                        className="text-amber-600 font-extrabold text-[10px] hover:underline cursor-pointer flex items-center gap-0.5"
                      >
                        Change Location
                      </button>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-slate-200 h-40 relative">
                      <iframe
                        title="OSM Live Delivery Location"
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        src={`https://maps.google.com/maps?q=${deliveryAddress.latitude},${deliveryAddress.longitude}&z=16&output=embed`}
                        allowFullScreen
                      ></iframe>
                    </div>
                  </div>
                )}

                {/* Confirmation Action Button */}
                <div className="pt-3 border-t border-slate-100">
                  {addressConfirmed ? (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="text-emerald-600" size={16} />
                        <span className="font-bold">Delivery Address Confirmed!</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setAddressConfirmed(false)}
                        className="text-xs text-emerald-700 underline font-semibold cursor-pointer"
                      >
                        Edit / Change Address
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const { fullName, mobileNumber, houseNumber, streetArea, city, state, pincode } = deliveryAddress;
                        if (!fullName || !mobileNumber || !houseNumber || !streetArea || !city || !state || !pincode) {
                          showToast('Please fill out all required fields marked with * before confirming.', 'error');
                        } else {
                          setAddressConfirmed(true);
                          showToast('Delivery address confirmed! You can now proceed to select payment.', 'success');
                        }
                      }}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs tracking-wider uppercase shadow-sm transition-all cursor-pointer"
                    >
                      ✔️ Confirm Delivery Address
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3: Payment select */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4 text-xs">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Step 3: Payment Method</h3>

              <div className="space-y-2.5">
                {[
                  { id: 'UPI', title: 'Online Payment', detail: 'UPI (PhonePe, Google Pay, Paytm, cards)' },
                  { id: 'Cash on Delivery', title: 'Cash on Delivery', detail: 'Direct checkout, pay cash to rider upon delivery' }
                ].map((pay, i) => {
                  const isSel = paymentMethod === pay.id;
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setPaymentMethod(pay.id as any)}
                      className={`w-full p-3.5 border rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSel ? 'border-amber-600 bg-amber-50/20 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center shrink-0">
                          {isSel && <div className="w-2.5 h-2.5 rounded-full bg-amber-600" />}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 text-xs">{pay.title}</span>
                          <p className="text-[10px] text-slate-500 mt-0.5">{pay.detail}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Complete checkout button */}
            <button
              onClick={handlePlaceOrder}
              disabled={!user}
              className={`w-full py-3.5 rounded-xl font-bold text-xs tracking-wider uppercase shadow transition-all ${
                user ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              Confirm Checkout & Place Order (₹{totalBill})
            </button>

            <button 
              onClick={() => setCurrentView('browse')}
              className="w-full text-xs text-slate-500 font-bold text-center hover:underline"
            >
              Modify items in Cart
            </button>
          </div>
        )}

        {/* VIEW: ORDERS HISTORY (Orders tab) */}
        {currentView === 'browse' && activeTab === 'orders' && (
          <div className="p-4 space-y-6 max-w-md mx-auto">
            <h2 className="font-extrabold text-slate-900 text-base pl-1">Your Historical Orders</h2>

            {!user ? (
              <div className="bg-white p-8 rounded-2xl shadow-sm text-center border border-slate-100 space-y-3 text-xs">
                <ClipboardList className="mx-auto text-slate-300" size={44} />
                <h3 className="font-bold text-slate-800">No profile verified</h3>
                <p className="text-slate-500 leading-relaxed">Verify your mobile contact number to review current status and historical dishes ordered.</p>
                <button 
                  onClick={() => {
                    setActiveTab('profile');
                  }}
                  className="bg-slate-900 text-white font-bold py-2 px-4 rounded-lg"
                >
                  Verify Profile Now
                </button>
              </div>
            ) : orderHistory.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl shadow-sm text-center border border-slate-100 space-y-2 text-xs">
                <ClipboardList className="mx-auto text-slate-300" size={44} />
                <h3 className="font-bold text-slate-800">No Orders Placed Yet</h3>
                <p className="text-slate-500 leading-relaxed">Your dishes history will reflect here as soon as you place your first order.</p>
                <button onClick={() => setActiveTab('home')} className="bg-amber-600 text-white font-bold py-2 px-4 rounded-lg mt-2">
                  Browse Menu
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {orderHistory.map(order => (
                  <div key={order.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-3 text-xs">
                    <div className="flex justify-between items-start border-b pb-2">
                      <div>
                        <h4 className="font-bold text-slate-800 uppercase font-mono tracking-wide">{order.orderNumber}</h4>
                        <span className="text-[10px] text-slate-400 font-medium">{new Date(order.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        order.orderStatus === 'Delivered' ? 'bg-emerald-50 text-emerald-800' :
                        order.orderStatus === 'Cancelled' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'
                      }`}>
                        {order.orderStatus}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {order.items.map((item, i) => (
                        <p key={i} className="text-slate-600 font-medium flex justify-between">
                          <span>{item.name} <strong className="text-slate-400">x{item.quantity}</strong></span>
                          <span>₹{item.price * item.quantity}</span>
                        </p>
                      ))}
                    </div>

                    <div className="pt-2 border-t flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-500">Total: <strong className="text-amber-700 font-black">₹{order.total}</strong></span>
                      <div className="flex gap-2">
                        {order.orderStatus !== 'Delivered' && order.orderStatus !== 'Cancelled' && (
                          <button 
                            onClick={() => {
                              setTrackingOrder(order);
                              setCurrentView('tracking');
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-2.5 py-1 rounded"
                          >
                            Track Status
                          </button>
                        )}
                        <button 
                          onClick={() => handleReorder(order)}
                          className="bg-slate-900 text-white font-bold px-2.5 py-1 rounded hover:bg-slate-800"
                        >
                          Reorder Recipe
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW: CUSTOMER PROFILE (Profile tab) */}
        {currentView === 'browse' && activeTab === 'profile' && (
          <div className="p-4 space-y-6 max-w-md mx-auto">
            <h2 className="font-extrabold text-slate-900 text-base pl-1">Your Delivery Profile</h2>

            {!user ? (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-xs text-center space-y-4">
                <UserIcon className="mx-auto text-slate-300" size={44} />
                <h3 className="font-bold text-slate-800">Please Verify Profile Mobile</h3>
                <p className="text-slate-500 leading-relaxed">Enter your mobile phone and request a sandbox SMS verification code to continue.</p>
                <button 
                  onClick={() => {
                    setCurrentView('checkout');
                  }}
                  className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-lg"
                >
                  Authenticate Mobile
                </button>
              </div>
            ) : (
              <div className="space-y-6 text-xs">
                
                {/* Profile Overview Card */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-lg font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-sm">{user.name}</h3>
                      <p className="text-slate-400 font-bold text-[10px]">Verified Number: {user.mobile}</p>
                    </div>
                  </div>
                </div>

                {/* Saved Address Book */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-bold text-slate-800">Address Book Directory</h3>
                    <button 
                      onClick={() => setAddressBookForm({ address: '', landmark: '', city: 'Hyderabad', state: 'Telangana', pincode: '' })}
                      className="text-amber-600 font-bold text-[11px] hover:underline"
                    >
                      + Add Address
                    </button>
                  </div>

                  {addressBookForm ? (
                    <form onSubmit={handleSaveAddressBook} className="space-y-3.5 border p-3 rounded-xl bg-slate-50/50">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">House/Flat No, Street</label>
                        <input 
                          type="text" 
                          value={addressBookForm.address || ''} 
                          onChange={e => setAddressBookForm(prev => ({ ...prev, address: e.target.value }))}
                          className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="font-bold text-slate-600 block">Landmark</label>
                          <input 
                            type="text" 
                            value={addressBookForm.landmark || ''} 
                            onChange={e => setAddressBookForm(prev => ({ ...prev, landmark: e.target.value }))}
                            className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-bold text-slate-600 block">Pincode</label>
                          <input 
                            type="text" 
                            value={addressBookForm.pincode || ''} 
                            onChange={e => setAddressBookForm(prev => ({ ...prev, pincode: e.target.value }))}
                            className="w-full px-2.5 py-1.5 border rounded-lg bg-white"
                            required
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-1.5 pt-2">
                        <button type="button" onClick={() => setAddressBookForm(null)} className="px-3 py-1.5 border rounded font-semibold text-slate-500 bg-white">Cancel</button>
                        <button type="submit" className="px-4 py-1.5 bg-amber-600 text-white font-bold rounded">Save</button>
                      </div>
                    </form>
                  ) : addresses.length === 0 ? (
                    <p className="text-slate-400 italic text-center py-2">No saved addresses found.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {addresses.map(addr => (
                        <div key={addr.id} className="py-2.5 flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-800">{addr.address}</p>
                            <p className="text-slate-400 font-bold text-[10px]">{addr.city}, {addr.pincode} {addr.landmark ? `(Landmark: ${addr.landmark})` : ''}</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setAddressBookForm(addr)} className="text-amber-600 font-bold">Edit</button>
                            <button onClick={() => handleDeleteAddress(addr.id)} className="text-red-500 font-bold">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Past Order History Card */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <ClipboardList size={14} className="text-amber-600" />
                      Past Orders & History
                    </h3>
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-extrabold">
                      {orderHistory.length} Total
                    </span>
                  </div>

                  {orderHistory.length === 0 ? (
                    <div className="text-center py-6 space-y-2">
                      <ShoppingBag className="mx-auto text-slate-300" size={36} />
                      <p className="text-slate-500 italic">No past orders found in your profile.</p>
                      <button 
                        onClick={() => setActiveTab('home')} 
                        className="text-amber-600 font-extrabold text-[11px] hover:underline cursor-pointer"
                      >
                        Order Some Food Now!
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                      {orderHistory.map(order => (
                        <div key={order.id} className="border border-slate-100 bg-slate-50/50 p-3.5 rounded-xl space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-extrabold text-slate-800 text-xs font-mono tracking-wider">{order.orderNumber}</p>
                              <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                                Ordered: {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                              order.orderStatus === 'Delivered' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' :
                              order.orderStatus === 'Cancelled' ? 'bg-red-50 text-red-800 border border-red-100' : 
                              'bg-amber-50 text-amber-800 border border-amber-100'
                            }`}>
                              {order.orderStatus}
                            </span>
                          </div>

                          {/* Items display with ratings */}
                          <div className="space-y-2 text-[11px] border-t border-dashed border-slate-200/60 pt-2">
                            {order.items.map((item, i) => {
                              const existingReview = myReviews.find(r => r.orderId === order.id && r.mealId === item.id);
                              return (
                                <div key={i} className="space-y-1">
                                  <div className="flex justify-between font-medium text-slate-700">
                                    <span>{item.name} <strong className="text-slate-400">x{item.quantity}</strong></span>
                                    <span>₹{item.price * item.quantity}</span>
                                  </div>
                                  
                                  {order.orderStatus === 'Delivered' && (
                                    <div className="flex justify-end text-[10px] pb-1 border-b border-slate-100/40 last:border-0">
                                      {existingReview ? (
                                        <div className="flex items-center gap-1 font-bold text-slate-500">
                                          <span>You rated:</span>
                                          <span className="text-amber-500">{"★".repeat(existingReview.rating)}</span>
                                          {existingReview.feedback && (
                                            <span className="text-slate-400 font-normal truncate max-w-[150px] italic">("{existingReview.feedback}")</span>
                                          )}
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setReviewRating(5);
                                            setReviewFeedback('');
                                            setReviewModalOrder({
                                              orderId: order.id,
                                              mealId: item.id,
                                              mealName: item.name
                                            });
                                          }}
                                          className="text-amber-600 font-extrabold hover:text-amber-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                                        >
                                          <span>★ Rate Meal & Feedback</span>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Delivery info & Quick actions */}
                          <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                            <div className="flex justify-between items-center text-[10px]">
                              <div>
                                <span className="font-bold text-slate-500">
                                  {order.orderStatus === 'Delivered' ? (
                                    <span className="text-emerald-700 font-extrabold">
                                      Delivered on: {new Date(order.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} {new Date(order.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  ) : order.orderStatus === 'Cancelled' ? (
                                    <span className="text-red-700 font-extrabold">
                                      Cancelled on: {new Date(order.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                  ) : (
                                    <span className="text-amber-700 font-bold flex items-center gap-1">
                                      <Clock size={10} /> {order.estimatedDeliveryTime || '30-40 mins'}
                                    </span>
                                  )}
                                </span>
                              </div>
                              <span className="font-black text-slate-800 text-xs">Total: ₹{order.total}</span>
                            </div>

                            <div className="flex gap-1.5 justify-end">
                              {order.orderStatus !== 'Delivered' && order.orderStatus !== 'Cancelled' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTrackingOrder(order);
                                    setCurrentView('tracking');
                                  }}
                                  className="text-[10px] font-extrabold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100/80 px-2.5 py-1 rounded-lg transition-all"
                                >
                                  Track Live
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleReorder(order)}
                                className="text-[10px] font-extrabold text-white bg-slate-900 hover:bg-slate-800 px-3 py-1 rounded-lg flex items-center gap-1 shadow-sm transition-all"
                              >
                                🔄 Reorder Quickly
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button 
                  onClick={onLogout}
                  className="w-full bg-slate-50 border hover:bg-slate-100 text-red-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                >
                  <LogOut size={16} />
                  <span>Logout Session</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MEAL DETAIL MODAL */}
      {selectedMeal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4 z-40 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden text-xs">
            <div className="h-56 relative bg-slate-50">
              <img src={selectedMeal.image} alt={selectedMeal.name} className="w-full h-full object-cover" />
              <button 
                onClick={() => setSelectedMeal(null)}
                className="absolute top-4 right-4 bg-white/80 hover:bg-white text-slate-800 p-1.5 rounded-full shadow-md font-bold"
              >
                Close &times;
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <div className="flex justify-between items-start gap-1">
                  <h3 className="font-black text-slate-800 text-base leading-snug">{selectedMeal.name}</h3>
                  <span className="font-black text-amber-700 text-base shrink-0">₹{selectedMeal.price}</span>
                </div>
                <p className="text-slate-500 text-xs mt-2 leading-relaxed">{selectedMeal.description}</p>
              </div>

              <div className="flex items-center justify-between text-slate-500 font-bold pt-3 border-t">
                <span className="flex items-center gap-1 text-[11px]">
                  <Clock size={13} className="text-slate-400" />
                  Prep-time: {selectedMeal.preparationTime}
                </span>
                <span className={`px-2.5 py-1 rounded text-[10px] uppercase text-white font-bold ${
                  selectedMeal.availability === 'Available' ? 'bg-emerald-600' : 'bg-red-500'
                }`}>
                  {selectedMeal.availability}
                </span>
              </div>

              {/* Customer Reviews & Feedback section */}
              <div className="pt-3.5 border-t space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Customer Feedback</h4>
                  {selectedMeal.reviewsCount !== undefined && selectedMeal.reviewsCount > 0 && (
                    <div className="flex items-center gap-1 font-bold text-slate-700">
                      <span className="text-amber-500 text-sm">★</span>
                      <span>{selectedMeal.rating} ({selectedMeal.reviewsCount})</span>
                    </div>
                  )}
                </div>

                {selectedMealReviews.length === 0 ? (
                  <p className="text-slate-400 italic text-[11px] py-1">No feedback left for this recipe yet. Be the first to rate it after ordering!</p>
                ) : (
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                    {selectedMealReviews.map((rev) => (
                      <div key={rev.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/50 space-y-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="font-bold text-slate-700">{rev.customerName}</span>
                          <span className="text-slate-400 font-semibold">{new Date(rev.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={`text-[11px] leading-none ${i < rev.rating ? 'text-amber-500' : 'text-slate-200'}`}>★</span>
                          ))}
                        </div>
                        {rev.feedback && (
                          <p className="text-slate-600 text-[11px] leading-relaxed font-medium">{rev.feedback}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedMeal.availability === 'Available' ? (
                <div className="pt-4 border-t flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 border rounded-xl p-1.5 shrink-0 bg-slate-50">
                    <button 
                      onClick={() => setDetailQty(prev => Math.max(prev - 1, 1))}
                      className="p-1 hover:bg-white rounded text-slate-500"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="text-slate-800 font-bold w-6 text-center text-sm">{detailQty}</span>
                    <button 
                      onClick={() => setDetailQty(prev => prev + 1)}
                      className="p-1 hover:bg-white rounded text-slate-500"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      handleAddToCart(selectedMeal, detailQty);
                      setSelectedMeal(null);
                    }}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3.5 rounded-xl uppercase tracking-wider text-[11px] shadow-sm transition-colors text-center"
                  >
                    Add to Cart (₹{selectedMeal.price * detailQty})
                  </button>
                </div>
              ) : (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl border text-center font-bold">
                  Sold Out for Today
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Mobile bottom sticky navigation bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 flex justify-around py-2.5 px-2 z-30 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] shrink-0">
        {[
          { id: 'home', label: 'Home Catalog', icon: HomeIcon },
          { id: 'cart', label: `Cart (${cart.reduce((sum, i) => sum + i.quantity, 0)})`, icon: ShoppingCart },
          { id: 'orders', label: 'My Orders', icon: ClipboardList },
          { id: 'profile', label: 'My Profile', icon: UserIcon }
        ].map(tab => {
          const Icon = tab.icon;
          const isSel = activeTab === tab.id && currentView === 'browse';
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setCurrentView('browse');
              }}
              className={`flex flex-col items-center gap-1.5 transition-colors ${
                isSel ? 'text-amber-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon size={19} className={isSel ? 'scale-110 transition-transform' : ''} />
              <span className="text-[9px] font-semibold leading-none">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Dynamic contact bubble floating widget straight from configuration */}
      <div className="fixed bottom-16 right-4 flex flex-col gap-2 z-20">
        <button
          onClick={() => window.open(`tel:${settings.phone}`, '_self')}
          className="bg-slate-900 hover:bg-slate-800 text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105 shrink-0"
          title="Call Restaurant"
        >
          <Phone size={18} />
        </button>
        <button
          onClick={() => window.open(`https://wa.me/${settings.whatsapp.replace(/\+/g, '').replace(/ /g, '')}`, '_blank')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105 shrink-0"
          title="WhatsApp Restaurant"
        >
          <MessageSquare size={18} />
        </button>
      </div>

      {/* Dynamic Toast Notifications */}
      {toast && (
        <div className={`fixed bottom-20 right-4 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs border font-semibold ${
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

      {/* RATE & REVIEW MODAL */}
      {reviewModalOrder && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in fade-in zoom-in-95 duration-200 text-xs">
            {/* Header */}
            <div className="bg-slate-900 p-5 text-white">
              <h3 className="font-black text-sm tracking-wide">🍲 Rate Your Meal</h3>
              <p className="text-[10px] text-slate-300 font-medium mt-0.5 leading-none">Share your feedback for {reviewModalOrder.mealName}</p>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 text-slate-700">
              <div className="space-y-1.5 text-center">
                <label className="font-extrabold text-slate-500 block text-[11px] uppercase tracking-wider">Select Star Rating</label>
                <div className="flex justify-center gap-1.5 py-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setReviewRating(star)}
                      className="text-2xl cursor-pointer hover:scale-110 transition-transform"
                    >
                      <span className={star <= reviewRating ? 'text-amber-500' : 'text-slate-200'}>★</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 font-bold">
                  {reviewRating === 5 ? 'Excellent, loved it! 😍' :
                   reviewRating === 4 ? 'Very Good! 😊' :
                   reviewRating === 3 ? 'Good / Average 😐' :
                   reviewRating === 2 ? 'Could be better 😕' :
                   'Disappointed 😞'}
                </p>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600">Written Feedback (Optional)</label>
                <textarea
                  placeholder="Tell us what you liked or how we can improve the recipe..."
                  rows={3}
                  value={reviewFeedback}
                  onChange={e => setReviewFeedback(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl resize-none focus:outline-slate-800 font-medium bg-slate-50"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={reviewSubmitting}
                  onClick={() => setReviewModalOrder(null)}
                  className="flex-1 border rounded-xl py-2.5 font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={reviewSubmitting}
                  onClick={async () => {
                    setReviewSubmitting(true);
                    try {
                      await api.submitReview({
                        orderId: reviewModalOrder.orderId,
                        mealId: reviewModalOrder.mealId,
                        rating: reviewRating,
                        feedback: reviewFeedback
                      });
                      
                      showToast('Thank you for rating our home kitchen! ❤️', 'success');
                      
                      // Refresh both the menu catalog list and our user review list
                      await loadPortalData();
                      
                      setReviewModalOrder(null);
                    } catch (err: any) {
                      showToast(err.message || 'Failed to submit review', 'error');
                    } finally {
                      setReviewSubmitting(false);
                    }
                  }}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {reviewSubmitting ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <span>Submit Review</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
