import { Meal, Order, Address, Coupon, RestaurantSettings, User, Admin, Review } from './types';

const API_BASE = '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('mir_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const api = {
  // Settings
  getSettings: async (): Promise<RestaurantSettings> => {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Failed to load settings');
    return res.json();
  },
  updateSettings: async (settings: Partial<RestaurantSettings>): Promise<RestaurantSettings> => {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update settings');
    }
    return res.json();
  },

  // Meals
  getMeals: async (): Promise<Meal[]> => {
    const res = await fetch(`${API_BASE}/meals`);
    if (!res.ok) throw new Error('Failed to load meals');
    return res.json();
  },
  createMeal: async (meal: Partial<Meal>): Promise<Meal> => {
    const res = await fetch(`${API_BASE}/meals`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(meal)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create meal');
    }
    return res.json();
  },
  updateMeal: async (id: string, meal: Partial<Meal>): Promise<Meal> => {
    const res = await fetch(`${API_BASE}/meals/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(meal)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update meal');
    }
    return res.json();
  },
  deleteMeal: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/meals/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete meal');
    }
  },

  // Coupons
  getCoupons: async (): Promise<Coupon[]> => {
    const res = await fetch(`${API_BASE}/coupons`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load coupons');
    return res.json();
  },
  createCoupon: async (coupon: Partial<Coupon>): Promise<Coupon> => {
    const res = await fetch(`${API_BASE}/coupons`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(coupon)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create coupon');
    }
    return res.json();
  },
  updateCoupon: async (id: string, coupon: Partial<Coupon>): Promise<Coupon> => {
    const res = await fetch(`${API_BASE}/coupons/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(coupon)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update coupon');
    }
    return res.json();
  },
  deleteCoupon: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/coupons/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete coupon');
    }
  },
  validateCoupon: async (code: string, subtotal: number): Promise<{ code: string; discount: number }> => {
    const res = await fetch(`${API_BASE}/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Invalid coupon code');
    }
    return res.json();
  },

  // Customer Authentication (OTP)
  sendOtp: async (mobile: string, name: string): Promise<{ success: boolean; sandboxOtp?: string; message: string }> => {
    const res = await fetch(`${API_BASE}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, name })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to send OTP');
    }
    return res.json();
  },
  verifyOtp: async (mobile: string, code: string, name: string): Promise<{ success: boolean; token: string; user: User }> => {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, code, name })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Invalid OTP code');
    }
    return res.json();
  },

  // Admin Authentication
  adminLogin: async (email: string, password: string): Promise<{ success: boolean; token: string; admin: Admin }> => {
    const res = await fetch(`${API_BASE}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Invalid admin credentials');
    }
    return res.json();
  },

  // Session profile loader
  getMe: async (): Promise<{ role: 'customer' | 'admin'; user?: User; admin?: Admin }> => {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Unauthenticated');
    return res.json();
  },
  updateProfile: async (name: string): Promise<{ success: boolean; user: User }> => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update profile');
    }
    return res.json();
  },
  logout: async (): Promise<void> => {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: getAuthHeaders() });
    localStorage.removeItem('mir_token');
  },

  // Addresses
  getAddresses: async (): Promise<Address[]> => {
    const res = await fetch(`${API_BASE}/addresses`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load addresses');
    return res.json();
  },
  saveAddress: async (address: Partial<Address>): Promise<Address> => {
    const res = await fetch(`${API_BASE}/addresses`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(address)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save address');
    }
    return res.json();
  },
  updateAddress: async (id: string, address: Partial<Address>): Promise<Address> => {
    const res = await fetch(`${API_BASE}/addresses/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(address)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update address');
    }
    return res.json();
  },
  deleteAddress: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/addresses/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete address');
    }
  },

  // Orders
  getOrders: async (): Promise<Order[]> => {
    const res = await fetch(`${API_BASE}/orders`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load orders');
    return res.json();
  },
  getOrderById: async (id: string): Promise<Order> => {
    const res = await fetch(`${API_BASE}/orders/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load order');
    return res.json();
  },
  createOrder: async (order: Partial<Order> & { couponCode?: string }): Promise<Order> => {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(order)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to place order');
    }
    return res.json();
  },
  updateOrderStatus: async (id: string, status: { orderStatus?: string; paymentStatus?: string; estimatedDeliveryTime?: string; riderFirebaseUid?: string | null }): Promise<Order> => {
    const res = await fetch(`${API_BASE}/orders/${id}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(status)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update order status');
    }
    return res.json();
  },

  // Payment Gateway integrations
  createPaymentOrder: async (items: any[], couponCode?: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/payments/create-order`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ items, couponCode })
    });
    if (!res.ok) {
      const err = await res.json();
      const errMsg = typeof err.error === 'object' && err.error?.description
        ? err.error.description
        : (typeof err.error === 'string' ? err.error : 'Failed to create payment order');
      throw new Error(errMsg);
    }
    return res.json();
  },
  verifyPayment: async (paymentData: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string; orderDetails: any }): Promise<Order> => {
    const res = await fetch(`${API_BASE}/payments/verify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(paymentData)
    });
    if (!res.ok) {
      const err = await res.json();
      const errMsg = typeof err.error === 'object' && err.error?.description
        ? err.error.description
        : (typeof err.error === 'string' ? err.error : 'Failed to verify online payment with server');
      throw new Error(errMsg);
    }
    return res.json();
  },

  // Admin Stats & Directory
  getAdminStats: async (): Promise<any> => {
    const res = await fetch(`${API_BASE}/admin/stats`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load admin statistics');
    return res.json();
  },
  getAdminCustomers: async (): Promise<any[]> => {
    const res = await fetch(`${API_BASE}/admin/customers`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load customer list');
    return res.json();
  },

  // Reviews & Ratings
  submitReview: async (reviewData: { orderId: string; mealId: string; rating: number; feedback?: string }): Promise<Review> => {
    const res = await fetch(`${API_BASE}/reviews`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(reviewData)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to submit review');
    }
    return res.json();
  },
  getMealReviews: async (mealId: string): Promise<Review[]> => {
    const res = await fetch(`${API_BASE}/meals/${mealId}/reviews`);
    if (!res.ok) throw new Error('Failed to load meal reviews');
    return res.json();
  },
  getMyReviews: async (): Promise<Review[]> => {
    const res = await fetch(`${API_BASE}/reviews/me`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load my reviews');
    return res.json();
  }
};
