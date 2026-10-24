import { createBrowserRouter, Navigate } from "react-router";
import AdminLayout from "./layouts/AdminLayout";
import CashierLayout from "./layouts/CashierLayout";
import OwnerLayout from "./layouts/OwnerLayout";

import AdminDashboard from "./pages/admin/Dashboard";
import AdminOrders from "./pages/admin/Orders";
import StaffDining from "./pages/StaffDining";
import AdminInventory from "./pages/admin/Inventory";
import AdminSales from "./pages/admin/Sales";
import AdminProfile from "./pages/admin/Profile";

import CashierOrders from "./pages/cashier/Orders";
import CashierInventory from "./pages/cashier/Inventory";
import CashierProfile from "./pages/cashier/Profile";

import OwnerDashboard from "./pages/owner/Dashboard";
import OwnerSales from "./pages/owner/Sales";
import OwnerProfile from "./pages/owner/Profile";

import CustomerPaxInput from "./pages/customer/PaxInput";
import CustomerMenu from "./pages/customer/Menu";
import CustomerCart from "./pages/customer/Cart";
import CustomerBillTracker from "./pages/customer/BillTracker";

import KitchenDashboard from "./pages/kitchen/Dashboard";
import StaffProfile from './pages/StaffProfile';
import StaffGate from './components/StaffGate';

import Home from "./pages/Home";
import AdminLogin from "./pages/auth/AdminLogin";
import AdminRegister from "./pages/auth/AdminRegister";
import CashierLogin from "./pages/auth/CashierLogin";
import OwnerLogin from "./pages/auth/OwnerLogin";
import KitchenLogin from "./pages/auth/KitchenLogin";

export const router = createBrowserRouter([
  { path: "/", Component: Home },

  // Cashier routes
  { path: "/cashier/login", Component: CashierLogin },
  {
    path: "/cashier",
    Component: CashierLayout,
    children: [
      { index: true, Component: CashierOrders },
      { path: "orders", Component: CashierOrders },
      { path: "billing", Component: StaffDining },
      { path: "inventory", Component: CashierInventory },
      { path: "qr-tables", element: <Navigate to="/cashier/billing" replace /> },
      { path: "profile", Component: CashierProfile },
    ],
  },

  // Owner routes
  { path: "/owner/login", Component: OwnerLogin },
  {
    path: "/owner",
    Component: OwnerLayout,
    children: [
      { index: true, Component: OwnerDashboard },
      { path: "sales", Component: OwnerSales },
      { path: "profile", Component: OwnerProfile },
    ],
  },

  // Kitchen routes
  { path: "/kitchen/login", Component: KitchenLogin },
  { path: "/kitchen", Component: () => <StaffGate><KitchenDashboard /></StaffGate> },

  { path: "/kitchen/profile", Component: () => <StaffGate><StaffProfile /></StaffGate> },

  // Customer routes
  { path: "/customer/:tableId", Component: CustomerPaxInput },
  { path: "/customer/:tableId/menu", Component: CustomerMenu },
  { path: "/customer/:tableId/cart", Component: CustomerCart },
  { path: "/customer/:tableId/bill", Component: CustomerBillTracker },

  // Legacy admin routes (kept for compatibility)
  { path: "/admin/login", Component: AdminLogin },
  { path: "/admin/register", Component: AdminRegister },
  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { index: true, Component: AdminDashboard },
      { path: "orders", Component: AdminOrders },
      { path: "billing", Component: StaffDining },
      { path: "inventory", Component: AdminInventory },
      { path: "sales", Component: AdminSales },
      { path: "qr-tables", element: <Navigate to="/admin/billing" replace /> },
      { path: "profile", Component: AdminProfile },
    ],
  },
]);
