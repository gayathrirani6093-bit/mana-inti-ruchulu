export interface User {
  id: string;
  name: string;
  mobile: string;
  mobileVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Admin {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface Meal {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  availability: 'Available' | 'Sold Out';
  preparationTime: string;
  isSpecial: boolean;
  discount: number;
  rating?: number;
  reviewsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
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

export interface Address {
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

export interface Coupon {
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

export interface RestaurantSettings {
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

export interface Payment {
  id: string;
  orderId: string;
  paymentMethod: string;
  amount: number;
  status: string;
  transactionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
}

export interface Review {
  id: string;
  mealId: string;
  orderId: string;
  customerId: string;
  customerName: string;
  rating: number; // 1-5
  feedback: string;
  createdAt: string;
}
