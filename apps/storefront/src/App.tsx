import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { StoreShell } from "@/components/store-shell";
import { LoginPage, RegisterPage } from "@/pages/auth";
import { CartPage } from "@/pages/cart";
import { CatalogPage } from "@/pages/catalog";
import { CheckoutPage } from "@/pages/checkout";
import { OrderDetailPage } from "@/pages/order-detail";
import { OrdersPage } from "@/pages/orders";
import { ProductPage } from "@/pages/product";
import { ProfilePage } from "@/pages/profile";
import { RuleShopProvider } from "@/sdk/RuleShopProvider";

export function App() {
  return (
    <RuleShopProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<StoreShell />}>
            <Route index element={<CatalogPage />} />
            <Route path="products/:productSlug" element={<ProductPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:orderId" element={<OrderDetailPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </RuleShopProvider>
  );
}
