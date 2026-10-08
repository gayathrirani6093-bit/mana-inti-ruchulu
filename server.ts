import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholderKeyId',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_placeholderKeySecret',
});

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '10mb' }));

// Database initialization & structures
const DB_FILE = path.resolve(process.cwd(), 'data', 'db.json');

interface User {
  id: string;
  name: string;
  mobile: string;
  mobileVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Admin {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

interface Meal {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  availability: 'Available' | 'Sold Out';
  preparationTime: string;
  isSpecial: boolean;
  discount: number; // percentage or fixed amount
  rating?: number;
  reviewsCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  mobile: string;
  items: OrderItem[];
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  total: number;
  paymentMethod: 'UPI' | 'Cash on Delivery';
  paymentStatus: 'Pending' | 'Processing' | 'Successful' | 'Failed' | 'Refunded';
  orderStatus: 'Order Placed' | 'Accepted' | 'Preparing' | 'Ready' | 'Out for Delivery' | 'Delivered' | 'Cancelled';
  address: string;
  latitude: number | null;
  longitude: number | null;
  estimatedDeliveryTime: string;
  transactionId?: string;
  firebaseUid?: string | null;
  riderFirebaseUid?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Address {
  id: string;
  customerId: string;
  address: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minimumOrder: number;
  maximumDiscount: number;
  startDate: string;
  endDate: string;
  usageLimit: number;
  usedCount: number;
  active: boolean;
}

interface RestaurantSettings {
  name: string;
  logo: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  address: string;
  email: string;
  openingTime: string;
  closingTime: string;
  deliveryCharge: number;
  minimumOrder: number;
  deliveryRadius: number;
  upiId: string;
  restaurantStatus: 'Open' | 'Closed';
}

interface Payment {
  id: string;
  orderId: string;
  paymentMethod: string;
  amount: number;
  status: string;
  transactionId: string;
  createdAt: string;
  updatedAt: string;
}

interface OTPRecord {
  mobile: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

interface Session {
  token: string;
  userId: string;
  role: 'customer' | 'admin';
  createdAt: string;
}

interface Review {
  id: string;
  mealId: string;
  orderId: string;
  customerId: string;
  customerName: string;
  rating: number; // 1-5
  feedback: string;
  createdAt: string;
}

interface Database {
  users: User[];
  admins: Admin[];
  meals: Meal[];
  orders: Order[];
  addresses: Address[];
  coupons: Coupon[];
  settings: RestaurantSettings;
  payments: Payment[];
  otps: OTPRecord[];
  sessions: Session[];
  reviews: Review[];
}

// Default Data Initializer
const DEFAULT_MEALS: Meal[] = [
  {
    id: 'meal-1',
    name: 'Veg Meals',
    description: 'Freshly prepared homemade vegetarian meal. Contains rice, dal, fry curry, wet curry, sambar, rasam, curd, and papad.',
    price: 100,
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
    category: 'Meals',
    availability: 'Available',
    preparationTime: '20–30 minutes',
    isSpecial: false,
    discount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'meal-2',
    name: 'Special Meals',
    description: 'Premium home-style meal. Includes standard veg meals items plus special flavored rice (puliora/biryani), sweet, paneer curry, and extra ghee.',
    price: 150,
    image: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=600&auto=format&fit=crop&q=80',
    category: 'Meals',
    availability: 'Available',
    preparationTime: '25–35 minutes',
    isSpecial: true,
    discount: 10, // ₹10 discount as a default deal
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'meal-3',
    name: 'Mini Meals',
    description: 'Light-weight home-style vegetarian meal. Perfect for a quick bite. Contains rice, dal or sambar, curry, and pickle.',
    price: 80,
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80',
    category: 'Meals',
    availability: 'Available',
    preparationTime: '15–20 minutes',
    isSpecial: false,
    discount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

const DEFAULT_COUPONS: Coupon[] = [
  {
    id: 'coupon-1',
    code: 'WELCOME50',
    discountType: 'percentage',
    discountValue: 20, // 20% off
    minimumOrder: 100,
    maximumDiscount: 50,
    startDate: '2026-01-01',
    endDate: '2027-12-31',
    usageLimit: 1000,
    usedCount: 12,
    active: true
  },
  {
    id: 'coupon-2',
    code: 'INTI10',
    discountType: 'fixed',
    discountValue: 10, // ₹10 flat off
    minimumOrder: 80,
    maximumDiscount: 10,
    startDate: '2026-01-01',
    endDate: '2027-12-31',
    usageLimit: 1000,
    usedCount: 45,
    active: true
  }
];

const DEFAULT_SETTINGS: RestaurantSettings = {
  name: 'Mana Inti Ruchulu',
  logo: '🍲',
  tagline: 'Inti Ruchi • Fresh Meals • Affordable • Delivered',
  phone: '+91 99518 75972',
  whatsapp: '+91 99518 75972',
  address: 'https://maps.app.goo.gl/v6KQjPeEVyjxZXSy5?g_st=ac',
  email: 'raghunathareddy890@gmail.com',
  openingTime: '12:00 AM', // Opening time from requirements
  closingTime: '03:00 PM', // Closing time from requirements (example: 12 AM–3 PM)
  deliveryCharge: 20,
  minimumOrder: 80,
  deliveryRadius: 10,
  upiId: 'raghunathareddy890@okaxis',
  restaurantStatus: 'Open'
};

const DEFAULT_ADMINS: Admin[] = [
  {
    id: 'admin-1',
    email: 'gayathrirani6093@gmail.com',
    role: 'super_admin',
    createdAt: new Date().toISOString()
  }
];

const DEFAULT_DB: Database = {
  users: [
    {
      id: 'user-demo',
      name: 'Raghunatha Reddy',
      mobile: '+919951875972',
      mobileVerified: true,
      createdAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-20T10:00:00.000Z'
    }
  ],
  admins: DEFAULT_ADMINS,
  meals: DEFAULT_MEALS,
  orders: [
    {
      id: 'order-demo-1',
      orderNumber: 'MIR-20260921-0001',
      customerId: 'user-demo',
      customerName: 'Raghunatha Reddy',
      mobile: '+919951875972',
      items: [
        { id: 'meal-1', name: 'Veg Meals', price: 100, quantity: 2 }
      ],
      subtotal: 200,
      deliveryCharge: 20,
      discount: 20,
      total: 200, // (200 + 20) - 20
      paymentMethod: 'UPI',
      paymentStatus: 'Successful',
      orderStatus: 'Delivered',
      address: 'Flat 402, Gouthami Residency, Madhapur, Hyderabad, Telangana - 500081',
      latitude: 17.4483,
      longitude: 78.3915,
      estimatedDeliveryTime: '30 mins',
      createdAt: '2026-09-21T13:30:00.000Z',
      updatedAt: '2026-09-21T14:00:00.000Z'
    },
    {
      id: 'order-demo-2',
      orderNumber: 'MIR-20260922-0002',
      customerId: 'user-demo',
      customerName: 'Raghunatha Reddy',
      mobile: '+919951875972',
      items: [
        { id: 'meal-2', name: 'Special Meals', price: 150, quantity: 1 }
      ],
      subtotal: 150,
      deliveryCharge: 20,
      discount: 0,
      total: 170,
      paymentMethod: 'Cash on Delivery',
      paymentStatus: 'Pending',
      orderStatus: 'Preparing',
      address: 'H No 4-12, Near Temple, Kukatpally, Hyderabad, Telangana - 500072',
      latitude: 17.4841,
      longitude: 78.4011,
      estimatedDeliveryTime: '25 mins',
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
      updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString()
    }
  ],
  addresses: [
    {
      id: 'addr-1',
      customerId: 'user-demo',
      address: 'Flat 402, Gouthami Residency, Madhapur',
      landmark: 'Near Image Hospital',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500081',
      latitude: 17.4483,
      longitude: 78.3915,
      createdAt: '2026-09-20T10:05:00.000Z'
    }
  ],
  coupons: DEFAULT_COUPONS,
  settings: DEFAULT_SETTINGS,
  payments: [
    {
      id: 'pay-1',
      orderId: 'order-demo-1',
      paymentMethod: 'UPI',
      amount: 200,
      status: 'Successful',
      transactionId: 'TXN-9951875972001',
      createdAt: '2026-09-21T13:31:00.000Z',
      updatedAt: '2026-09-21T13:31:00.000Z'
    }
  ],
  otps: [],
  sessions: [],
  reviews: [
    {
      id: 'rev-demo-1',
      mealId: 'meal-1',
      orderId: 'order-demo-1',
      customerId: 'user-demo',
      customerName: 'Raghunatha Reddy',
      rating: 5,
      feedback: 'Very delicious homemade veg meals. Reminds me of home!',
      createdAt: '2026-09-21T14:15:00.000Z'
    }
  ]
};

// Database Read/Write helpers
function initDb() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
  }
}

function readDb(): Database {
  initDb();
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const db = JSON.parse(data);
    if (!db.reviews) {
      db.reviews = [];
    }
    return db;
  } catch (error) {
    console.error('Error reading DB, resetting to default', error);
    return DEFAULT_DB;
  }
}

function writeDb(data: Database) {
  initDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Init database now
initDb();

// Authentication middleware
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }
  
  const token = authHeader.substring(7);
  const db = readDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
  }
  
  // Attach user identity to request
  (req as any).user = {
    id: session.userId,
    role: session.role
  };
  next();
}

// Require Admin authorization
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
}

// API ENDPOINTS

// 1. Restaurant Settings
app.get('/api/settings', (req, res) => {
  const db = readDb();
  res.json(db.settings);
});

app.put('/api/settings', authenticate, requireAdmin, (req, res) => {
  const db = readDb();
  db.settings = { ...db.settings, ...req.body };
  writeDb(db);
  res.json(db.settings);
});

// 2. Meals Management
app.get('/api/meals', (req, res) => {
  const db = readDb();
  const mealsWithRating = db.meals.map(meal => {
    const mealReviews = db.reviews.filter(r => r.mealId === meal.id);
    const reviewsCount = mealReviews.length;
    let rating = 0;
    if (reviewsCount > 0) {
      const sum = mealReviews.reduce((acc, r) => acc + r.rating, 0);
      rating = Math.round((sum / reviewsCount) * 10) / 10; // round to 1 decimal place
    }
    return {
      ...meal,
      rating,
      reviewsCount
    };
  });
  res.json(mealsWithRating);
});

// Reviews and Ratings Management
app.post('/api/reviews', authenticate, (req, res) => {
  const { orderId, mealId, rating, feedback } = req.body;
  const user = (req as any).user;

  if (!orderId || !mealId || !rating) {
    return res.status(400).json({ error: 'Order ID, Meal ID, and Rating are required' });
  }

  const numRating = Number(rating);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
  }

  const db = readDb();
  
  // Find order
  const order = db.orders.find(o => o.id === orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Verify order belongs to customer
  if (order.customerId !== user.id) {
    return res.status(403).json({ error: 'Forbidden: You cannot review items for another customer\'s order' });
  }

  // Verify order is Delivered
  if (order.orderStatus !== 'Delivered') {
    return res.status(400).json({ error: 'You can only review items for delivered orders' });
  }

  // Verify meal belongs to the order
  const hasItem = order.items.some(item => item.id === mealId);
  if (!hasItem) {
    return res.status(400).json({ error: 'This item was not part of the specified order' });
  }

  // Prevent duplicate reviews
  const alreadyReviewed = db.reviews.some(r => r.orderId === orderId && r.mealId === mealId);
  if (alreadyReviewed) {
    return res.status(400).json({ error: 'You have already reviewed this item for this order' });
  }

  const customer = db.users.find(u => u.id === user.id);
  const customerName = customer ? customer.name : 'Verified Customer';

  const newReview: Review = {
    id: `rev-${crypto.randomBytes(4).toString('hex')}`,
    mealId,
    orderId,
    customerId: user.id,
    customerName,
    rating: numRating,
    feedback: feedback || '',
    createdAt: new Date().toISOString()
  };

  db.reviews.push(newReview);
  writeDb(db);

  res.status(201).json(newReview);
});

app.get('/api/meals/:id/reviews', (req, res) => {
  const db = readDb();
  const mealReviews = db.reviews.filter(r => r.mealId === req.params.id);
  mealReviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(mealReviews);
});

app.get('/api/reviews/me', authenticate, (req, res) => {
  const user = (req as any).user;
  const db = readDb();
  const userReviews = db.reviews.filter(r => r.customerId === user.id);
  res.json(userReviews);
});

app.post('/api/meals', authenticate, requireAdmin, (req, res) => {
  const { name, description, price, image, category, availability, preparationTime, isSpecial, discount } = req.body;
  if (!name || !price || !description) {
    return res.status(400).json({ error: 'Name, price, and description are required' });
  }
  
  const db = readDb();
  const newMeal: Meal = {
    id: `meal-${crypto.randomBytes(4).toString('hex')}`,
    name,
    description,
    price: Number(price),
    image: image || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
    category: category || 'Meals',
    availability: availability || 'Available',
    preparationTime: preparationTime || '20–30 mins',
    isSpecial: !!isSpecial,
    discount: Number(discount) || 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  db.meals.push(newMeal);
  writeDb(db);
  res.status(201).json(newMeal);
});

app.put('/api/meals/:id', authenticate, requireAdmin, (req, res) => {
  const db = readDb();
  const mealIndex = db.meals.findIndex(m => m.id === req.params.id);
  
  if (mealIndex === -1) {
    return res.status(404).json({ error: 'Meal not found' });
  }
  
  const updatedMeal: Meal = {
    ...db.meals[mealIndex],
    ...req.body,
    price: req.body.price !== undefined ? Number(req.body.price) : db.meals[mealIndex].price,
    discount: req.body.discount !== undefined ? Number(req.body.discount) : db.meals[mealIndex].discount,
    updatedAt: new Date().toISOString()
  };
  
  db.meals[mealIndex] = updatedMeal;
  writeDb(db);
  res.json(updatedMeal);
});

app.delete('/api/meals/:id', authenticate, requireAdmin, (req, res) => {
  const db = readDb();
  const mealIndex = db.meals.findIndex(m => m.id === req.params.id);
  
  if (mealIndex === -1) {
    return res.status(404).json({ error: 'Meal not found' });
  }
  
  db.meals.splice(mealIndex, 1);
  writeDb(db);
  res.json({ success: true, message: 'Meal deleted successfully' });
});

// 3. Coupon Management
app.get('/api/coupons', (req, res) => {
  const db = readDb();
  // If authorization header matches admin session, send all coupons.
  // Otherwise, only send active coupons.
  let isAdmin = false;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const session = db.sessions.find(s => s.token === token);
    if (session && session.role === 'admin') {
      isAdmin = true;
    }
  }

  if (isAdmin) {
    res.json(db.coupons);
  } else {
    // Only send non-expired active coupons for customers
    const todayStr = new Date().toISOString().split('T')[0];
    const activeCoupons = db.coupons.filter(c => c.active && todayStr >= c.startDate && todayStr <= c.endDate);
    res.json(activeCoupons);
  }
});

app.post('/api/coupons', authenticate, requireAdmin, (req, res) => {
  const { code, discountType, discountValue, minimumOrder, maximumDiscount, startDate, endDate, usageLimit, active } = req.body;
  if (!code || !discountType || !discountValue) {
    return res.status(400).json({ error: 'Code, discount type, and discount value are required' });
  }
  
  const db = readDb();
  // Check if code already exists
  if (db.coupons.some(c => c.code.toUpperCase() === code.toUpperCase())) {
    return res.status(400).json({ error: 'Coupon code already exists' });
  }

  const newCoupon: Coupon = {
    id: `coupon-${crypto.randomBytes(4).toString('hex')}`,
    code: code.toUpperCase(),
    discountType,
    discountValue: Number(discountValue),
    minimumOrder: Number(minimumOrder) || 0,
    maximumDiscount: Number(maximumDiscount) || Number(discountValue),
    startDate: startDate || new Date().toISOString().split('T')[0],
    endDate: endDate || '2030-12-31',
    usageLimit: Number(usageLimit) || 9999,
    usedCount: 0,
    active: active !== undefined ? !!active : true
  };
  
  db.coupons.push(newCoupon);
  writeDb(db);
  res.status(201).json(newCoupon);
});

app.put('/api/coupons/:id', authenticate, requireAdmin, (req, res) => {
  const db = readDb();
  const index = db.coupons.findIndex(c => c.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Coupon not found' });
  }
  
  const updatedCoupon: Coupon = {
    ...db.coupons[index],
    ...req.body,
    discountValue: req.body.discountValue !== undefined ? Number(req.body.discountValue) : db.coupons[index].discountValue,
    minimumOrder: req.body.minimumOrder !== undefined ? Number(req.body.minimumOrder) : db.coupons[index].minimumOrder,
    maximumDiscount: req.body.maximumDiscount !== undefined ? Number(req.body.maximumDiscount) : db.coupons[index].maximumDiscount,
    usageLimit: req.body.usageLimit !== undefined ? Number(req.body.usageLimit) : db.coupons[index].usageLimit
  };
  
  db.coupons[index] = updatedCoupon;
  writeDb(db);
  res.json(updatedCoupon);
});

app.delete('/api/coupons/:id', authenticate, requireAdmin, (req, res) => {
  const db = readDb();
  const index = db.coupons.findIndex(c => c.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Coupon not found' });
  }
  
  db.coupons.splice(index, 1);
  writeDb(db);
  res.json({ success: true, message: 'Coupon deleted successfully' });
});

// Validate Coupon (during checkout)
app.post('/api/coupons/validate', (req, res) => {
  const { code, subtotal } = req.body;
  if (!code || !subtotal) {
    return res.status(400).json({ error: 'Code and subtotal are required' });
  }
  
  const db = readDb();
  const coupon = db.coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
  
  if (!coupon) {
    return res.status(400).json({ error: 'Invalid coupon code' });
  }
  
  if (!coupon.active) {
    return res.status(400).json({ error: 'This coupon is inactive' });
  }
  
  const todayStr = new Date().toISOString().split('T')[0];
  if (todayStr < coupon.startDate || todayStr > coupon.endDate) {
    return res.status(400).json({ error: 'This coupon has expired' });
  }
  
  if (subtotal < coupon.minimumOrder) {
    return res.status(400).json({ error: `Minimum order subtotal must be ₹${coupon.minimumOrder} to use this coupon` });
  }
  
  if (coupon.usedCount >= coupon.usageLimit) {
    return res.status(400).json({ error: 'This coupon usage limit has been reached' });
  }
  
  // Calculate discount
  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = Math.round((subtotal * coupon.discountValue) / 100);
    if (discount > coupon.maximumDiscount) {
      discount = coupon.maximumDiscount;
    }
  } else {
    discount = coupon.discountValue;
  }
  
  res.json({
    success: true,
    code: coupon.code,
    discount,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue
  });
});

// 4. CUSTOMER AUTHENTICATION (OTP Logic)
app.post('/api/auth/send-otp', (req, res) => {
  const { mobile, name } = req.body;
  if (!mobile || !/^\+91\d{10}$/.test(mobile)) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number with +91' });
  }
  
  const db = readDb();
  
  // Generate a random 6-digit OTP code
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins expiry
  
  // Save OTP code in OTP records table
  const existingOtpIndex = db.otps.findIndex(o => o.mobile === mobile);
  if (existingOtpIndex !== -1) {
    db.otps[existingOtpIndex] = {
      mobile,
      code: otpCode,
      expiresAt,
      attempts: 0
    };
  } else {
    db.otps.push({
      mobile,
      code: otpCode,
      expiresAt,
      attempts: 0
    });
  }
  
  writeDb(db);
  
  // Since we don't have a real gateway, we return the OTP in the response for development testing
  // But clearly separate it so it is a sandbox testing experience
  res.json({
    success: true,
    message: `OTP sent successfully via sandbox SMS simulator to ${mobile}.`,
    sandboxOtp: otpCode, // Exposed in API response ONLY for testing/demo purposes.
    expiresIn: '5 minutes'
  });
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { mobile, code, name } = req.body;
  if (!mobile || !code) {
    return res.status(400).json({ error: 'Mobile and OTP code are required' });
  }
  
  const db = readDb();
  const otpIndex = db.otps.findIndex(o => o.mobile === mobile);
  
  if (otpIndex === -1) {
    return res.status(400).json({ error: 'No OTP requested for this mobile number' });
  }
  
  const otpRecord = db.otps[otpIndex];
  
  if (Date.now() > otpRecord.expiresAt) {
    db.otps.splice(otpIndex, 1);
    writeDb(db);
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }
  
  if (otpRecord.attempts >= 5) {
    db.otps.splice(otpIndex, 1);
    writeDb(db);
    return res.status(400).json({ error: 'Too many incorrect OTP attempts. Please try again with a new OTP.' });
  }
  
  if (otpRecord.code !== code) {
    otpRecord.attempts += 1;
    writeDb(db);
    return res.status(400).json({ error: `Invalid OTP code. ${5 - otpRecord.attempts} attempts remaining.` });
  }
  
  // OTP is correct! Clear OTP
  db.otps.splice(otpIndex, 1);
  
  // Find or create user
  let user = db.users.find(u => u.mobile === mobile);
  if (!user) {
    user = {
      id: `user-${crypto.randomBytes(4).toString('hex')}`,
      name: name || 'Valued Customer',
      mobile,
      mobileVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.users.push(user);
  } else {
    user.mobileVerified = true;
    if (name) {
      user.name = name;
    }
    user.updatedAt = new Date().toISOString();
  }
  
  // Generate secure user session token
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions.push({
    token,
    userId: user.id,
    role: 'customer',
    createdAt: new Date().toISOString()
  });
  
  writeDb(db);
  
  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      mobile: user.mobile
    }
  });
});

// 5. ADMIN AUTHENTICATION
app.post('/api/auth/admin-login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  // Match secure credentials
  const targetEmail = 'gayathrirani6093@gmail.com';
  const targetPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (email.toLowerCase() !== targetEmail.toLowerCase() || password !== targetPassword) {
    return res.status(401).json({ error: 'Invalid Admin credentials' });
  }
  
  const db = readDb();
  let admin = db.admins.find(a => a.email.toLowerCase() === targetEmail.toLowerCase());
  
  if (!admin) {
    admin = {
      id: 'admin-1',
      email: targetEmail,
      role: 'super_admin',
      createdAt: new Date().toISOString()
    };
    db.admins.push(admin);
  }
  
  // Generate Admin session token
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions.push({
    token,
    userId: admin.id,
    role: 'admin',
    createdAt: new Date().toISOString()
  });
  
  writeDb(db);
  
  res.json({
    success: true,
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role
    }
  });
});

// Session profile retriever
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.substring(7);
  const db = readDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
  
  if (session.role === 'admin') {
    const admin = db.admins.find(a => a.id === session.userId);
    if (!admin) return res.status(401).json({ error: 'Admin account not found' });
    return res.json({ role: 'admin', admin });
  } else {
    const user = db.users.find(u => u.id === session.userId);
    if (!user) return res.status(401).json({ error: 'Customer account not found' });
    return res.json({ role: 'customer', user });
  }
});

// Edit profile
app.put('/api/auth/me', authenticate, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  
  const user = (req as any).user;
  const db = readDb();
  
  if (user.role === 'customer') {
    const uIndex = db.users.findIndex(u => u.id === user.id);
    if (uIndex !== -1) {
      db.users[uIndex].name = name;
      db.users[uIndex].updatedAt = new Date().toISOString();
      writeDb(db);
      return res.json({ success: true, user: db.users[uIndex] });
    }
  }
  
  res.status(400).json({ error: 'Invalid profile operation' });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const db = readDb();
    const sessionIndex = db.sessions.findIndex(s => s.token === token);
    if (sessionIndex !== -1) {
      db.sessions.splice(sessionIndex, 1);
      writeDb(db);
    }
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// 6. ADDRESS MANAGEMENT
app.get('/api/addresses', authenticate, (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'customer') {
    return res.status(403).json({ error: 'Customers only' });
  }
  
  const db = readDb();
  const customerAddresses = db.addresses.filter(a => a.customerId === user.id);
  res.json(customerAddresses);
});

app.post('/api/addresses', authenticate, (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'customer') {
    return res.status(403).json({ error: 'Customers only' });
  }
  
  const { address, landmark, city, state, pincode, latitude, longitude } = req.body;
  if (!address || !city || !state || !pincode) {
    return res.status(400).json({ error: 'Address, city, state, and pincode are required' });
  }
  
  const db = readDb();
  const newAddress: Address = {
    id: `addr-${crypto.randomBytes(4).toString('hex')}`,
    customerId: user.id,
    address,
    landmark: landmark || '',
    city,
    state,
    pincode,
    latitude: latitude !== undefined ? Number(latitude) : null,
    longitude: longitude !== undefined ? Number(longitude) : null,
    createdAt: new Date().toISOString()
  };
  
  db.addresses.push(newAddress);
  writeDb(db);
  res.status(201).json(newAddress);
});

app.put('/api/addresses/:id', authenticate, (req, res) => {
  const user = (req as any).user;
  const db = readDb();
  const index = db.addresses.findIndex(a => a.id === req.params.id && a.customerId === user.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Address not found or unauthorized' });
  }
  
  db.addresses[index] = {
    ...db.addresses[index],
    ...req.body
  };
  writeDb(db);
  res.json(db.addresses[index]);
});

app.delete('/api/addresses/:id', authenticate, (req, res) => {
  const user = (req as any).user;
  const db = readDb();
  const index = db.addresses.findIndex(a => a.id === req.params.id && a.customerId === user.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Address not found or unauthorized' });
  }
  
  db.addresses.splice(index, 1);
  writeDb(db);
  res.json({ success: true, message: 'Address deleted successfully' });
});

// 7. ORDER OPERATIONS AND SECURE PAYMENTS

// Secure backend validator helper to prevent price / discount spoofing
function calculateValidatedAmount(items: any[], couponCode?: string) {
  const db = readDb();
  
  // 1. Calculate subtotal using prices from database directly
  let subtotal = 0;
  const validatedItems = items.map(item => {
    const dbMeal = db.meals.find(m => m.id === item.id);
    if (!dbMeal) {
      throw new Error(`Meal recipe "${item.name}" not found in our catalog.`);
    }
    if (dbMeal.availability === 'Sold Out') {
      throw new Error(`Recipe item "${dbMeal.name}" is currently sold out.`);
    }
    const price = dbMeal.price;
    subtotal += price * item.quantity;
    return {
      id: dbMeal.id,
      name: dbMeal.name,
      price: price,
      quantity: Number(item.quantity)
    };
  });

  // 2. Fixed delivery charge from restaurant configurations
  const deliveryCharge = db.settings.deliveryCharge;

  // 3. Discount calculation from database
  let discount = 0;
  if (couponCode) {
    const coupon = db.coupons.find(c => c.code.toUpperCase() === couponCode.toUpperCase() && c.active);
    if (coupon) {
      const nowStr = new Date().toISOString().slice(0, 10);
      if (nowStr >= coupon.startDate && nowStr <= coupon.endDate && coupon.usedCount < coupon.usageLimit) {
        if (subtotal >= coupon.minimumOrder) {
          if (coupon.discountType === 'percentage') {
            discount = Math.round((subtotal * coupon.discountValue) / 100);
            if (discount > coupon.maximumDiscount) {
              discount = coupon.maximumDiscount;
            }
          } else {
            discount = coupon.discountValue;
          }
        }
      }
    }
  }

  const total = Math.max((subtotal + deliveryCharge) - discount, 0);

  return {
    items: validatedItems,
    subtotal,
    deliveryCharge,
    discount,
    total
  };
}

// SECURE ONLINE PAYMENT ORDER CREATION ON BACKEND
app.post('/api/payments/create-order', authenticate, async (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'customer') {
    return res.status(403).json({ error: 'Customers only can checkout' });
  }

  const { items, couponCode } = req.body;
  if (!items || !items.length) {
    return res.status(400).json({ error: 'Order items are required' });
  }

  try {
    const validation = calculateValidatedAmount(items, couponCode);
    
    let rzpOrderId = '';
    let isSimulated = false;

    const rzpKeyId = process.env.RAZORPAY_KEY_ID || '';
    const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

    if (!rzpKeyId || rzpKeyId === 'rzp_test_placeholderKeyId' || !rzpKeySecret || rzpKeySecret === 'rzp_test_placeholderKeySecret') {
      isSimulated = true;
      rzpOrderId = `order_sim_${crypto.randomBytes(8).toString('hex')}`;
    } else {
      // Use REAL Razorpay.
      // Do NOT silently catch and fallback to simulation because doing so is a security risk in production if credentials fail!
      const rzpOrder = await razorpay.orders.create({
        amount: Math.round(validation.total * 100), // convert rupees to paise
        currency: 'INR',
        receipt: `receipt_${crypto.randomBytes(4).toString('hex')}`
      });
      rzpOrderId = rzpOrder.id;
    }

    res.json({
      success: true,
      rzpOrderId,
      isSimulated,
      keyId: isSimulated ? 'rzp_test_placeholderKeyId' : rzpKeyId,
      amount: validation.total,
      subtotal: validation.subtotal,
      deliveryCharge: validation.deliveryCharge,
      discount: validation.discount,
      items: validation.items
    });
  } catch (err: any) {
    console.error('Razorpay Order Creation Failure:', err);
    if (err.error) {
      // If Razorpay SDK threw a specific API error, return that error object directly
      return res.status(err.statusCode || 400).json({ error: err.error });
    }
    res.status(500).json({ error: err.message || 'Razorpay order creation failed.' });
  }
});

// SECURE ONLINE PAYMENT SIGNATURE VERIFICATION AND ORDER CONFIRMATION
app.post('/api/payments/verify', authenticate, (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'customer') {
    return res.status(403).json({ error: 'Customers only can verify payments' });
  }

  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderDetails } = req.body;
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !orderDetails) {
    return res.status(400).json({ error: 'Missing Razorpay signature verification parameters.' });
  }

  const isSimulated = razorpay_order_id.startsWith('order_sim_');

  if (isSimulated) {
    const expected_signature = 'sim_sig_' + razorpay_order_id + '_' + razorpay_payment_id;
    if (expected_signature !== razorpay_signature) {
      return res.status(400).json({ error: 'Security Warning: Simulated payment signature verification failed.' });
    }
  } else {
    // 1. Verify signatures using server secret key
    const key_secret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_placeholderKeySecret';
    const expected_signature = crypto
      .createHmac('sha256', key_secret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (expected_signature !== razorpay_signature) {
      return res.status(400).json({ error: 'Security Warning: Payment signature verification failed. Untrusted checkout amount.' });
    }
  }

  const db = readDb();
  const customer = db.users.find(u => u.id === user.id);
  if (!customer) {
    return res.status(401).json({ error: 'Customer profile not found' });
  }

  // Prevent duplicate order creation / double processing
  const orderExists = db.payments.some(p => p.transactionId === razorpay_payment_id);
  if (orderExists) {
    return res.status(400).json({ error: 'This payment transaction has already been processed.' });
  }

  // Calculate & validate the amount again securely on the backend
  let valDetails;
  try {
    valDetails = calculateValidatedAmount(orderDetails.items, orderDetails.couponCode);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  // Generate unique Order ID
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const dailyCount = db.orders.filter(o => o.createdAt.startsWith(new Date().toISOString().slice(0, 10))).length + 1;
  const orderNumStr = String(dailyCount).padStart(4, '0');
  const orderNumber = `MIR-${todayStr}-${orderNumStr}`;

  const newOrder: Order = {
    id: `order-${crypto.randomBytes(6).toString('hex')}`,
    orderNumber,
    customerId: user.id,
    customerName: customer.name,
    mobile: customer.mobile,
    items: valDetails.items,
    subtotal: valDetails.subtotal,
    deliveryCharge: valDetails.deliveryCharge,
    discount: valDetails.discount,
    total: valDetails.total,
    paymentMethod: 'UPI', // UPI represents our online gateway payment
    paymentStatus: 'Successful', // Online verified payment is successfully paid
    orderStatus: 'Accepted', // Accepted immediately upon checkout payment success
    address: orderDetails.address,
    latitude: orderDetails.latitude !== undefined ? Number(orderDetails.latitude) : null,
    longitude: orderDetails.longitude !== undefined ? Number(orderDetails.longitude) : null,
    estimatedDeliveryTime: '30–40 mins',
    transactionId: razorpay_payment_id,
    firebaseUid: orderDetails.firebaseUid || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.orders.push(newOrder);

  // Store payment logs
  const newPayment: Payment = {
    id: `pay-${crypto.randomBytes(6).toString('hex')}`,
    orderId: newOrder.id,
    paymentMethod: 'UPI',
    amount: newOrder.total,
    status: 'Successful',
    transactionId: razorpay_payment_id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.payments.push(newPayment);

  // Increment coupon usage
  if (orderDetails.couponCode) {
    const couponIndex = db.coupons.findIndex(c => c.code.toUpperCase() === orderDetails.couponCode.toUpperCase());
    if (couponIndex !== -1) {
      db.coupons[couponIndex].usedCount += 1;
    }
  }

  writeDb(db);
  res.status(201).json(newOrder);
});

// GET orders list
app.get('/api/orders', authenticate, (req, res) => {
  const user = (req as any).user;
  const db = readDb();
  
  if (user.role === 'admin') {
    res.json(db.orders);
  } else {
    const customerOrders = db.orders.filter(o => o.customerId === user.id);
    res.json(customerOrders);
  }
});

// GET order by ID
app.get('/api/orders/:id', authenticate, (req, res) => {
  const user = (req as any).user;
  const db = readDb();
  const order = db.orders.find(o => o.id === req.params.id);
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  if (user.role !== 'admin' && order.customerId !== user.id) {
    return res.status(403).json({ error: 'Forbidden: Access denied to this order' });
  }
  
  res.json(order);
});

// COD PLACE ORDER (Standard Cash on Delivery checkout)
app.post('/api/orders', authenticate, (req, res) => {
  const user = (req as any).user;
  if (user.role !== 'customer') {
    return res.status(403).json({ error: 'Customers only can place orders' });
  }
  
  const { items, address, latitude, longitude, couponCode, firebaseUid } = req.body;
  if (!items || !items.length || !address) {
    return res.status(400).json({ error: 'Missing order items or delivery address' });
  }

  const db = readDb();
  const customer = db.users.find(u => u.id === user.id);
  if (!customer) {
    return res.status(401).json({ error: 'Customer profile not found' });
  }
  
  if (db.settings.restaurantStatus === 'Closed') {
    return res.status(400).json({ error: `${db.settings.name} is currently closed. Please order during our business hours (${db.settings.openingTime} - ${db.settings.closingTime}).` });
  }

  // Calculate & Validate amount on backend
  let valDetails;
  try {
    valDetails = calculateValidatedAmount(items, couponCode);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  // Increment coupon usage
  if (couponCode) {
    const couponIndex = db.coupons.findIndex(c => c.code.toUpperCase() === couponCode.toUpperCase());
    if (couponIndex !== -1) {
      db.coupons[couponIndex].usedCount += 1;
    }
  }
  
  // Generate unique Order ID MIR-20260923-0001
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const dailyCount = db.orders.filter(o => o.createdAt.startsWith(new Date().toISOString().slice(0, 10))).length + 1;
  const orderNumStr = String(dailyCount).padStart(4, '0');
  const orderNumber = `MIR-${todayStr}-${orderNumStr}`;
  
  const newOrder: Order = {
    id: `order-${crypto.randomBytes(6).toString('hex')}`,
    orderNumber,
    customerId: user.id,
    customerName: customer.name,
    mobile: customer.mobile,
    items: valDetails.items,
    subtotal: valDetails.subtotal,
    deliveryCharge: valDetails.deliveryCharge,
    discount: valDetails.discount,
    total: valDetails.total,
    paymentMethod: 'Cash on Delivery',
    paymentStatus: 'Pending', // Default COD paymentStatus is Pending
    orderStatus: 'Order Placed',
    address,
    latitude: latitude !== undefined ? Number(latitude) : null,
    longitude: longitude !== undefined ? Number(longitude) : null,
    estimatedDeliveryTime: '30–40 mins',
    firebaseUid: firebaseUid || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  db.orders.push(newOrder);
  
  // Store payment log
  const newPayment: Payment = {
    id: `pay-${crypto.randomBytes(6).toString('hex')}`,
    orderId: newOrder.id,
    paymentMethod: 'Cash on Delivery',
    amount: newOrder.total,
    status: 'Pending',
    transactionId: 'N/A',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.payments.push(newPayment);
  
  writeDb(db);
  res.status(201).json(newOrder);
});

// Update Order Status (Admin)
app.put('/api/orders/:id/status', authenticate, requireAdmin, (req, res) => {
  const { orderStatus, paymentStatus, estimatedDeliveryTime, riderFirebaseUid } = req.body;
  const db = readDb();
  const orderIndex = db.orders.findIndex(o => o.id === req.params.id);
  
  if (orderIndex === -1) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  const order = db.orders[orderIndex];
  if (orderStatus) order.orderStatus = orderStatus;
  if (paymentStatus) order.paymentStatus = paymentStatus;
  if (estimatedDeliveryTime) order.estimatedDeliveryTime = estimatedDeliveryTime;
  if (riderFirebaseUid !== undefined) order.riderFirebaseUid = riderFirebaseUid;
  order.updatedAt = new Date().toISOString();
  
  // Sync in payments
  const payIndex = db.payments.findIndex(p => p.orderId === order.id);
  if (payIndex !== -1 && paymentStatus) {
    db.payments[payIndex].status = paymentStatus;
    db.payments[payIndex].updatedAt = new Date().toISOString();
  }
  
  writeDb(db);
  res.json(order);
});

// 8. ADMIN DASHBOARD METRICS AND SALES ANALYTICS
app.get('/api/admin/stats', authenticate, requireAdmin, (req, res) => {
  const db = readDb();
  const orders = db.orders;
  
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter(o => o.createdAt.startsWith(todayStr));
  
  const totalRevenue = orders
    .filter(o => o.paymentStatus === 'Successful')
    .reduce((sum, o) => sum + o.total, 0);
    
  const todayRevenue = todayOrders
    .filter(o => o.paymentStatus === 'Successful')
    .reduce((sum, o) => sum + o.total, 0);
  
  const stats = {
    totalOrders: orders.length,
    todayOrders: todayOrders.length,
    pending: orders.filter(o => o.orderStatus === 'Order Placed').length,
    accepted: orders.filter(o => o.orderStatus === 'Accepted').length,
    preparing: orders.filter(o => o.orderStatus === 'Preparing').length,
    ready: orders.filter(o => o.orderStatus === 'Ready').length,
    outForDelivery: orders.filter(o => o.orderStatus === 'Out for Delivery').length,
    delivered: orders.filter(o => o.orderStatus === 'Delivered').length,
    cancelled: orders.filter(o => o.orderStatus === 'Cancelled').length,
    totalRevenue,
    todayRevenue,
    totalCustomers: db.users.length,
    averageOrderValue: orders.length ? Math.round(totalRevenue / orders.filter(o => o.paymentStatus === 'Successful').length || 1) : 0
  };
  
  // Calculate daily, weekly, monthly charts data
  const revenueByDate: Record<string, number> = {};
  const ordersByDate: Record<string, number> = {};
  
  orders.forEach(o => {
    const d = o.createdAt.slice(0, 10);
    ordersByDate[d] = (ordersByDate[d] || 0) + 1;
    if (o.paymentStatus === 'Successful') {
      revenueByDate[d] = (revenueByDate[d] || 0) + o.total;
    }
  });
  
  // Most ordered items
  const itemCounts: Record<string, { name: string; quantity: number; revenue: number }> = {};
  orders.forEach(o => {
    o.items.forEach(item => {
      if (!itemCounts[item.id]) {
        itemCounts[item.id] = { name: item.name, quantity: 0, revenue: 0 };
      }
      itemCounts[item.id].quantity += item.quantity;
      if (o.paymentStatus === 'Successful') {
        itemCounts[item.id].revenue += item.price * item.quantity;
      }
    });
  });
  
  const popularMeals = Object.values(itemCounts).sort((a, b) => b.quantity - a.quantity);
  
  // Payments breakdown
  const paymentBreakdown = {
    cod: orders.filter(o => o.paymentMethod === 'Cash on Delivery').length,
    online: orders.filter(o => o.paymentMethod === 'UPI').length,
    codRevenue: orders.filter(o => o.paymentMethod === 'Cash on Delivery' && o.paymentStatus === 'Successful').reduce((sum, o) => sum + o.total, 0),
    onlineRevenue: orders.filter(o => o.paymentMethod === 'UPI' && o.paymentStatus === 'Successful').reduce((sum, o) => sum + o.total, 0),
  };
  
  res.json({
    stats,
    charts: {
      revenueByDate,
      ordersByDate,
      popularMeals,
      paymentBreakdown
    }
  });
});

// 9. ADMIN CUSTOMER DIRECTORY
app.get('/api/admin/customers', authenticate, requireAdmin, (req, res) => {
  const db = readDb();
  const orders = db.orders;
  
  const customerList = db.users.map(user => {
    const userOrders = orders.filter(o => o.customerId === user.id);
    const completedOrders = userOrders.filter(o => o.paymentStatus === 'Successful');
    const spent = completedOrders.reduce((sum, o) => sum + o.total, 0);
    const lastOrder = userOrders.length ? userOrders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt : null;
    
    return {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      orderCount: userOrders.length,
      totalSpent: spent,
      lastOrderDate: lastOrder,
      createdAt: user.createdAt
    };
  });
  
  res.json(customerList);
});


// Serve Static Assets and run Dev Server Setup
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(path.resolve(process.cwd(), 'dist'));
  
  if (!isProd) {
    console.log('Starting Mana Inti Ruchulu server in DEVELOPMENT mode...');
    
    // Create Vite server in middleware mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    
    // Use vite's connect instance as middleware
    app.use(vite.middlewares);
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Development server running at http://localhost:${PORT}/`);
      console.log(`Test Super Admin Login credentials:`);
      console.log(`- Email: gayathrirani6093@gmail.com`);
      console.log(`- Password: [value of ADMIN_PASSWORD env var or 'admin123' if not set]`);
    });
  } else {
    console.log('Starting Mana Inti Ruchulu server in PRODUCTION mode...');
    
    // Serve client build output directory
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Serve index.html for all SPA routes
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Production server running on port ${PORT}`);
    });
  }
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
